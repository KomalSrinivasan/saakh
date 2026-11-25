import { test } from "node:test";
import assert from "node:assert/strict";
import { streamNote, takeEvents, type NoteEvent } from "./note-stream.ts";

const ndjson = (chunks: string[], status = 200) =>
  (async () =>
    new Response(
      new ReadableStream({
        start(c) {
          for (const s of chunks) c.enqueue(new TextEncoder().encode(s));
          c.close();
        },
      }),
      { status },
    )) as unknown as typeof fetch;

test("takeEvents keeps the unfinished tail", () => {
  const r = takeEvents('{"type":"checking"}\n{"type":"dra');
  assert.deepEqual(r.events, [{ type: "checking" }]);
  assert.equal(r.rest, '{"type":"dra');
});

test("streamNote passes draft events through and resolves only on done", async () => {
  const seen: NoteEvent[] = [];
  const done = { type: "done", officer: "Limit ₹1,99,000 (para 10)", farmer: "x", models: ["m"] };
  const r = await streamNote({}, (e) => seen.push(e), new AbortController().signal, ndjson(['{"type":"draft","text":"Lim"}\n{"type":"dra', 'ft","text":"it"}\n{"type":"checking"}\n', JSON.stringify(done)]));
  assert.deepEqual(seen.map((e) => e.type), ["draft", "draft", "checking"]);
  assert.deepEqual(r, { ok: true, data: done });
});

test("streamNote maps a streamed error and a stream cut before done to failures", async () => {
  const err = await streamNote({}, () => {}, new AbortController().signal, ndjson(['{"type":"redraft"}\n{"type":"error","error":"bad figures","retryable":true,"status":502}\n']));
  assert.deepEqual(err, { ok: false, status: 502, error: { kind: "provider", message: "bad figures" } });
  const cut = await streamNote({}, () => {}, new AbortController().signal, ndjson(['{"type":"draft","text":"x"}\n']));
  assert.equal(cut.ok, false);
});

test("streamNote maps a JSON error response before the stream starts", async () => {
  const f = (async () => Response.json({ error: "AI not configured" }, { status: 503 })) as unknown as typeof fetch;
  const r = await streamNote({}, () => {}, new AbortController().signal, f);
  assert.deepEqual(r, { ok: false, status: 503, error: { kind: "config", message: "AI not configured" } });
});
