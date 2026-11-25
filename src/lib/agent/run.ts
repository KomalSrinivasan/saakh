// Appraisal agent: a ToolLoopAgent plans and calls deterministic tools; harness verifiers gate the report.
import { hasToolCall, isStepCount, ToolLoopAgent, toUIMessageStream, type LanguageModel, type ModelMessage, type StopCondition, type UIMessageStreamWriter } from "ai";
import { inr, resultNumbers } from "../ai-pure.ts";
import { verifyReport } from "../harness.ts";
import { whatIfs } from "../whatif.ts";
import { baseInput, execTool, makeTools, TOOL_NAMES, type ToolOutput, type ToolSink, type ToolState, type Translate } from "./tools.ts";
import type { AgentReport, AgentRequest, AgentTool, Check, Risk, SaakhAgentUIMessage } from "./types.ts";

export type SaakhWriter = Pick<UIMessageStreamWriter<SaakhAgentUIMessage>, "write">;

export interface AgentDeps {
  model: LanguageModel;
  translate: Translate;
}

const MAX_STEPS = 10;
const BUDGET_MS = 45_000; // typical run 10-13 s; fails fast well inside the route limit
const REQUIRED = ["compute_kcc", "run_risk_checks"] as const;

const SYSTEM_PROMPT = `You are Saakh, an appraisal agent for a cooperative bank officer in Madhya Pradesh. You assess one Kisan Credit Card application under the RBI KCC Directions, 2026. You advise; the officer decides.

How to work:
- Start your first turn with a short numbered plan (3 to 5 steps, one line each), then call tools.
- You must call compute_kcc and run_risk_checks before finish. Every rupee figure comes from these tools; you cannot pass numbers to them.
- Investigate high and medium risks: lookup_sof for proxy or missing rates, check_crop_plan for odd crops or seasons, what_if when the limit is near a collateral threshold or area looks over-claimed.
- Use ask_officer for facts the evidence cannot settle (at most 3 questions), especially a high or medium risk that could have an innocent explanation (e.g. name mismatch from an heir, joint owner or family member; land shared with another case). Before you finish with review or decline because of such a risk, call ask_officer for what would clear it (a document to see, or a question for the farmer). Do not ask what a tool already answers. If officer answers are given, take them into account and do not ask again.
- Between tool calls, write at most 1 or 2 short sentences about what you found or will do next.
- Never state a rupee figure that did not appear in a tool result. Write amounts as ₹ with Indian grouping, e.g. ₹1,72,000, and cite the RBI para from the tool output, e.g. (para 10).
- Keep every risk the rules found. Recommend approve only if the engine has no error flags and there are no high risks. Use decline for clear fraud signals (e.g. double financing on an approved case). Otherwise review.
- finish.summary: 4 to 7 short sentences, never more, in English (the harness translates it for the officer), plain banker language: the limit and how it was reached, the main risks and what to verify, and your recommendation.`;

/** Digits in any Indian script as ASCII, sorted, grouping commas dropped: a translation must keep this set. */
export function figures(s: string): string {
  const ascii = s.replace(/\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0)!;
    let k = 0;
    while (k < 9 && /\p{Nd}/u.test(String.fromCodePoint(cp - k - 1))) k++;
    return String(k);
  });
  return (ascii.match(/\d[\d,]*(\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "")).sort().join("|");
}

/** Officer-language text, or the English original when translation fails or changes a figure. */
async function localize(text: string, lang: string, translate: Translate, models: string[]): Promise<string> {
  try {
    const t = await translate(text, "en-IN", lang);
    if (figures(t.text) !== figures(text)) return text;
    models.push(...t.models);
    return t.text;
  } catch {
    return text;
  }
}

function caseMessage(req: AgentRequest): string {
  const answers = req.answers?.length ? `\n\nOFFICER ANSWERS TO EARLIER QUESTIONS:\n${JSON.stringify(req.answers)}` : "";
  return `CASE EVIDENCE:\n${JSON.stringify(req.evidence)}\n\nSCALE OF FINANCE TABLE (district ${req.evidence.district}):\n${JSON.stringify(req.sof)}\n\nOTHER CASES ON THIS DEVICE: ${req.portfolio.length}${answers}\n\nAppraise this case.`;
}

/** Plan steps from the first text: numbered or bulleted lines, else sentences. */
function parsePlan(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trim());
  const steps = lines.filter((l) => /^(\d+[.)]|[-*•])\s+/.test(l)).map((l) => l.replace(/^(\d+[.)]|[-*•])\s+/, "").replace(/\*\*/g, ""));
  return (steps.length ? steps : (text.match(/[^.!?]+[.!?]/g) ?? []).map((s) => s.trim())).filter(Boolean).slice(0, 6);
}

const DEFAULT_PLAN = ["Compute the KCC limit from the evidence", "Run the risk rules", "Investigate any high or medium risks", "Recommend to the officer"];

/** Rule risks first; agent risks keep source "agent" and drop duplicates of a rule code. */
function mergeRisks(rule: Risk[], agent: Risk[]): Risk[] {
  const out = [...rule];
  const codes = new Set(rule.map((r) => r.code));
  for (const r of agent) {
    if (codes.has(r.code)) continue;
    out.push({ ...r, source: "agent" });
    codes.add(r.code);
  }
  return out;
}

/** Deterministic English summary from engine + risks, used when the model's draft fails the harness. */
export function templateSummary(report: Pick<AgentReport, "result" | "risks">): string {
  const r = report.result;
  const errors = r.flags.filter((f) => f.level === "error");
  const high = report.risks.filter((x) => x.severity === "high");
  const med = report.risks.filter((x) => x.severity === "medium");
  return [
    `The rules engine sets the KCC limit at ${inr(r.kccLimit)} (para 10), with a year-1 short-term limit of ${inr(r.yearlyLimits[0])} (para 13(5)).`,
    r.collateralFree ? "The limit is within the collateral-free ceiling." : "The limit is above the collateral-free ceiling, so collateral applies as per bank policy.",
    errors.length ? `The engine raised ${errors.length} error flag(s): ${errors.map((f) => f.code).join(", ")}.` : "The engine raised no error flags.",
    high.length ? `High risks: ${high.map((x) => x.title).join("; ")}.` : "No high risks were found.",
    med.length ? `Medium risks to verify: ${med.map((x) => x.title).join("; ")}.` : "",
    "Recommendation: review. The automated summary did not pass verification, so the officer should check the case before deciding.",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function runAgent(req: AgentRequest, writer: SaakhWriter, { model, translate }: AgentDeps): Promise<AgentReport> {
  const t0 = Date.now();
  const deadline = t0 + BUDGET_MS;

  const state: ToolState = { questions: [], models: [] };
  const figures = new Set<number>();
  const skipped: string[] = [];
  let steps = 0;
  let harnessIds = 0;
  const note = (text: string) => writer.write({ type: "data-note", data: { text } });

  const sink: ToolSink = {
    state,
    translate,
    onQuestion: (q) => writer.write({ type: "data-question", data: q }),
    onResult: (_name, out: ToolOutput) => {
      steps++;
      if (out.ok && out.data !== undefined) for (const v of resultNumbers(out.data)) figures.add(v);
    },
    ensureRequired: () => ensureRequired("called finish"),
  };
  const tools = makeTools(req, sink);

  // Harness-run tool: streamed as a normal typed tool part so the UI shows it in the trace.
  const harnessRun = async (name: AgentTool) => {
    const toolCallId = `harness-${++harnessIds}`;
    writer.write({ type: "tool-input-available", toolCallId, toolName: name, input: {} });
    const t0 = Date.now();
    const out = await execTool(name, {}, { req, state, translate });
    out.ms = Date.now() - t0;
    sink.onResult!(name, out);
    writer.write({ type: "tool-output-available", toolCallId, output: out });
  };
  async function ensureRequired(why: string) {
    for (const t of REQUIRED) {
      if ((t === "compute_kcc" ? state.result : state.ruleRisks) != null) continue;
      note(`Harness: the agent ${why} without ${t}, so the harness ran it.`);
      skipped.push(t);
      await harnessRun(t);
    }
  }

  let phase: "main" | "repair" = "main";
  const repairStop: StopCondition<typeof tools> = ({ steps: s }) => phase === "repair" && s.length >= 2;
  const agent = new ToolLoopAgent({
    model,
    instructions: SYSTEM_PROMPT,
    tools,
    maxRetries: 0,
    maxOutputTokens: 8000,
    stopWhen: [isStepCount(MAX_STEPS), hasToolCall("finish"), repairStop],
    // finish stays unavailable until both required tools have run; the repair turn may only call finish.
    prepareStep: () => {
      if (phase === "repair") return { activeTools: ["finish"] };
      return state.result && state.ruleRisks ? {} : { activeTools: TOOL_NAMES.filter((n) => n !== "finish") };
    },
    providerOptions: { anthropic: { thinking: { type: "between_tools" }, effort: "medium", fallbacks: "default", cacheControl: { type: "ephemeral" } } },
  });

  let planned = false;
  let agentError: unknown;
  const history: ModelMessage[] = [{ role: "user", content: caseMessage(req) }];

  const pump = async (messages: ModelMessage[]) => {
    const left = deadline - Date.now();
    if (left < 3000) return void (agentError ??= new Error("time budget used up"));
    let text = "";
    try {
      const res = await agent.stream({ messages, abortSignal: AbortSignal.timeout(left) });
      const reader = toUIMessageStream({ stream: res.stream, sendStart: false, sendFinish: false, onError: (e) => ((agentError ??= e), String((e as Error)?.message ?? e)) }).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.type === "error") continue;
        if (value.type === "text-delta" || value.type === "reasoning-delta") text += value.delta;
        if (!planned && (value.type === "tool-input-start" || value.type === "tool-input-available")) {
          planned = true;
          const plan = parsePlan(text);
          writer.write({ type: "data-plan", data: { steps: plan.length ? plan : DEFAULT_PLAN } });
        }
        writer.write(value as Parameters<SaakhWriter["write"]>[0]);
      }
      if (agentError) return;
      const [response, all] = await Promise.all([res.response, res.steps]);
      history.push(...response.messages);
      state.models.push(...all.map((s) => s.response.modelId));
    } catch (e) {
      agentError ??= e;
    }
  };

  await pump(history);
  if (agentError && steps === 0) throw agentError; // nothing done yet: surface the provider error
  if (!planned) writer.write({ type: "data-plan", data: { steps: DEFAULT_PLAN } });
  await ensureRequired(state.finish ? "finished" : "stopped");
  if (!state.whatIfs) for (const v of resultNumbers((state.whatIfs = whatIfs(baseInput(req))))) figures.add(v);

  const result = state.result!;
  const ruleRisks = state.ruleRisks!; // already includes checkCropPlan output
  const vctx = { engine: result, ruleRisks, toolFigures: [...figures] };
  const draft = () => ({
    recommendation: state.finish?.recommendation ?? ("review" as const),
    summary: state.finish?.summary ?? "",
    risks: mergeRisks(ruleRisks, state.finish?.agentRisks ?? []),
    whatIfs: state.whatIfs!,
    result,
  });
  const verify = () => {
    const c = verifyReport(draft(), vctx);
    for (const check of c) writer.write({ type: "data-check", data: check });
    return c;
  };

  let checks: Check[] = state.finish ? verify() : [];
  let failed = checks.filter((c) => !c.ok);

  // One repair turn: failed checks, or the agent stopped without finishing.
  if ((!state.finish || failed.length) && !agentError) {
    const reasons = state.finish ? failed.map((c) => `- ${c.verifier}: ${c.detail}`).join("\n") : "- finish: you stopped without calling finish";
    note(state.finish ? `Harness: ${failed.length} check(s) failed, asking the agent for one repair.` : "Harness: the agent stopped without finish, asking it to finish.");
    history.push({ role: "user", content: `The harness rejected your report:\n${reasons}\nCall finish now with a corrected report. Use only rupee figures from tool results and keep every rule risk.` });
    state.finish = undefined;
    phase = "repair";
    await pump(history);
    if (state.finish) {
      checks = verify();
      failed = checks.filter((c) => !c.ok);
    }
  }

  const extra: Check[] = [
    {
      verifier: "required_tools",
      ok: true,
      detail: skipped.length ? `agent skipped ${skipped.join(", ")}; the harness ran them before the report` : "agent called compute_kcc and run_risk_checks",
    },
  ];
  if (agentError) extra.push({ verifier: "agent_completed", ok: false, detail: `agent stopped early: ${String((agentError as Error)?.message ?? agentError)}` });

  const base = draft();
  let { recommendation, summary } = base;
  let confidence = state.finish?.confidence ?? "low";
  if (!state.finish || failed.length) {
    recommendation = "review";
    confidence = "low";
    summary = templateSummary(base);
    extra.push({
      verifier: "harness_downgrade",
      ok: false,
      detail: state.finish
        ? `still failing after repair (${failed.map((c) => c.verifier).join(", ")}); recommendation set to review and summary replaced by a template`
        : "agent did not finish; recommendation set to review and summary built from the engine and rules",
    });
  }
  for (const check of extra) writer.write({ type: "data-check", data: check });
  // Figures were verified on the English text; translate only afterwards, and only if every figure survives.
  let { risks, whatIfs: wis } = base;
  if (req.officerLang !== "en-IN") {
    const loc = (t: string) => localize(t, req.officerLang, translate, state.models);
    [summary, risks, wis] = await Promise.all([
      loc(summary),
      Promise.all(risks.map(async (r) => ({ ...r, title: await loc(r.title), detail: await loc(r.detail) }))),
      Promise.all(wis.map(async (w) => ({ ...w, label: await loc(w.label), note: await loc(w.note) }))),
    ]);
  }

  return {
    recommendation,
    confidence,
    summary,
    result,
    risks,
    whatIfs: wis,
    questions: state.questions,
    checks: [...checks, ...extra],
    models: [...new Set(state.models.filter(Boolean))],
    steps,
    ms: Date.now() - t0,
  };
}
