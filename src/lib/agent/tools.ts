// Agent tools (AI SDK tool definitions) with deterministic executors over the request evidence.
import { tool } from "ai";
import { z } from "zod";
import { inr } from "../ai-pure.ts";
import { computeKcc, type KccInput, type KccResult, type SofEntry } from "../kcc.ts";
import { lookupCrop } from "../sof.ts";
import { checkCropPlan, runRiskChecks } from "../risk.ts";
import { whatIfs } from "../whatif.ts";
import type { AgentReport, AgentRequest, Question, Risk, Severity, WhatIf } from "./types.ts";

export type Translate = (text: string, from: string, to: string) => Promise<{ text: string; models: string[] }>;

export interface ToolOutput {
  ok: boolean;
  summary: string; // one line, human readable
  data?: unknown;
  ms?: number; // executor wall time, set by the tool wrapper
}

export interface FinishArgs {
  recommendation: AgentReport["recommendation"];
  confidence: AgentReport["confidence"];
  summary: string;
  agentRisks: Risk[];
}

/** Mutable run state the executors fill in; the harness reads it to build the report. */
export interface ToolState {
  result?: KccResult;
  ruleRisks?: Risk[];
  cropRisks?: Risk[];
  whatIfs?: WhatIf[];
  questions: Question[];
  finish?: FinishArgs;
  models: string[];
}

export interface ToolCtx extends Pick<ToolSink, "state" | "translate"> {
  req: AgentRequest;
}

export const MAX_QUESTIONS = 3;
const SEVERITIES = ["high", "medium", "low"] as const;
const RECS = ["approve", "review", "decline"] as const;
const CONF = ["high", "medium", "low"] as const;

const none = z.object({});
const agentRisk = z.object({
  code: z.string().describe("UPPER_SNAKE code"),
  severity: z.enum(SEVERITIES),
  title: z.string().describe("Short title"),
  detail: z.string().describe("One or two sentences"),
  evidence: z.array(z.string()),
});
export const finishSchema = z.object({
  recommendation: z.enum(RECS),
  confidence: z.enum(CONF),
  summary: z.string().describe("Officer-language summary, 4 to 7 sentences"),
  agentRisks: z.array(agentRisk).optional().describe("Extra risks you found that the rules did not flag"),
});

const DESCRIPTIONS = {
  lookup_sof:
    "Look up the Scale of Finance rate for one crop in this case's district table, with its source (official bank SoF or PMFBY proxy), scope (district or state) and reference. Use it when a SOF_PROXY or CROP_NOT_IN_SOF style risk needs checking.",
  compute_kcc:
    "Run the RBI KCC rules engine on the case evidence (land, tenure, crops, SoF, insurance, term loan, tie-up). Takes no input: every figure comes from the evidence. Returns the step-wise limit with paras, year-wise limits, KCC limit, collateral position and flags. Required before finish.",
  run_risk_checks:
    "Run the deterministic risk rules (name and survey mismatch against the land record, double financing against the branch portfolio, SoF provenance, over-claimed area, etc.). Takes no input. Required before finish.",
  check_crop_plan: "Check that the claimed crops and seasons are plausible for this district. Takes no input.",
  what_if:
    "Compute deterministic what-if scenarios on the evidence (e.g. recovery tie-up, area corrected to land record) with their KCC limits and deltas. Takes no input. Use when the limit is near a collateral threshold or area looks over-claimed.",
  ask_officer:
    "Queue a question for the officer about something the evidence cannot settle. At most 3 per case. Set askFarmer true if the officer should put the question to the farmer.",
  finish:
    "End the appraisal with your recommendation. Only after compute_kcc and run_risk_checks. The summary must use only rupee figures that appeared in tool results.",
};
export type AgentTool = keyof typeof DESCRIPTIONS;

/** Hooks the harness gives the tools: question stream, required-tool guard, step counting. */
export interface ToolSink {
  state: ToolState;
  translate?: Translate;
  onQuestion?: (q: Question) => void;
  onResult?: (name: AgentTool, out: ToolOutput) => void;
  ensureRequired?: () => Promise<void>;
}

/** AI SDK tool set bound to one request; executors stay deterministic. */
export function makeTools(req: AgentRequest, sink: ToolSink) {
  const ctx: ToolCtx = { req, state: sink.state, translate: sink.translate };
  const run = async (name: AgentTool, input: unknown): Promise<ToolOutput> => {
    if (name === "finish") await sink.ensureRequired?.();
    const t0 = Date.now();
    let out: ToolOutput;
    try {
      out = await execTool(name, input, ctx);
    } catch (e) {
      out = { ok: false, summary: `${name} failed: ${(e as Error).message}` };
    }
    out.ms = Date.now() - t0;
    sink.onResult?.(name, out);
    if (name === "ask_officer" && out.ok) sink.onQuestion?.(out.data as Question);
    return out;
  };
  const t = <S extends z.ZodType>(name: AgentTool, inputSchema: S) =>
    tool({ description: DESCRIPTIONS[name], inputSchema, execute: (input: z.infer<S>) => run(name, input) });
  return {
    lookup_sof: t("lookup_sof", z.object({ crop: z.string().describe("Crop key or local name, e.g. soybean, chana") })),
    compute_kcc: t("compute_kcc", none),
    run_risk_checks: t("run_risk_checks", none),
    check_crop_plan: t("check_crop_plan", none),
    what_if: t("what_if", none),
    ask_officer: t(
      "ask_officer",
      z.object({
        question: z.string().describe("The question, in English, one sentence"),
        why: z.string().describe("Why it matters for the appraisal, one short sentence"),
        askFarmer: z.boolean(),
      }),
    ),
    finish: t("finish", finishSchema),
  };
}

export const TOOL_NAMES = Object.keys(DESCRIPTIONS) as AgentTool[];

const norm = (s: string) => s.trim().toLowerCase();

/** Engine-shaped SoF (drops provenance fields). */
export function engineSof(sof: AgentRequest["sof"]): Record<string, SofEntry> {
  return Object.fromEntries(
    Object.entries(sof).map(([k, v]) => [k, { ...(v.current != null ? { current: v.current } : {}), ...(v.previous != null ? { previous: v.previous } : {}) }]),
  );
}

/** KCC engine input built from evidence only; the model never supplies numbers. */
export function baseInput(req: AgentRequest): KccInput {
  const ev = req.evidence;
  return {
    landHa: ev.landHa,
    tenure: ev.tenure,
    crops: ev.crops,
    sof: engineSof(req.sof),
    insurancePremium: ev.insurancePremium,
    termLoan: ev.termLoan,
    recoveryTieUp: ev.recoveryTieUp,
  };
}

const riskLine = (rs: Risk[]) =>
  rs.length ? `${rs.length} risk(s): ${rs.map((r) => `${r.code} (${r.severity})`).join(", ")}` : "no risks found";

export function parseFinish(input: unknown): FinishArgs | string {
  const i = (input ?? {}) as Record<string, unknown>;
  if (!RECS.includes(i.recommendation as never)) return "recommendation must be approve, review or decline";
  if (!CONF.includes(i.confidence as never)) return "confidence must be high, medium or low";
  if (typeof i.summary !== "string" || !i.summary.trim()) return "summary is required";
  const raw = Array.isArray(i.agentRisks) ? i.agentRisks : [];
  const agentRisks: Risk[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r.code !== "string" || typeof r.title !== "string") return "each agentRisk needs code and title";
    agentRisks.push({
      code: r.code.trim().toUpperCase(),
      severity: (SEVERITIES as readonly string[]).includes(r.severity as string) ? (r.severity as Severity) : "medium",
      title: r.title,
      detail: typeof r.detail === "string" ? r.detail : "",
      evidence: Array.isArray(r.evidence) ? r.evidence.map(String) : [],
      source: "agent",
    });
  }
  return { recommendation: i.recommendation as FinishArgs["recommendation"], confidence: i.confidence as FinishArgs["confidence"], summary: i.summary.trim(), agentRisks };
}

export async function execTool(name: string, input: unknown, ctx: ToolCtx): Promise<ToolOutput> {
  const { req, state } = ctx;
  const ev = req.evidence;
  switch (name as AgentTool) {
    case "lookup_sof": {
      const asked = String((input as { crop?: unknown })?.crop ?? "");
      const key = Object.keys(req.sof).find((k) => norm(k) === norm(asked)) ?? Object.keys(req.sof).find((k) => norm(k) === norm(lookupCrop(asked) ?? ""));
      if (!key) return { ok: false, summary: `${asked}: no Scale of Finance row for ${ev.district}; outside KCC under para 13(4)`, data: { crop: asked, found: false, para: "13(4)" } };
      const e = req.sof[key];
      const rate = e.current != null ? `${inr(e.current)}/ha current` : e.previous != null ? `${inr(e.previous)}/ha previous only (para 13(3) adds 10%)` : "no rate";
      return { ok: true, summary: `${key}: ${rate}, ${e.source}, ${e.scope} scope`, data: { crop: key, ...e } };
    }
    case "compute_kcc": {
      const r = (state.result = computeKcc(baseInput(req)));
      const errors = r.flags.filter((f) => f.level === "error");
      return {
        ok: true,
        summary: `KCC limit ${inr(r.kccLimit)} (para 10), year-1 ${inr(r.yearlyLimits[0])}, ${r.collateralFree ? "collateral free" : "collateral needed"}, ${errors.length} error flag(s)`,
        data: r,
      };
    }
    case "run_risk_checks": {
      const rs = (state.ruleRisks = runRiskChecks(ev, req.portfolio, req.sof));
      return { ok: true, summary: riskLine(rs), data: rs };
    }
    case "check_crop_plan": {
      const rs = (state.cropRisks = checkCropPlan(ev.district, ev.crops));
      return { ok: true, summary: rs.length ? `crop plan: ${riskLine(rs)}` : "crop plan plausible for the district", data: rs };
    }
    case "what_if": {
      const ws = (state.whatIfs = whatIfs(baseInput(req)));
      return { ok: true, summary: ws.length ? ws.map((w) => `${w.label}: ${inr(w.kccLimit)} (${w.delta >= 0 ? "+" : "-"}${inr(Math.abs(w.delta))})`).join("; ") : "no what-ifs apply", data: ws };
    }
    case "ask_officer": {
      const i = (input ?? {}) as { question?: unknown; why?: unknown; askFarmer?: unknown };
      const q = String(i.question ?? "").trim();
      if (!q) return { ok: false, summary: "question is required" };
      if (state.questions.length >= MAX_QUESTIONS) return { ok: false, summary: `question limit (${MAX_QUESTIONS}) reached; decide with what you have` };
      const why = String(i.why ?? "").trim();
      const tr = async (to: string) => {
        if (to === "en-IN" || !ctx.translate) return q;
        const t = await ctx.translate(q, "en-IN", to);
        state.models.push(...t.models);
        return t.text;
      };
      const [text, farmer] = await Promise.all([tr(req.officerLang), i.askFarmer === true ? tr(req.farmerLang) : Promise.resolve(undefined)]);
      const question: Question = { id: `q${state.questions.length + 1}`, text, why, ...(farmer ? { askFarmer: farmer } : {}) };
      state.questions.push(question);
      return { ok: true, summary: `queued ${question.id} for the officer`, data: question };
    }
    case "finish": {
      if (!state.result || !state.ruleRisks) return { ok: false, summary: "call compute_kcc and run_risk_checks before finish" };
      const f = parseFinish(input);
      if (typeof f === "string") return { ok: false, summary: f };
      state.finish = f;
      return { ok: true, summary: `finished: ${f.recommendation} (${f.confidence} confidence)` };
    }
    default:
      return { ok: false, summary: `unknown tool ${name}` };
  }
}
