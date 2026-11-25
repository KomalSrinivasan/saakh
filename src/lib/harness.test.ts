import { test } from "node:test";
import assert from "node:assert/strict";
import type { Risk } from "./agent/types.ts";
import { computeKcc } from "./kcc.ts";
import { verifyReport, type Draft } from "./harness.ts";

const engine = computeKcc({
  landHa: 2,
  tenure: "owner",
  crops: [
    { crop: "Soybean", season: "kharif", areaHa: 2 },
    { crop: "Wheat", season: "rabi", areaHa: 2 },
  ],
  sof: { soybean: { current: 30_000 }, wheat: { current: 35_000 } },
  insurancePremium: 2_600,
});
const proxy: Risk = { code: "SOF_PROXY", severity: "low", title: "", detail: "", evidence: [], source: "rule" };
const df: Risk = { ...proxy, code: "DOUBLE_FINANCING", severity: "high" };
const ok: Draft = {
  recommendation: "approve",
  summary: `Limit ₹${engine.kccLimit.toLocaleString("en-IN")} (year-1 ₹1,72,000); with a pump set Rs 50000 more.`,
  risks: [proxy],
  whatIfs: [],
  result: structuredClone(engine),
};
const failed = (d: Draft, ruleRisks = [proxy], toolFigures = [50_000]) => verifyReport(d, { engine, ruleRisks, toolFigures }).filter((c) => !c.ok).map((c) => c.verifier);

test("clean draft passes every verifier", () => {
  const checks = verifyReport(ok, { engine, ruleRisks: [proxy], toolFigures: [50_000] });
  assert.equal(checks.length, 7);
  assert.deepEqual(checks.filter((c) => !c.ok), []);
});

test("forged rupee figure in the summary is rejected", () => {
  assert.deepEqual(failed({ ...ok, summary: "Sanction ₹3,50,000 (about 3.5 lakh rupees)." }), ["figures_from_tools"]);
});

test("tampered result is rejected", () => {
  assert.deepEqual(failed({ ...ok, result: { ...engine, kccLimit: 400_000 } }), ["result_is_engine"]);
});

test("approve over a high rule risk, with that risk dropped, fails twice", () => {
  assert.deepEqual(failed(ok, [proxy, df]), ["no_approve_with_high_risk", "rule_risks_preserved"]);
  assert.deepEqual(failed({ ...ok, recommendation: "review", risks: [proxy, df] }, [proxy, df]), []);
});

test("approve over engine errors, and decline without reason, are rejected", () => {
  const bad = { ...engine, flags: [...engine.flags, { level: "error" as const, code: "AREA_EXCEEDS_LAND", message: "" }] };
  assert.deepEqual(verifyReport({ ...ok, result: bad }, { engine: bad, ruleRisks: [proxy], toolFigures: [50_000] }).filter((c) => !c.ok).map((c) => c.verifier), ["no_approve_with_errors"]);
  assert.deepEqual(failed({ ...ok, recommendation: "decline" }), ["decline_needs_reason"]);
  assert.deepEqual(failed({ ...ok, recommendation: "review", summary: "  " }), ["summary_language_nonempty"]);
});
