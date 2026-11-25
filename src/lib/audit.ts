import { browserStorage, getCase, type Case, type StorageLike } from "./store.ts";

export type AuditType = "created" | "extracted" | "confirmed" | "computed" | "ai_call" | "note_drafted" | "decision" | "exported" | "agent_run";

export interface AuditEvent {
  seq: number;
  caseId: string;
  type: AuditType;
  at: string;
  actor: string;
  data: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export type AuditInput = Pick<AuditEvent, "caseId" | "type" | "actor" | "data"> & { at?: string };
export type VerifyResult = { ok: boolean; brokenAt?: number; reason?: string };

export const AUDIT_KEY = "saakh.audit";
export const GENESIS = "GENESIS";

/** JSON with object keys sorted at every level. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

export async function hashEvent(e: Omit<AuditEvent, "hash">): Promise<string> {
  const bytes = new TextEncoder().encode(e.prevHash + canonical(e));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createAudit(storage: StorageLike) {
  const read = (): AuditEvent[] => JSON.parse(storage.getItem(AUDIT_KEY) ?? "[]");
  let queue: Promise<unknown> = Promise.resolve();

  return {
    // Serialized so concurrent appends cannot fork the chain.
    append(input: AuditInput): Promise<AuditEvent> {
      const run = queue.then(async () => {
        const events = read();
        const last = events.at(-1);
        const body = {
          seq: (last?.seq ?? 0) + 1,
          caseId: input.caseId,
          type: input.type,
          at: input.at ?? new Date().toISOString(),
          actor: input.actor,
          data: input.data,
          prevHash: last?.hash ?? GENESIS,
        };
        const event = { ...body, hash: await hashEvent(body) };
        storage.setItem(AUDIT_KEY, JSON.stringify([...events, event]));
        return event;
      });
      queue = run.catch(() => {});
      return run;
    },
    async verify(): Promise<VerifyResult> {
      let prev: AuditEvent | undefined;
      for (const e of read()) {
        const { hash, ...body } = e;
        if (e.prevHash !== (prev?.hash ?? GENESIS)) return { ok: false, brokenAt: e.seq, reason: "prevHash mismatch" };
        if (e.seq !== (prev?.seq ?? 0) + 1) return { ok: false, brokenAt: e.seq, reason: "seq gap" };
        if (hash !== (await hashEvent(body))) return { ok: false, brokenAt: e.seq, reason: "hash mismatch" };
        prev = e;
      }
      return { ok: true };
    },
    list: (caseId?: string): AuditEvent[] => read().filter((e) => !caseId || e.caseId === caseId),
  };
}

let audit: ReturnType<typeof createAudit> | undefined;
const defaultAudit = () => (audit ??= createAudit(browserStorage()));

export const append = (input: AuditInput) => defaultAudit().append(input);
export const verify = () => defaultAudit().verify();
export const list = (caseId?: string) => defaultAudit().list(caseId);

export function exportCase(caseId: string): { case: Case | undefined; events: AuditEvent[] } {
  return { case: getCase(caseId), events: list(caseId) };
}
