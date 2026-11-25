import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, decide, editInputs, maskAadhaar, newCase, transition, type Case } from "./store.ts";
import type { KccResult } from "./kcc.ts";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const result = { kccLimit: 276_000 } as KccResult;
const computed = (): Case => ({ ...transition(newCase({ district: "Sehore", farmerLang: "mr-IN", officerLang: "hi-IN" }), "computed"), result });

test("new case starts as draft with defaults", () => {
  const c = newCase({ district: "Sehore", farmerLang: "mr-IN", officerLang: "hi-IN" });
  assert.equal(c.status, "draft");
  assert.equal(c.recoveryTieUp, false);
  assert.match(c.id, /^[0-9a-f-]{36}$/);
});

test("draft -> computed is allowed, draft -> approved is not", () => {
  const c = newCase({ district: "Sehore", farmerLang: "hi-IN", officerLang: "hi-IN" });
  assert.equal(transition(c, "computed").status, "computed");
  assert.throws(() => transition(c, "approved"), /Illegal/);
  assert.throws(() => transition(c, "rejected"), /Illegal/);
});

test("editing a computed case drops it to draft and clears result", () => {
  const c = editInputs(computed(), { landHa: 3 });
  assert.equal(c.status, "draft");
  assert.equal(c.landHa, 3);
  assert.equal(c.result, undefined);
});

test("decisions lock the case", () => {
  const ok = decide(computed(), { action: "approved", finalLimit: 276_000, by: "Ravi" });
  assert.equal(ok.status, "approved");
  assert.ok(ok.decision?.at);
  assert.throws(() => editInputs(ok, { landHa: 1 }), /locked/);
  assert.throws(() => transition(ok, "draft"), /Illegal/);
  assert.throws(() => transition(ok, "rejected"), /Illegal/);
});

test("edited limit or rejection requires a reason", () => {
  assert.throws(() => decide(computed(), { action: "edited_approved", finalLimit: 250_000, by: "Ravi" }), /Reason/);
  assert.throws(() => decide(computed(), { action: "rejected", finalLimit: 0, by: "Ravi", reason: " " }), /Reason/);
  assert.throws(() => decide(computed(), { action: "approved", finalLimit: 250_000, by: "Ravi" }), /edited_approved/);
  assert.equal(decide(computed(), { action: "edited_approved", finalLimit: 250_000, by: "Ravi", reason: "Lower SoF" }).status, "edited_approved");
});

test("store CRUD and locked cases cannot be overwritten", () => {
  const s = createStore(mem());
  const c = computed();
  s.saveCase(c);
  assert.equal(s.getCase(c.id)?.status, "computed");
  assert.equal(s.listCases().length, 1);
  const done = s.saveCase(decide(c, { action: "rejected", finalLimit: 0, by: "Ravi", reason: "No land record" }));
  assert.throws(() => s.saveCase({ ...done, status: "draft" }), /locked/);
  s.deleteCase(c.id);
  assert.equal(s.listCases().length, 0);
});

test("aadhaar is stored as last 4 digits only", () => {
  assert.equal(maskAadhaar("1234 5678 9012"), "9012");
  assert.throws(() => maskAadhaar("12345"));
  const s = createStore(mem());
  const c = newCase({ district: "Sehore", farmerLang: "hi-IN", officerLang: "hi-IN", farmer: { aadhaarLast4: "123456789012" } });
  assert.throws(() => s.saveCase(c), /4 digits/);
});

test("officer profile round trip and name validation", () => {
  const s = createStore(mem());
  assert.equal(s.getProfile(), null);
  s.saveProfile({ name: "Ravi Sharma", institution: "Sehore DCCB", uiLang: "hi-IN" });
  assert.equal(s.getProfile()?.name, "Ravi Sharma");
  assert.throws(() => s.saveProfile({ name: "R", institution: "", uiLang: "hi-IN" }));
});
