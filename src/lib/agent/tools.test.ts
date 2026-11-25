import { test } from "node:test";
import assert from "node:assert/strict";
import { computeKcc } from "../kcc.ts";
import { baseInput, execTool, makeTools, MAX_QUESTIONS, parseFinish, TOOL_NAMES } from "./tools.ts";
import { sehore } from "./fixtures.ts";
import type { ToolState } from "./tools.ts";

const ctx = (req = sehore()) => ({ req, state: { questions: [], models: [] } as ToolState });

test("tool set covers every AgentTool", () => {
  assert.deepEqual(Object.keys(makeTools(sehore(), { state: { questions: [], models: [] } })).sort(), [...TOOL_NAMES].sort());
});

test("compute_kcc uses evidence only, model input is ignored", async () => {
  const c = ctx();
  const out = await execTool("compute_kcc", { landHa: 100, kccLimit: 9_999_999 }, c);
  assert.ok(out.ok);
  assert.deepEqual(out.data, computeKcc(baseInput(c.req)));
  assert.equal(c.state.result, out.data);
  assert.match(out.summary, /para 10/);
});

test("baseInput drops SoF provenance fields", () => {
  assert.deepEqual(baseInput(sehore()).sof.soybean, { current: 43_100, previous: 42_000 });
});

test("lookup_sof resolves aliases and reports provenance", async () => {
  const out = await execTool("lookup_sof", { crop: "Soyabean" }, ctx());
  assert.ok(out.ok);
  assert.equal((out.data as { crop: string }).crop, "soybean");
  assert.match(out.summary, /proxy-pmfby, state scope/);
  const miss = await execTool("lookup_sof", { crop: "dragonfruit" }, ctx());
  assert.equal(miss.ok, false);
  assert.match(miss.summary, /13\(4\)/);
});

test("finish is refused before the required tools", async () => {
  const out = await execTool("finish", { recommendation: "approve", confidence: "high", summary: "ok" }, ctx());
  assert.equal(out.ok, false);
});

test("finish parsing validates enums and tags agent risks", () => {
  assert.equal(typeof parseFinish({ recommendation: "yes", confidence: "high", summary: "x" }), "string");
  assert.equal(typeof parseFinish({ recommendation: "approve", confidence: "high", summary: " " }), "string");
  const f = parseFinish({ recommendation: "review", confidence: "medium", summary: "Check it.", agentRisks: [{ code: "odd_crop", severity: "bad", title: "Odd", detail: "d", evidence: [1] }] });
  assert.ok(typeof f !== "string");
  assert.deepEqual(f.agentRisks[0], { code: "ODD_CROP", severity: "medium", title: "Odd", detail: "d", evidence: ["1"], source: "agent" });
});

test("ask_officer caps questions and translates for the farmer", async () => {
  const c = ctx({ ...sehore(), officerLang: "en-IN", farmerLang: "hi-IN" });
  const calls: string[] = [];
  const full = { ...c, translate: async (t: string, _f: string, to: string) => (calls.push(to), { text: `[${to}] ${t}`, models: ["mayura:v1"] }) };
  for (let i = 0; i < MAX_QUESTIONS; i++) assert.ok((await execTool("ask_officer", { question: `Q${i}?`, why: "w", askFarmer: i === 0 }, full)).ok);
  assert.equal((await execTool("ask_officer", { question: "Q4?", why: "w", askFarmer: false }, full)).ok, false);
  assert.equal(c.state.questions.length, MAX_QUESTIONS);
  assert.equal(c.state.questions[0].askFarmer, "[hi-IN] Q0?");
  assert.equal(c.state.questions[0].text, "Q0?");
  assert.deepEqual(calls, ["hi-IN"]);
});
