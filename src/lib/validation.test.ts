import { test } from "node:test";
import assert from "node:assert/strict";
import set from "../data/validation-set.json" with { type: "json" };
import { runCalc, runExtraction, runParity, scoreCrops, scoreLand, similarity, type ValidationSet } from "./validation.ts";

const vs = set as unknown as ValidationSet;
const land = { file: "/samples/khasra-1.jpg", ownerName: "रामप्रसाद पटेल", surveyNos: ["214/1"], areaHa: 2, aadhaarLast4: "4821" };
const plan = vs.parity.expectedCrops;
const okCrops = { crops: plan.map((c) => ({ ...c })) };

test("runCalc passes all 19 cases of the real validation set", () => {
  const r = runCalc(vs);
  assert.equal(r.total, 19);
  assert.deepEqual(r.failures, []);
  assert.equal(r.pass, 19);
});

test("runCalc reports a tampered expectation", () => {
  const c = structuredClone(vs.calc[0]);
  c.expected.kccLimit += 1000;
  c.expected.flags = [];
  const r = runCalc({ calc: [c] });
  assert.equal(r.pass, 0);
  assert.deepEqual(r.failures.map((f) => f.detail), ["kccLimit", "flags"]);
});

test("scoreLand: exact, tolerant and failing responses", () => {
  assert.deepEqual(scoreLand(land, { fields: { ownerName: "रामप्रसाद पटेल", surveyNos: ["२१४/१"], areaHa: 2, aadhaarLast4: "4821" } }), []);
  assert.deepEqual(scoreLand(land, { fields: { ownerName: "रामप्रसाद  पटेल.", surveyNos: ["214 / 1"], areaHa: 2.039, aadhaarLast4: "4821" } }), []);
  const bad = scoreLand(land, { fields: { ownerName: "सुनीता बाई", surveyNos: ["214/1", "215"], areaHa: 2.05, aadhaarLast4: null } });
  assert.deepEqual(bad.map((f) => f.detail), ["areaHa", "ownerName", "surveyNos", "aadhaarLast4"]);
  assert.equal(scoreLand(land, {}).length, 4);
});

test("similarity is 1 for identical and low for different names", () => {
  assert.equal(similarity("Ram Patel", "ram  patel"), 1);
  assert.ok(similarity("रामप्रसाद पटेल", "रामप्रशाद पटेल") >= 0.8);
  assert.ok(similarity("Ram Patel", "Sunita Bai") < 0.5);
});

test("scoreCrops: area tolerance, missing crop, wrong season", () => {
  assert.deepEqual(scoreCrops("hi-IN", plan, okCrops), []);
  const near = { crops: plan.map((c) => ({ ...c, areaHa: c.areaHa + 0.04 })) };
  assert.deepEqual(scoreCrops("hi-IN", plan, near), []);
  const far = { crops: plan.map((c, i) => ({ ...c, areaHa: c.areaHa + (i === 0 ? 0.1 : 0) })) };
  assert.equal(scoreCrops("hi-IN", plan, far)[0].detail, "areaHa");
  assert.equal(scoreCrops("hi-IN", plan, { crops: okCrops.crops.slice(1) })[0].detail, "crops");
  assert.equal(scoreCrops("hi-IN", plan, { crops: okCrops.crops.map((c) => ({ ...c, season: "zaid" })) })[0].detail, "crops");
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fake = (route: (url: string) => Response) => (async (url: string | URL | Request) => route(String(url))) as typeof fetch;

test("runners report AI unavailable on 503", async () => {
  const f = fake((u) => (u.startsWith("/api") ? json({ error: "AI not configured" }, 503) : new Response("img")));
  const e = await runExtraction(vs, { fetch: f });
  assert.equal(e.status, "unavailable");
  assert.equal(e.total, 10);
  const p = await runParity(vs, { fetch: f });
  assert.equal(p.status, "unavailable");
});

test("runParity retries a one-off provider error", async () => {
  let n = 0;
  const r = await runParity(vs, { fetch: fake(() => (n++ === 0 ? json({ error: "boom" }, 500) : json(okCrops))) });
  assert.equal(r.pass, vs.parity.transcripts.length);
});

test("runParity scores every language and records persistent request errors", async () => {
  const first = vs.parity.transcripts[0].lang;
  const f = (async (_u: string, init?: RequestInit) =>
    (init?.body as FormData).get("farmerLang") === first ? json({ error: "boom" }, 500) : json(okCrops)) as typeof fetch;
  const steps: number[] = [];
  const r = await runParity(vs, { fetch: f, onProgress: (d) => steps.push(d) });
  assert.equal(r.status, "done");
  const n = vs.parity.transcripts.length;
  assert.equal(r.total, n);
  assert.equal(r.pass, n - 1);
  assert.match(r.failures[0].detail, /boom/);
  assert.equal(steps.at(-1), n);
});
