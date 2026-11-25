import { AiError, draftNote, extractCrops, extractLand, toAiError, translate, tts, type NoteEvents } from "@/lib/ai";
import { isLangCode } from "@/lib/i18n";
import { listCrops } from "@/lib/sof";
import type { KccResult } from "@/lib/kcc";

export const maxDuration = 60;

const MB = 1024 * 1024;
const LIMITS: Record<string, number> = { land: 5.5 * MB, crops: 10 * MB, note: 256 * 1024, tts: 16 * 1024, translate: 32 * 1024 };

const bad = (msg: string) => new AiError(msg, 400, false);
const lang = (v: unknown, name: string, allowAuto = false) => {
  const s = String(v ?? "");
  if (isLangCode(s) || (allowAuto && s === "auto")) return s;
  throw bad(`${name} must be a supported language code`);
};
const text = (v: unknown, name: string, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw bad(`${name} is required`);
  if (s.length > max) throw bad(`${name} must be at most ${max} characters`);
  return s;
};
async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw bad("Invalid JSON body");
  }
}
async function form(req: Request) {
  try {
    return await req.formData();
  } catch {
    throw bad("Expected multipart/form-data");
  }
}

// Client sends its crop keys (uploaded SoF lives on device); default table otherwise.
function allowedCrops(v: FormDataEntryValue | null, district: string): string[] {
  const s = String(v ?? "").trim();
  let list: unknown = [];
  try {
    list = s.startsWith("[") ? JSON.parse(s) : s.split(",");
  } catch {
    throw bad("crops must be a JSON array or comma list of SoF crop keys");
  }
  const out = Array.isArray(list) ? [...new Set(list.map((x) => String(x).trim().toLowerCase()).filter(Boolean))] : [];
  if (out.length) return out;
  const fallback = listCrops(district);
  if (!fallback.length) throw bad("unknown district and no crops list given");
  return fallback;
}

/** NDJSON stream of note progress: draft text deltas (unverified), checking, redraft, then done or error. */
function noteStream(req: Request, run: (ev: NoteEvents) => Promise<unknown>) {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(ctl) {
        const send = (o: object) => {
          try {
            ctl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
          } catch {} // client went away
        };
        let sent = "";
        const onDraft = (officer: string) => {
          const reset = !officer.startsWith(sent);
          send({ type: "draft", text: reset ? officer : officer.slice(sent.length), ...(reset ? { reset } : {}) });
          sent = officer;
        };
        try {
          const out = await run({ signal: req.signal, onDraft, onChecking: () => send({ type: "checking" }), onRedraft: () => ((sent = ""), send({ type: "redraft" })) });
          send({ type: "done", ...(out as object) });
        } catch (e) {
          const err = toAiError(e);
          send({ type: "error", error: err.message, retryable: err.retryable, status: err.status });
        }
        try {
          ctl.close();
        } catch {}
      },
    }),
    { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } },
  );
}

async function handle(action: string, req: Request) {
  switch (action) {
    case "land": {
      const f = await form(req);
      const image = f.get("image");
      if (!(image instanceof File) || !["image/jpeg", "image/png"].includes(image.type)) throw bad("image must be a JPEG or PNG file");
      if (image.size > 5 * MB) throw bad("image must be at most 5 MB");
      text(f.get("district"), "district", 100);
      return extractLand(image, lang(f.get("officerLang") ?? "en-IN", "officerLang"));
    }
    case "crops": {
      const f = await form(req);
      const audio = f.get("audio");
      const hasAudio = audio instanceof File && audio.size > 0;
      if (hasAudio && !/^(audio|video)\//.test(audio.type) && !/\.(wav|webm|m4a|mp3|ogg)$/i.test(audio.name)) throw bad("audio must be wav, webm or m4a");
      if (hasAudio && audio.size > 10 * MB) throw bad("audio must be at most 10 MB");
      const landHa = Number(f.get("landHa"));
      if (!(landHa > 0)) throw bad("landHa must be a positive number");
      return extractCrops({
        audio: hasAudio ? audio : undefined,
        text: hasAudio ? undefined : text(f.get("text"), "audio or text", 4000),
        farmerLang: lang(f.get("farmerLang"), "farmerLang", true),
        officerLang: lang(f.get("officerLang"), "officerLang"),
        district: text(f.get("district"), "district", 100),
        landHa,
        allowed: allowedCrops(f.get("crops"), String(f.get("district") ?? "")),
      });
    }
    case "note": {
      const b = await body<{ case?: { result?: KccResult } & Record<string, unknown>; officerLang?: string; farmerLang?: string; stream?: boolean }>(req);
      const r = b.case?.result;
      if (!r || typeof r.kccLimit !== "number" || !Array.isArray(r.steps)) throw bad("case.result (engine output) is required");
      const args = [{ ...b.case!, result: r }, lang(b.officerLang, "officerLang"), lang(b.farmerLang, "farmerLang")] as const;
      return b.stream ? noteStream(req, (ev) => draftNote(...args, ev)) : draftNote(...args);
    }
    case "tts": {
      const b = await body<{ text?: string; lang?: string }>(req);
      return tts(text(b.text, "text", 1500), lang(b.lang, "lang"));
    }
    case "translate": {
      const b = await body<{ text?: string; from?: string; to?: string }>(req);
      return translate(text(b.text, "text", 10_000), lang(b.from, "from", true), lang(b.to, "to"));
    }
    default:
      throw new AiError(`Unknown action: ${action}`, 404, false);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  try {
    if (!(action in LIMITS)) throw new AiError(`Unknown action: ${action}`, 404, false);
    if (Number(req.headers.get("content-length") ?? 0) > LIMITS[action]) throw bad("Request too large");
    if (!process.env.SARVAM_API_KEY || !process.env.ANTHROPIC_API_KEY) throw new AiError("AI not configured", 503, false);
    const out = await handle(action, req);
    return out instanceof Response ? out : Response.json(out);
  } catch (e) {
    const err = toAiError(e);
    return Response.json({ error: err.message, retryable: err.retryable }, { status: err.status });
  }
}
