// Deterministic verifiers on the agent's draft report: the model may explain, never invent figures or drop rule findings.
import type { AgentReport, Check, Risk, WhatIf } from "./agent/types.ts";
import type { KccResult } from "./kcc.ts";
import { inr, resultNumbers, rupeeFigures } from "./ai-pure.ts";

export interface Draft {
  recommendation: AgentReport["recommendation"];
  summary: string;
  risks: Risk[];
  whatIfs: WhatIf[];
  result: KccResult;
}
export interface HarnessCtx {
  engine: KccResult;
  ruleRisks: Risk[];
  toolFigures: number[];
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const check = (verifier: string, ok: boolean, pass: string, fail: string): Check => ({ verifier, ok, detail: ok ? pass : fail });

export function verifyReport(draft: Draft, ctx: HarnessCtx): Check[] {
  const allowed = resultNumbers(ctx.engine);
  for (const w of draft.whatIfs) for (const n of [w.kccLimit, w.delta, Math.abs(w.delta), w.change.termLoan, w.change.insurancePremium]) if (n != null) allowed.add(Math.round(n));
  for (const n of ctx.toolFigures) allowed.add(Math.round(n));
  const figures = rupeeFigures(draft.summary);
  const forged = figures.filter((n) => !allowed.has(n));

  const engineErrors = ctx.engine.flags.filter((f) => f.level === "error");
  const high = [...ctx.ruleRisks, ...draft.risks].filter((r) => r.severity === "high");
  const highRule = ctx.ruleRisks.filter((r) => r.severity === "high");
  const kept = new Set(draft.risks.map((r) => r.code));
  const dropped = [...new Set(ctx.ruleRisks.map((r) => r.code))].filter((c) => !kept.has(c));
  const rec = draft.recommendation;

  return [
    check("figures_from_tools", !forged.length, `${figures.length} rupee figure(s), all from tool results`, `Figures not from any tool: ${forged.map(inr).join(", ")}`),
    check("result_is_engine", deepEqual(draft.result, ctx.engine), "Result is the engine output", "Report result differs from the compute_kcc output"),
    check("no_approve_with_errors", !(rec === "approve" && engineErrors.length), "No approve over engine errors", `Approve with engine error(s): ${engineErrors.map((f) => f.code).join(", ")}`),
    check("no_approve_with_high_risk", !(rec === "approve" && highRule.length), "No approve over a high rule risk", `Approve with high risk(s): ${highRule.map((r) => r.code).join(", ")}`),
    check("rule_risks_preserved", !dropped.length, "Every rule finding is in the report", `Rule finding(s) dropped: ${dropped.join(", ")}`),
    check("decline_needs_reason", rec !== "decline" || high.length > 0 || engineErrors.length > 0, "Decline is backed by a high risk or engine error", "Decline without any high risk or engine error"),
    check("summary_language_nonempty", /\p{L}{2,}/u.test(draft.summary), "Summary present", "Summary is empty"),
  ];
}
