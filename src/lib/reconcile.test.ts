import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileLand, type RawLand } from "./reconcile.ts";

const sarvam: RawLand = { ownerName: "रामप्रसाद पटेल", village: "सांवेर", surveyNos: ["१२३/१", "45"], areaHa: 2.02, aadhaarLast4: "4821", areaUnitSeen: "hectare" };
const claude: RawLand = { ownerName: "Ramprasad Patel", village: "Sanwer", surveyNos: ["45", "123/ 1"], areaHa: 2.0, aadhaarLast4: "4821", areaUnitSeen: "hectare" };

test("both reads agree after normalising script, digits and order", () => {
  const ev = reconcileLand(sarvam, claude);
  for (const k of ["ownerName", "village", "surveyNos", "areaHa", "aadhaarLast4"] as const) assert.ok(ev[k].agree, k);
  assert.equal(ev.ownerName.value, "Ramprasad Patel");
  assert.deepEqual(ev.surveyNos.value, ["45", "123/1"]);
  assert.equal(ev.areaHa.reads.length, 2);
});

test("disagreeing fields keep both reads and prefer the claude-vision value", () => {
  const ev = reconcileLand(sarvam, { ...claude, ownerName: "Ramesh Patidar", areaHa: 2.5, aadhaarLast4: "9999" });
  assert.equal(ev.ownerName.agree, false);
  assert.equal(ev.ownerName.value, "Ramesh Patidar");
  assert.equal(ev.areaHa.agree, false);
  assert.equal(ev.areaHa.value, 2.5);
  assert.equal(ev.aadhaarLast4.agree, false);
  assert.deepEqual(ev.ownerName.reads.map((r) => r.source), ["sarvam-vision", "claude-vision"]);
});

test("one read missing: nothing agrees, only the present read is listed", () => {
  const ev = reconcileLand(sarvam, null);
  assert.equal(ev.village.agree, false);
  assert.deepEqual(ev.village.reads, [{ source: "sarvam-vision", value: "सांवेर" }]);
  assert.equal(ev.areaHa.value, 2.02);
  assert.deepEqual(ev.surveyNos.value, ["123/1", "45"]);
});
