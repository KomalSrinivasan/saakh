import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { computeKcc } from "../kcc.ts";
import { figures } from "../ai-pure.ts";
import { runAgent, templateSummary, type SaakhWriter } from "./run.ts";
import { baseInput } from "./tools.ts";
import { sehore } from "./fixtures.ts";

type Step = { text?: string; tool?: string; input?: unknown };
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };

/** One scripted model turn as a V4 stream. */
function turn(steps: Step[]) {
  let n = 0;
  const chunks: unknown[] = [{ type: "stream-start", warnings: [] }, { type: "response-metadata", id: `r${Math.random()}`, modelId: "mock-sonnet" }];
  for (const s of steps) {
    const id = `p${n++}`;
    if (s.text) chunks.push({ type: "text-start", id }, { type: "text-delta", id, delta: s.text }, { type: "text-end", id });
    if (s.tool) chunks.push({ type: "tool-call", toolCallId: `call-${id}-${Math.random().toString(36).slice(2, 6)}`, toolName: s.tool, input: JSON.stringify(s.input ?? {}) });
  }
  chunks.push({ type: "finish", finishReason: { unified: steps.some((s) => s.tool) ? "tool-calls" : "stop", raw: undefined }, usage });
  return { stream: simulateReadableStream({ chunks, initialDelayInMs: null, chunkDelayInMs: null }) } as never;
}

function scripted(turns: Step[][]) {
  return new MockLanguageModelV4({ modelId: "mock-sonnet", doStream: turns.map(turn) });
}

function collect() {
  const parts: { type: string; [k: string]: unknown }[] = [];
  const writer: SaakhWriter = { write: (p) => void parts.push(p as never) };
  return { parts, writer };
}

const noTranslate = async (text: string) => ({ text, models: [] });
const engine = computeKcc(baseInput(sehore()));
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const goodSummary = `The KCC limit is ${inr(engine.kccLimit)} (para 10), with a year-1 limit of ${inr(engine.yearlyLimits[0])} (para 13(5)). The soybean rate is a PMFBY proxy, so confirm it with the bank SoF. The land record was not photographed. No high risks were found. Recommend approve; the officer decides.`;
const opening: Step[] = [{ text: "1. Compute the limit\n2. Run the risk rules\n3. Recommend" }, { tool: "compute_kcc" }, { tool: "run_risk_checks" }];

test("well-behaved agent: plan first, tools streamed, all checks pass", async () => {
  const { parts, writer } = collect();
  const model = scripted([opening, [{ text: "Limit computed, no high risks." }, { tool: "finish", input: { recommendation: "approve", confidence: "high", summary: goodSummary } }]]);
  const r = await runAgent(sehore(), writer, { model, translate: noTranslate });

  assert.equal(r.recommendation, "approve");
  assert.equal(r.summary, goodSummary);
  assert.deepEqual(r.result, engine);
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks.filter((c) => !c.ok)));
  assert.ok(r.risks.some((x) => x.code === "SOF_PROXY"));
  assert.ok(r.whatIfs.length >= 0);
  assert.equal(r.steps, 3);
  assert.deepEqual(r.models, ["mock-sonnet"]);

  const types = parts.map((p) => p.type);
  const plan = types.indexOf("data-plan");
  assert.ok(plan >= 0 && plan < types.indexOf("tool-input-available"), types.join(","));
  assert.deepEqual((parts[plan].data as { steps: string[] }).steps, ["Compute the limit", "Run the risk rules", "Recommend"]);
  const done = parts.filter((p) => p.type === "tool-output-available").length;
  assert.equal(done, 3);
  assert.ok(parts.filter((p) => p.type === "data-check").length >= 7);
});

test("forged rupee figure: one repair turn, still forged, downgraded with template summary", async () => {
  const { parts, writer } = collect();
  const forged = { recommendation: "approve", confidence: "high", summary: "The KCC limit is ₹9,99,999 (para 10). Approve." };
  const model = scripted([opening, [{ tool: "finish", input: forged }], [{ tool: "finish", input: forged }]]);
  const r = await runAgent(sehore(), writer, { model, translate: noTranslate });

  assert.equal(model.doStreamCalls.length, 3);
  assert.equal(r.recommendation, "review");
  assert.equal(r.confidence, "low");
  assert.equal(r.summary, templateSummary(r));
  assert.ok(!r.summary.includes("9,99,999"));
  assert.equal(r.checks.find((c) => c.verifier === "figures_from_tools")?.ok, false);
  assert.equal(r.checks.find((c) => c.verifier === "harness_downgrade")?.ok, false);
  assert.ok(parts.some((p) => p.type === "data-note" && /repair/.test((p.data as { text: string }).text)));
});

test("agent skips required tools: harness runs them, then the repair turn finishes", async () => {
  const { parts, writer } = collect();
  const model = scripted([[{ text: "This case looks fine to me." }], [{ tool: "finish", input: { recommendation: "approve", confidence: "medium", summary: goodSummary } }]]);
  const r = await runAgent(sehore(), writer, { model, translate: noTranslate });

  assert.equal(r.recommendation, "approve");
  assert.deepEqual(r.result, engine);
  assert.match(r.checks.find((c) => c.verifier === "required_tools")!.detail, /skipped compute_kcc, run_risk_checks/);
  const harness = parts.filter((p) => p.type === "tool-input-available" && String(p.toolCallId).startsWith("harness-")).map((p) => p.toolName);
  assert.deepEqual(harness, ["compute_kcc", "run_risk_checks"]);
  assert.ok(parts.some((p) => p.type === "data-plan"));
  // repair turn may only call finish
  assert.deepEqual(model.doStreamCalls[1].tools?.map((t) => t.name), ["finish"]);
  // first turn: finish hidden until required tools ran
  assert.ok(!model.doStreamCalls[0].tools?.some((t) => t.name === "finish"));
});

test("provider error before any work surfaces as an error", async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => {
      throw new Error("boom");
    },
  });
  await assert.rejects(runAgent(sehore(), collect().writer, { model, translate: noTranslate }), /boom/);
});

test("figures() normalises Indian-script digits and ignores order and grouping", () => {
  assert.equal(figures("limit ₹2,87,000 (para 10)"), figures("सीमा (पैरा १०) ₹२,८७,०००"));
  assert.equal(figures("₹1,78,000 then ₹2,87,000"), figures("₹2,87,000 ... ₹1,78,000"));
  assert.notEqual(figures("₹2,87,000"), figures("₹2,78,000"));
  assert.equal(figures("২.৪ ha"), figures("2.4 ha"));
});

test("crop-plan risks appear once even when the agent also calls check_crop_plan", async () => {
  const req = sehore();
  req.evidence.crops = [...req.evidence.crops, { crop: "wheat", season: "kharif", areaHa: 0.1 }];
  const { writer } = collect();
  const model = scripted([[...opening, { tool: "check_crop_plan" }], [{ tool: "finish", input: { recommendation: "review", confidence: "medium", summary: "Review the crop plan; the officer decides." } }]]);
  const r = await runAgent(req, writer, { model, translate: noTranslate });
  const crop = r.risks.filter((x) => x.code === "CROP_SEASON_IMPLAUSIBLE");
  assert.equal(crop.length, 1, JSON.stringify(r.risks.map((x) => x.code)));
});
