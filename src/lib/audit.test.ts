import { test } from "node:test";
import assert from "node:assert/strict";
import { AUDIT_KEY, GENESIS, canonical, createAudit, type AuditEvent } from "./audit.ts";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

async function seeded() {
  const s = mem();
  const a = createAudit(s);
  await a.append({ caseId: "c1", type: "created", actor: "Ravi", data: { district: "Sehore" } });
  await a.append({ caseId: "c1", type: "computed", actor: "system", data: { kccLimit: 276_000 } });
  await a.append({ caseId: "c2", type: "created", actor: "Ravi", data: {} });
  const events = (): AuditEvent[] => JSON.parse(s.getItem(AUDIT_KEY)!);
  const put = (e: AuditEvent[]) => s.setItem(AUDIT_KEY, JSON.stringify(e));
  return { a, events, put };
}

test("canonical JSON sorts keys at every level", () => {
  assert.equal(canonical({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
});

test("append chains events from GENESIS with sha-256 hex", async () => {
  const { a, events } = await seeded();
  const [e1, e2, e3] = events();
  assert.deepEqual([e1.seq, e2.seq, e3.seq], [1, 2, 3]);
  assert.equal(e1.prevHash, GENESIS);
  assert.equal(e2.prevHash, e1.hash);
  assert.match(e1.hash, /^[0-9a-f]{64}$/);
  assert.equal(a.list("c1").length, 2);
  assert.equal(a.list().length, 3);
});

test("concurrent appends keep a linear chain", async () => {
  const a = createAudit(mem());
  await Promise.all([1, 2, 3, 4].map((n) => a.append({ caseId: "c", type: "ai_call", actor: "system", data: { n } })));
  assert.deepEqual(a.list().map((e) => e.seq), [1, 2, 3, 4]);
  assert.deepEqual(await a.verify(), { ok: true });
});

test("verify passes on an untouched chain and an empty one", async () => {
  assert.deepEqual(await (await seeded()).a.verify(), { ok: true });
  assert.deepEqual(await createAudit(mem()).verify(), { ok: true });
});

test("verify detects altered data", async () => {
  const { a, events, put } = await seeded();
  const e = events();
  e[1].data.kccLimit = 500_000;
  put(e);
  assert.deepEqual(await a.verify(), { ok: false, brokenAt: 2, reason: "hash mismatch" });
});

test("verify detects a removed event", async () => {
  const { a, events, put } = await seeded();
  const e = events();
  put([e[0], e[2]]);
  const r = await a.verify();
  assert.equal(r.ok, false);
  assert.equal(r.brokenAt, 3);
});

test("verify detects reordered events", async () => {
  const { a, events, put } = await seeded();
  const [e1, e2, e3] = events();
  put([e1, e3, e2]);
  const r = await a.verify();
  assert.equal(r.ok, false);
  assert.equal(r.brokenAt, 3);
});

test("verify detects a forged rehash of a tampered event", async () => {
  const { a, events, put } = await seeded();
  const e = events();
  e[0].actor = "Mallory";
  e[0].hash = "0".repeat(64);
  put(e);
  assert.equal((await a.verify()).brokenAt, 1);
});
