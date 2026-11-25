// Client side of POST /api/ai/note with stream: true (NDJSON). Draft text is unverified until "done".
export type NoteDone = { type: "done"; officer: string; farmer: string; models: string[] };
export type NoteEvent =
  | { type: "draft"; text: string; reset?: boolean }
  | { type: "checking" }
  | { type: "redraft" }
  | NoteDone
  | { type: "error"; error: string; retryable: boolean; status: number };

export type NoteFail = { kind: "config" | "timeout" | "offline" | "input" | "provider"; message: string };
export type NoteResult = { ok: true; data: NoteDone } | { ok: false; error: NoteFail; status: number };

const CLIENT_TIMEOUT_MS = 60_000;
const kindOf = (status: number): NoteFail["kind"] => (status === 503 ? "config" : status === 504 ? "timeout" : status === 400 ? "input" : "provider");

/** Complete NDJSON events in `buf` and the unfinished tail. */
export function takeEvents(buf: string): { events: NoteEvent[]; rest: string } {
  const lines = buf.split("\n");
  const rest = lines.pop() ?? "";
  return { events: lines.filter((l) => l.trim()).map((l) => JSON.parse(l) as NoteEvent), rest };
}

/** Streams a note draft; calls onEvent per event and resolves with the verified note or a failure. Never throws. */
export async function streamNote(body: object, onEvent: (e: NoteEvent) => void, signal: AbortSignal, fetchFn: typeof fetch = fetch): Promise<NoteResult> {
  let status = 0;
  try {
    const res = await fetchFn("/api/ai/note", {
      method: "POST",
      body: JSON.stringify({ ...body, stream: true }),
      headers: { "content-type": "application/json" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)]),
    });
    status = res.status;
    if (!res.ok || !res.body) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, status, error: { kind: kindOf(status), message: String(j.error ?? res.statusText) } };
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buf += value;
      const { events, rest } = takeEvents(done ? buf + "\n" : buf);
      buf = rest;
      for (const e of events) {
        if (e.type === "done") return { ok: true, data: e };
        if (e.type === "error") return { ok: false, status: e.status, error: { kind: kindOf(e.status), message: e.error } };
        onEvent(e);
      }
      if (done) return { ok: false, status, error: { kind: "provider", message: "stream ended before the note was verified" } };
    }
  } catch (e) {
    const timedOut = e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError");
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    return { ok: false, status, error: { kind: timedOut ? "timeout" : offline ? "offline" : "provider", message: String(e) } };
  }
}
