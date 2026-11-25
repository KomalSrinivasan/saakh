import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { AiError, toAiError, translate } from "@/lib/ai";
import { claudeModel } from "@/lib/agent/model";
import { isLangCode } from "@/lib/i18n";
import { runAgent } from "@/lib/agent/run";
import type { AgentRequest, SaakhAgentUIMessage } from "@/lib/agent/types";

export const maxDuration = 60;

const MAX_BYTES = 200 * 1024;
const TENURES = ["owner", "tenant", "oral_lessee", "sharecropper"];
const SEASONS = ["kharif", "rabi", "zaid", "annual"];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Shape check of the request; returns an error message or null. */
function invalid(r: unknown): string | null {
  if (!isObj(r)) return "request is required";
  const ev = r.evidence;
  if (!isObj(ev)) return "request.evidence is required";
  if (typeof ev.caseId !== "string" || typeof ev.district !== "string" || !ev.district) return "evidence.caseId and evidence.district are required";
  const a = ev.applicant;
  if (!isObj(a) || typeof a.name !== "string" || typeof a.village !== "string" || !strs(a.surveyNos)) return "evidence.applicant needs name, village, surveyNos";
  if (typeof ev.landHa !== "number" || !(ev.landHa > 0)) return "evidence.landHa must be a positive number";
  if (!TENURES.includes(ev.tenure as string)) return "evidence.tenure is invalid";
  if (typeof ev.recoveryTieUp !== "boolean") return "evidence.recoveryTieUp must be boolean";
  if (!Array.isArray(ev.crops) || !ev.crops.every((c) => isObj(c) && typeof c.crop === "string" && SEASONS.includes(c.season as string) && typeof c.areaHa === "number" && c.areaHa > 0))
    return "evidence.crops must be [{crop, season, areaHa}]";
  for (const k of ["insurancePremium", "termLoan"] as const) if (ev[k] != null && (typeof ev[k] !== "number" || (ev[k] as number) < 0)) return `evidence.${k} must be a non-negative number`;
  if (!isObj(r.sof) || !Object.values(r.sof).every((e) => isObj(e) && (e.current == null || typeof e.current === "number") && (e.previous == null || typeof e.previous === "number")))
    return "request.sof must map crop to {current?, previous?, source, scope}";
  if (!Array.isArray(r.portfolio) || !r.portfolio.every((p) => isObj(p) && typeof p.caseId === "string" && strs(p.surveyNos))) return "request.portfolio must be an array of cases";
  if (!isLangCode(String(r.officerLang)) || !isLangCode(String(r.farmerLang))) return "officerLang and farmerLang must be supported language codes";
  if (r.answers != null && (!Array.isArray(r.answers) || r.answers.length > 10 || !r.answers.every((x) => isObj(x) && typeof x.answer === "string"))) return "answers must be [{questionId, question, answer}]";
  return null;
}

export async function POST(req: Request) {
  let request: AgentRequest;
  try {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) throw new AiError("Request too large", 400, false);
    const raw = await req.text();
    if (raw.length > MAX_BYTES) throw new AiError("Request too large", 400, false);
    let body: { request?: AgentRequest };
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AiError("Invalid JSON body", 400, false);
    }
    const bad = invalid(body?.request);
    if (bad) throw new AiError(bad, 400, false);
    if (!process.env.ANTHROPIC_API_KEY) throw new AiError("AI not configured", 503, false);
    request = body.request!;
  } catch (e) {
    const err = toAiError(e);
    return Response.json({ error: err.message, retryable: err.retryable }, { status: err.status });
  }

  const stream = createUIMessageStream<SaakhAgentUIMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      const report = await runAgent(request, writer, { model: claudeModel(), translate });
      writer.write({ type: "data-report", data: report });
      writer.write({ type: "finish" });
    },
    onError: (e) => {
      const err = toAiError(e);
      return JSON.stringify({ error: err.message, retryable: err.retryable });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
