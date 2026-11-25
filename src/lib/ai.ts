// Server only: Sarvam (REST) + Claude calls. Never import from client components.
import { APICallError, generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output, RetryError, streamText, type ModelMessage, type UserContent } from "ai";
import { z } from "zod";
import { CLAUDE_FAST_MODEL, CLAUDE_MODEL, claudeModel } from "./agent/model.ts";
import type { KccResult, Season } from "./kcc.ts";
import { LANGUAGES, langName } from "./i18n.ts";
import {
  aadhaarLast4,
  chunkText,
  maskAadhaar,
  overclaimQuestion,
  seasonOverclaims,
  toHectare,
  unknownFigures,
  type AreaUnit,
} from "./ai-pure.ts";
import { reconcileLand, type RawLand } from "./reconcile.ts";
import { h1Fetch } from "./h1-fetch.ts";

const TIMEOUT_MS = 20_000; // standalone Sarvam calls (translate, tts)
const BUDGET_MS = 20_000; // SC-008: an extraction or one note draft answers or fails within 20 s end to end
const FOLLOWUP_RESERVE_MS = 3_000; // held back from the main calls for translating follow-ups
const OCR_POLL_MS = 500;
const by = (deadline: number) => AbortSignal.timeout(Math.max(1, deadline - Date.now()));
const within = (ms: number, signal?: AbortSignal) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));
const SARVAM = "https://api.sarvam.ai";
const SEASONS = ["kharif", "rabi", "zaid", "annual"] as const satisfies readonly Season[];
const UNITS = ["hectare", "acre", "bigha"] as const satisfies readonly AreaUnit[];

export class AiError extends Error {
  constructor(message: string, public status: 400 | 404 | 502 | 503 | 504, public retryable: boolean) {
    super(message);
  }
}

export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (RetryError.isInstance(e)) return toAiError(e.lastError);
  if (APICallError.isInstance(e)) return new AiError(`Claude error ${e.statusCode ?? ""}`.trim(), 502, e.isRetryable || e.statusCode == null || e.statusCode === 429 || e.statusCode >= 500);
  if (NoObjectGeneratedError.isInstance(e) || NoOutputGeneratedError.isInstance(e)) return new AiError("Claude returned no usable answer", 502, true);
  const name = (e as Error)?.name;
  if (name === "TimeoutError" || name === "AbortError") return new AiError("AI provider timed out", 504, true);
  return new AiError(`AI provider error: ${(e as Error)?.message ?? e}`, 502, true);
}

const isCore = (code: string) => LANGUAGES.some((l) => l.code === code && l.core);

async function sarvam<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new AiError("AI not configured", 503, false);
  const res = await h1Fetch(SARVAM + path, {
    ...init,
    headers: { "api-subscription-key": key, ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e) => Promise.reject(toAiError(e)));
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    throw new AiError(`Sarvam ${path.split("/").slice(0, 3).join("/")} ${res.status}: ${body}`, 502, res.status === 429 || res.status >= 500);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Saaras v4 STT. mode "translate" always returns English. `lang` omitted = auto-detect. */
export async function stt(audio: Blob, mode: "transcribe" | "translate", lang?: string, keyterms: string[] = [], signal?: AbortSignal) {
  const f = new FormData();
  // Sarvam rejects codec params like "audio/webm;codecs=opus"; send the bare MIME type.
  const type = audio.type.split(";")[0] || "audio/webm";
  f.append("file", new Blob([audio], { type }), (audio as File).name || `audio.${type.split("/")[1] ?? "webm"}`);
  f.append("model", "saaras:v4");
  f.append("mode", mode);
  if (lang) f.append("language_code", lang);
  if (keyterms.length) f.append("keyterms", JSON.stringify(keyterms.slice(0, 50)));
  const r = await sarvam<{ transcript: string; language_code?: string }>("/speech-to-text", { method: "POST", body: f, signal });
  return { text: r.transcript ?? "", lang: r.language_code, models: ["saaras:v4"] };
}

/** Mayura for the 11 core languages (<= 1000 chars per call), Sarvam-Translate for the rest (<= 2000). */
export async function translate(text: string, from: string, to: string, signal?: AbortSignal) {
  if (!text.trim() || from === to) return { text, models: [] as string[] };
  const mayura = (from === "auto" || isCore(from)) && isCore(to);
  if (!mayura && from === "auto") throw new AiError("Source language required for this target language", 400, false);
  const model = mayura ? "mayura:v1" : "sarvam-translate:v1";
  const out = await Promise.all(
    chunkText(text, mayura ? 1000 : 2000).map((input) =>
      sarvam<{ translated_text: string }>("/translate", {
        ...json({
          input,
          source_language_code: from,
          target_language_code: to,
          model,
          mode: "formal",
          ...(mayura ? { numerals_format: "international" } : {}),
        }),
        signal,
      }),
    ),
  );
  return { text: out.map((r) => r.translated_text).join(" "), models: [model] };
}

/** Bulbul v3 TTS, base64 WAV. Bulbul covers the 11 core languages only. */
export async function tts(text: string, lang: string) {
  if (!isCore(lang)) throw new AiError(`Speech not available for ${langName(lang)}`, 400, false);
  const r = await sarvam<{ audios: string[] }>("/text-to-speech", json({ text, language_code: lang, model: "bulbul:v3", speaker: "shubh" }));
  return { audio: r.audios[0], models: ["bulbul:v3"] };
}

/** Sarvam Vision parse job (async): submit, poll, fetch results; whole thing bounded by `signal`. */
export async function sarvamOcr(image: Blob, signal = AbortSignal.timeout(TIMEOUT_MS)): Promise<string> {
  const f = new FormData();
  f.append("file", image, (image as File).name || "land-record.jpg");
  f.append("language", "hi-IN");
  f.append("output_format", "md");
  const { job_id } = await sarvam<{ job_id: string }>("/doc-ai/v1/job/parse", { method: "POST", body: f, signal });
  for (;;) {
    await new Promise((r) => setTimeout(r, OCR_POLL_MS));
    if (signal.aborted) throw new AiError("Sarvam Vision timed out", 504, true);
    const { status } = await sarvam<{ status: string }>(`/doc-ai/v1/job/${job_id}/status`, { signal });
    const s = status.toLowerCase();
    if (s === "failed" || s === "rejected") throw new AiError(`Sarvam Vision job ${s}`, 502, false);
    if (s === "completed" || s === "partially_completed") break;
  }
  type Page = { content?: string; blocks?: { text?: string; reading_order?: number }[] };
  const r = await sarvam<{ documents?: { pages?: Page[] }[] }>(`/doc-ai/v1/job/${job_id}/results`, { signal });
  const pageText = (p: Page) => p.content ?? [...(p.blocks ?? [])].sort((a, b) => (a.reading_order ?? 0) - (b.reading_order ?? 0)).map((b) => b.text ?? "").join("\n\n");
  return (r.documents ?? []).flatMap((d) => (d.pages ?? []).map(pageText)).join("\n\n");
}

function claude(id?: string) {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiError("AI not configured", 503, false);
  return claudeModel(id);
}

type Content = string | UserContent;

type CallOpts = { model?: string; signal?: AbortSignal };

/** One Claude call with a schema-constrained answer. Returns parsed data and the model that served it. */
export async function claudeJson<T>(system: string, messages: ModelMessage[], schema: z.ZodType<T>, { model = CLAUDE_MODEL, signal }: CallOpts = {}) {
  try {
    const r = await generateText({
      model: claude(model),
      system,
      messages,
      output: Output.object({ schema }),
      maxOutputTokens: 2000, // extractor answers are ~300 tokens; caps a runaway inside the budget
      maxRetries: 0,
      abortSignal: signal ?? AbortSignal.timeout(BUDGET_MS),
      providerOptions: { anthropic: { effort: "low", fallbacks: "default" } },
    });
    if (r.finishReason === "content-filter") throw new AiError("Claude declined the request", 502, false);
    if (r.finishReason === "length") throw new AiError("Claude response truncated", 502, true);
    return { data: r.output as T, model: r.response.modelId };
  } catch (e) {
    throw toAiError(e);
  }
}

const user = (content: Content): ModelMessage[] => [{ role: "user", content }];
const nul = <S extends z.ZodType>(s: S) => s.nullable();

async function inOfficerLang(questions: string[], officerLang: string, signal?: AbortSignal) {
  if (!questions.length || officerLang === "en-IN") return { list: questions, models: [] as string[] };
  const r = await Promise.all(questions.map((q) => translate(q, "en-IN", officerLang, signal)));
  return { list: r.map((x) => x.text), models: r[0].models };
}

const uniq = (a: string[]) => [...new Set(a.filter(Boolean))];

// ---- land ----

const LAND_SYSTEM = `You read Indian land records (B1 / Khasra / Khatauni / 7-12 / Pahani / Patta) for a bank officer.
Extract only what is written; never guess. Return:
- ownerName, village: as written (keep the original script); empty string if absent.
- surveyNos: every survey / khasra number for this owner.
- area: total area of this owner's holding as a number, and areaUnit as written: hectare, acre or bigha. If the record uses hectare and are (e.g. 1.20 he.are), give hectares. null if unreadable.
- bighaHa: if the record itself states how many hectares one bigha is (e.g. "1 bigha = 0.25 he."), that number; else null.
- aadhaar: only the last 4 digits if an Aadhaar number is printed, else null. Never output more than 4 digits.
- confidence: 0 to 1 for area and ownerName.
- followUps: short English questions for the officer about anything missing, unclear or conflicting (e.g. joint owners, area unreadable). Empty if none.`;

const LAND_SCHEMA = z.object({
  ownerName: z.string(),
  village: z.string(),
  surveyNos: z.array(z.string()),
  area: nul(z.number()),
  areaUnit: z.enum(UNITS),
  bighaHa: nul(z.number()),
  aadhaar: nul(z.string()),
  confidence: z.object({ areaHa: z.number(), ownerName: z.number() }),
  followUps: z.array(z.string()),
});

type LandOut = z.infer<typeof LAND_SCHEMA>;

const usable = (t: string) => t.replace(/<[^>]+>/g, " ").replace(/[^\p{L}\p{N}]/gu, "").length >= 30;
const clamp01 = (n: number) => Math.min(1, Math.max(0, Number(n) || 0));

const LAND_TEXT_MODEL = CLAUDE_FAST_MODEL; // structuring OCR text; gated by land extraction 10/10

const toRaw = (d: LandOut): RawLand => ({
  ownerName: d.ownerName,
  village: d.village,
  surveyNos: d.surveyNos,
  areaHa: d.area == null ? null : toHectare(d.area, d.areaUnit, d.bighaHa),
  aadhaarLast4: aadhaarLast4(d.aadhaar),
  areaUnitSeen: d.areaUnit,
});

/** Reader A: Sarvam Vision OCR, then Claude structures the text. */
async function readViaOcr(image: File, signal: AbortSignal) {
  const ocr = maskAadhaar(await sarvamOcr(image, signal));
  if (!usable(ocr)) throw new AiError("Sarvam Vision returned no usable text", 502, true);
  const r = await claudeJson<LandOut>(LAND_SYSTEM, user(`OCR text of the land record:\n\n${ocr}`), LAND_SCHEMA, { model: LAND_TEXT_MODEL, signal });
  return { ...r, ocr, models: ["sarvam-vision", r.model] };
}

/** Reader B: Claude vision on the photo directly. */
async function readViaVision(image: File, signal: AbortSignal) {
  const data = new Uint8Array(await image.arrayBuffer());
  const mediaType = image.type === "image/png" ? "image/png" : "image/jpeg";
  const r = await claudeJson<LandOut>(
    LAND_SYSTEM,
    user([
      { type: "image", image: data, mediaType },
      { type: "text", text: "Read this land record." },
    ]),
    LAND_SCHEMA,
    { signal },
  );
  return { ...r, ocr: "", models: [r.model] };
}

const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v == null || v === "" ? "blank" : String(v));

/** Two independent readers in parallel, reconciled field by field; one failing still returns the other. */
export async function extractLand(image: File, officerLang: string) {
  const deadline = Date.now() + BUDGET_MS;
  // Both readers are awaited (allSettled) under one shared deadline; a reader that misses it counts as failed.
  const readers = by(deadline - FOLLOWUP_RESERVE_MS);
  const [a, b] = await Promise.allSettled([readViaOcr(image, readers), readViaVision(image, readers)]);
  if (a.status === "rejected" && b.status === "rejected") {
    const errs = [toAiError(a.reason), toAiError(b.reason)];
    throw errs.find((e) => e.status === 503) ?? errs[1];
  }
  for (const [name, r] of [["sarvam-vision", a], ["claude-vision", b]] as const) if (r.status === "rejected") console.warn(`land reader ${name} failed: ${toAiError(r.reason).message}`);
  const ra = a.status === "fulfilled" ? a.value : null;
  const rb = b.status === "fulfilled" ? b.value : null;
  const evidence = reconcileLand(ra && toRaw(ra.data), rb && toRaw(rb.data));
  const reads = [ra, rb].filter((r) => r != null);
  const avg = (k: "areaHa" | "ownerName") => reads.reduce((s, r) => s + clamp01(r.data.confidence[k]), 0) / reads.length;
  const factor = (agree: boolean) => (agree ? 1 : reads.length === 2 ? 0.5 : 0.8);

  const questions = [...(rb ?? ra)!.data.followUps]; // one reader's follow-ups; the two mostly repeat each other
  if (ra && rb)
    for (const [label, f] of [["owner name", evidence.ownerName], ["village", evidence.village], ["survey numbers", evidence.surveyNos], ["area (ha)", evidence.areaHa]] as const)
      if (!f.agree) questions.push(`The two readings of the record disagree on ${label}: ${f.reads.map((x) => `${show(x.value)} (${x.source})`).join(" vs ")}. Please check the record.`);
  if (evidence.areaHa.value == null) questions.push("Land area could not be read from the record. Please enter it.");
  if (evidence.areaUnitSeen === "bigha") {
    const bighaHa = reads.map((r) => r.data.bighaHa).find((x) => x != null);
    questions.push(bighaHa ? `Area was in bigha, converted at 1 bigha = ${bighaHa} ha as printed on the record. Please confirm.` : "Area was in bigha, converted at 1 bigha = 0.1115 ha (12,000 sq ft). Please confirm the local bigha size.");
  }
  const fu = await inOfficerLang(questions, officerLang, by(deadline));
  return {
    fields: {
      ownerName: evidence.ownerName.value,
      village: evidence.village.value,
      surveyNos: evidence.surveyNos.value,
      areaHa: evidence.areaHa.value,
      areaUnitSeen: evidence.areaUnitSeen,
      aadhaarLast4: evidence.aadhaarLast4.value,
    },
    evidence,
    confidence: {
      areaHa: Math.round(avg("areaHa") * factor(evidence.areaHa.agree) * 100) / 100,
      ownerName: Math.round(avg("ownerName") * factor(evidence.ownerName.agree) * 100) / 100,
    },
    rawText: maskAadhaar(ra?.ocr ?? ""),
    followUps: fu.list,
    models: uniq([...reads.flatMap((r) => r.models), ...fu.models]),
  };
}

// ---- crops ----

const CROPS_MODEL = CLAUDE_MODEL; // Haiku passed parity but wrote 2x the tokens and 4x the follow-ups, so it was slower here

type CropsOut = {
  english: string;
  crops: { crop: string; season: Season; area: number; areaUnit: AreaUnit; spokenAs: string }[];
  unmapped: string[];
  followUps: string[];
};

export async function extractCrops(o: {
  audio?: File;
  text?: string;
  farmerLang: string;
  officerLang: string;
  district: string;
  landHa: number;
  allowed: string[];
}) {
  const deadline = Date.now() + BUDGET_MS;
  const signal = by(deadline - FOLLOWUP_RESERVE_MS);
  const models: string[] = [];
  let transcript = o.text ?? "";
  let englishP = Promise.resolve("");
  if (o.audio) {
    const lang = o.farmerLang === "auto" ? undefined : o.farmerLang;
    // The English speech translation is display only, so it runs alongside structuring instead of before it.
    englishP = stt(o.audio, "translate", lang, o.allowed, signal).then((r) => r.text);
    englishP.catch(() => {}); // awaited below; avoids an unhandled rejection if transcription fails first
    transcript = (await stt(o.audio, "transcribe", lang, o.allowed, signal)).text;
    models.push("saaras:v4");
  }
  if (!transcript.trim()) throw new AiError("No speech detected", 400, false);

  const system = `You turn an Indian farmer's spoken crop plan into crop lines for a Kisan Credit Card appraisal in ${o.district} district.
Allowed crop keys (Scale of Finance table): ${o.allowed.join(", ")}.
Map local names to these keys (e.g. chana = gram, sarson = mustard, gehun = wheat, makka = maize, kapas = cotton, ganna = sugarcane). A crop that matches none goes in unmapped as spoken, never in crops.
For each crop give season (kharif = monsoon/June-Oct, rabi = winter/Nov-Mar, zaid = summer, annual = sugarcane and other year-long crops), area as a number and areaUnit as spoken (hectare, acre or bigha; assume acre only if the farmer clearly uses acres, else ask), and spokenAs (the farmer's words for the crop).
english: an English rendering of what the farmer said.
followUps: short English questions for the officer when area, season or crop is missing or ambiguous. Never compute money.`;
  const schema = z.object({
    english: z.string(),
    crops: z.array(
      z.object({
        crop: z.enum(o.allowed as [string, ...string[]]),
        season: z.enum(SEASONS),
        area: z.number(),
        areaUnit: z.enum(UNITS),
        spokenAs: z.string(),
      }),
    ),
    unmapped: z.array(z.string()),
    followUps: z.array(z.string()),
  });
  const input = `Farmer said (${o.farmerLang}):\n${transcript}`;
  const [{ data: d, model }, english] = await Promise.all([claudeJson<CropsOut>(system, user(input), schema, { model: CROPS_MODEL, signal }), englishP]);
  models.push(model);

  const allowed = new Set(o.allowed);
  const unmapped = [...d.unmapped];
  const crops = [];
  for (const c of d.crops) {
    if (!allowed.has(c.crop) || !SEASONS.includes(c.season)) unmapped.push(c.spokenAs || c.crop);
    else crops.push({ crop: c.crop, season: c.season, areaHa: toHectare(c.area, c.areaUnit), spokenAs: c.spokenAs });
  }
  const questions = [...d.followUps, ...seasonOverclaims(crops, o.landHa).map((x) => overclaimQuestion(x, o.landHa))];
  if (d.crops.some((c) => c.areaUnit === "bigha"))
    questions.push("Some areas were in bigha, converted at 1 bigha = 0.1115 ha. Please confirm the local bigha size.");
  const fu = await inOfficerLang(questions, o.officerLang, by(deadline));
  return { transcript, english: english || d.english, crops, unmapped: uniq(unmapped), followUps: fu.list, models: uniq([...models, ...fu.models]) };
}

// ---- note ----

const NOTE_SCHEMA = z.object({ officer: z.string(), farmer: z.string() });
type NoteOut = z.infer<typeof NOTE_SCHEMA>;

/** Progress of a streamed note: unverified officer draft text, then the figure check, then a possible redraft. */
export type NoteEvents = {
  onDraft?: (officer: string) => void;
  onChecking?: () => void;
  onRedraft?: () => void;
  signal?: AbortSignal;
};

/** One streamed draft; partial officer text goes to onDraft, the full answer is returned unverified. */
async function noteAttempt(system: string, messages: ModelMessage[], signal: AbortSignal, onDraft?: (officer: string) => void) {
  let failure: unknown;
  const r = streamText({
    model: claude(),
    system,
    messages,
    output: Output.object({ schema: NOTE_SCHEMA }),
    maxOutputTokens: 3000,
    maxRetries: 0,
    abortSignal: signal,
    providerOptions: { anthropic: { effort: "low", fallbacks: "default" } },
    onError: ({ error }) => void (failure ??= error),
  });
  try {
    for await (const p of r.partialOutputStream) if (p.officer) onDraft?.(p.officer);
    const [data, finish, response] = await Promise.all([r.output, r.finishReason, r.response]);
    if (finish === "content-filter") throw new AiError("Claude declined the request", 502, false);
    if (finish === "length") throw new AiError("Claude response truncated", 502, true);
    return { data: data as NoteOut, model: response.modelId };
  } catch (e) {
    throw toAiError(failure ?? e);
  }
}

export async function draftNote(c: { result: KccResult } & Record<string, unknown>, officerLang: string, farmerLang: string, ev: NoteEvents = {}) {
  const { result } = c;
  const facts = {
    district: c.district,
    farmerName: (c.farmer as { name?: string } | undefined)?.name,
    landHa: c.landHa,
    tenure: c.tenure,
    crops: c.crops,
    sofSource: "PMFBY sum insured used as proxy Scale of Finance unless a bank table was uploaded",
    result,
  };
  const system = `You draft a Kisan Credit Card sanction recommendation for a bank officer, under the RBI KCC Directions, 2026.
The rules engine already computed every number. Rules:
- Use only rupee figures that appear in RESULT. Never compute, round, add or invent an amount.
- Write every rupee amount as ₹ followed by ASCII digits in Indian grouping (e.g. ₹1,72,000), immediately followed by its paragraph in brackets, e.g. ₹1,72,000 (para 13(5)).
- officer: a concise sanction note in ${langName(officerLang)} for the officer: crops and area, step-wise limit with paras, year-wise limits, KCC limit, collateral and Flexi KCC position, any flags. It is a recommendation; the officer decides.
- farmer: 3 to 5 short plain English sentences for the farmer: the KCC limit, that it grows 10% each year for 6 years, and what to bring if anything. Do not use the hyphen-like long dash character.`;
  const ask = `CASE:\n${JSON.stringify(facts)}`;
  const messages = user(ask);
  const attempt = () => noteAttempt(system, messages, within(BUDGET_MS, ev.signal), ev.onDraft);
  // Every figure is checked against the engine output before the draft leaves the server as final.
  let drafted = await attempt();
  ev.onChecking?.();
  let bad = unknownFigures(`${drafted.data.officer}\n${drafted.data.farmer}`, result);
  if (bad.length) {
    ev.onRedraft?.();
    messages.push(
      { role: "assistant", content: JSON.stringify(drafted.data) },
      { role: "user", content: `These amounts are not in RESULT: ${bad.map((n) => `₹${n.toLocaleString("en-IN")}`).join(", ")}. Redraft using only RESULT figures.` },
    );
    drafted = await attempt();
    ev.onChecking?.();
    bad = unknownFigures(`${drafted.data.officer}\n${drafted.data.farmer}`, result);
    if (bad.length) throw new AiError("Draft contained figures not produced by the rules engine", 502, true);
  }
  const farmer = await translate(drafted.data.farmer, "en-IN", farmerLang, within(TIMEOUT_MS, ev.signal));
  return { officer: drafted.data.officer, farmer: farmer.text, models: uniq([drafted.model, ...farmer.models]) };
}
