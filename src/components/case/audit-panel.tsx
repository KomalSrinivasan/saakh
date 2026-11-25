"use client";

import { useCallback, useEffect, useState } from "react";
import { append, exportCase, list, verify, type AuditEvent, type AuditType, type VerifyResult } from "@/lib/audit";
import { Icon } from "@/components/shell";
import { useUi } from "@/components/ui-provider";
import { Badge, Callout, Card, Spinner, cx, inr } from "@/components/ui";

const TYPE_ICON: Record<AuditType, string> = {
  created: "M12 5v14M5 12h14",
  extracted: "M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M8 12h8",
  confirmed: "M9 11l3 3 8-8M20 12v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h11",
  computed: "M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01",
  ai_call: "M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2M7 5h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2zM10 10h4v4h-4z",
  note_drafted: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5M9 13h6M9 17h4",
  decision: "M9 12l2 2 4-4m5.6-4.4A12 12 0 0112 2.9 12 12 0 013.4 7.6 12 12 0 0012 21.1a12 12 0 008.6-13.5z",
  exported: "M12 3v12m0 0l-4-4m4 4l4-4M4 19h16",
  agent_run: "M12 3l2.2 4.6 5 .7-3.6 3.5.9 5L12 14.5 7.5 16.8l.9-5L4.8 8.3l5-.7z",
};
const SHIELD = TYPE_ICON.decision;
const BROKEN = "M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z";
const COPY = "M9 9h10a1 1 0 011 1v10a1 1 0 01-1 1H9a1 1 0 01-1-1V10a1 1 0 011-1zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1";
const CHECK = "M20 6L9 17l-5-5";

type T = (k: string, v?: Record<string, string | number>) => string;

/** One-line human summary of an event payload; never shows raw media. */
function summary(e: AuditEvent, t: T): string {
  const d = e.data as Record<string, unknown>;
  switch (e.type) {
    case "ai_call":
      return `${d.action} · ${d.ok ? "ok" : `failed${d.error ? ` (${d.error})` : ""}`} · ${Number(d.ms ?? 0).toLocaleString("en-IN")} ms${Array.isArray(d.models) && d.models.length ? ` · ${d.models.join(", ")}` : ""}`;
    case "computed": {
      const s = d.summary as { kccLimit?: number } | undefined;
      return s?.kccLimit != null ? `${inr(s.kccLimit)} · ${String(d.engine ?? "")}` : String(d.engine ?? "");
    }
    case "decision":
      return `${t(`status.${d.action}`)} · ${inr(Number(d.finalLimit ?? 0))}${d.reason ? ` · "${d.reason}"` : ""}`;
    case "confirmed": {
      const i = d.inputs as { landHa?: number; crops?: unknown[] } | undefined;
      return i ? `${i.landHa} ha · ${i.crops?.length ?? 0} crops` : "";
    }
    case "extracted":
      return String(d.kind ?? "");
    case "note_drafted":
      return Array.isArray(d.models) ? d.models.join(", ") : "";
    default:
      return Object.entries(d)
        .filter(([, v]) => typeof v !== "object")
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
  }
}

function HashChip({ hash, label }: { hash: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={hash}
      aria-label={label}
      className="group inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-line bg-subtle px-2 font-mono text-[11px] text-muted transition-colors hover:border-line-strong hover:text-ink-2"
    >
      <span className="text-muted/70">sha256</span>
      <span className="truncate">
        {hash.slice(0, 10)}…{hash.slice(-6)}
      </span>
      <Icon d={copied ? CHECK : COPY} className={cx("h-3 w-3 shrink-0", copied ? "text-success" : "opacity-60 group-hover:opacity-100")} />
    </button>
  );
}

export function AuditPanel({ caseId, actor, version }: { caseId: string; actor: string; version: number }) {
  const { t, lang } = useUi();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [check, setCheck] = useState<(VerifyResult & { total: number }) | "busy" | null>(null);
  const [err, setErr] = useState("");

  const refresh = useCallback(() => {
    try {
      setEvents(list(caseId));
    } catch {
      setEvents([]);
    }
  }, [caseId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- re-read localStorage when the case changes
  useEffect(refresh, [refresh, version]);

  const runVerify = async () => {
    setCheck("busy");
    // Short floor so the recompute step is visible, not a flicker.
    const floor = new Promise((r) => setTimeout(r, 450));
    let res: VerifyResult;
    try {
      res = await verify();
    } catch {
      res = { ok: false, reason: "error" };
    }
    await floor;
    let total = 0;
    try {
      total = list().length;
    } catch {}
    refresh();
    setCheck({ ...res, total });
  };

  const doExport = async () => {
    setErr("");
    try {
      const data = exportCase(caseId);
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `saakh-case-${caseId.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await append({ caseId, type: "exported", actor, data: { events: data.events.length } });
      refresh();
    } catch {
      setErr(t("error.generic"));
    }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const result = check && check !== "busy" ? check : null;
  const brokenAt = result && !result.ok ? (result.brokenAt ?? 0) : null;
  const broken = events.find((e) => e.seq === brokenAt);
  const why = result?.reason === "prevHash mismatch" ? "audit.why.link" : result?.reason === "seq gap" ? "audit.why.gap" : "audit.why.hash";

  return (
    <Card
      title={t("audit.trail")}
      description={t("audit.hint")}
      actions={
        <button type="button" className="btn-ghost h-9 px-3 text-[13px]" onClick={doExport}>
          <Icon d={TYPE_ICON.exported} className="h-4 w-4" />
          <span className="hidden sm:inline">{t("audit.exportShort")}</span>
          <span className="sr-only sm:hidden">{t("audit.exportShort")}</span>
        </button>
      }
      flush
    >
      <div className="space-y-3 border-b border-line px-5 py-4">
        {!result ? (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-[13px]">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted">
                {check === "busy" ? <Spinner className="text-primary" /> : <Icon d={SHIELD} className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <div className="font-medium text-ink">{check === "busy" ? t("audit.recomputing") : t("audit.idleTitle")}</div>
                <div className="text-muted">{t("audit.idleSub")}</div>
              </div>
            </div>
            <button type="button" className="btn-primary shrink-0" onClick={runVerify} disabled={check === "busy"}>
              {check === "busy" ? t("audit.verifying") : t("audit.verify")}
            </button>
          </div>
        ) : result.ok ? (
          <div role="status">
            <Callout
              tone="success"
              title={
                <span className="flex items-center gap-2">
                  <Icon d={CHECK} className="h-4 w-4" />
                  {t("audit.intact", { n: result.total })}
                </span>
              }
              action={
                <button type="button" className="btn-ghost h-9 px-3 text-[13px]" onClick={runVerify}>
                  {t("audit.recheck")}
                </button>
              }
            >
              {t("audit.intactBody")}
            </Callout>
          </div>
        ) : (
          <div role="status" className="overflow-hidden rounded-lg border border-danger/30 bg-danger-soft">
            <div className="flex items-start gap-3 px-4 py-3.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-danger text-white">
                <Icon d={BROKEN} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 text-[13px] leading-5">
                <div className="text-[14px] font-semibold text-danger">{t("audit.brokenTitle", { seq: brokenAt || "?" })}</div>
                <p className="mt-0.5 text-ink-2">{t(why, { seq: brokenAt || "?", event: broken ? t(`audit.type.${broken.type}`) : t("audit.anEvent") })}</p>
                <p className="mt-1 text-ink-2">{t("audit.brokenAfter")}</p>
              </div>
              <button type="button" className="btn-danger hidden h-9 shrink-0 px-3 text-[13px] sm:inline-flex" onClick={runVerify}>
                {t("audit.recheck")}
              </button>
            </div>
            <div className="border-t border-danger/20 bg-surface/60 px-4 py-2 font-mono text-[11px] text-danger">
              {t("audit.reason")}: {result.reason ?? "unknown"} · seq {brokenAt ?? "?"}
            </div>
          </div>
        )}
        {err && <p className="text-[13px] text-danger">{err}</p>}
      </div>

      {events.length === 0 ? (
        <p className="px-5 py-8 text-center text-[14px] text-muted">{t("audit.empty")}</p>
      ) : (
        <ol className="px-5 py-4">
          {events.map((e, i) => {
            const bad = brokenAt != null && e.seq === brokenAt;
            const after = brokenAt != null && e.seq > brokenAt;
            const ok = !!result && !bad && !after;
            const s = summary(e, t);
            return (
              <li key={e.seq} className="relative flex gap-3.5 pb-5 last:pb-0">
                {i < events.length - 1 && <span aria-hidden="true" className={cx("absolute top-9 bottom-0 left-[15px] w-px", after || bad ? "bg-danger/30" : "bg-line")} />}
                <span
                  aria-hidden="true"
                  className={cx(
                    "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border",
                    bad ? "border-danger bg-danger text-white ring-4 ring-danger/15" : after ? "border-danger/30 bg-surface text-danger/70" : ok ? "border-success/30 bg-success-soft text-success" : "border-line bg-surface text-ink-2",
                  )}
                >
                  <Icon d={bad ? BROKEN : TYPE_ICON[e.type] ?? SHIELD} className="h-4 w-4" />
                </span>
                <div className={cx("min-w-0 flex-1 pt-1", bad && "-mx-2 -mt-1 rounded-lg border border-danger/30 bg-danger-soft/70 px-2 pt-2 pb-2")}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[14px] font-semibold text-ink">{t(`audit.type.${e.type}`)}</span>
                    <span className="num font-mono text-[11px] text-muted">#{e.seq}</span>
                    {bad && <Badge tone="danger">{t("audit.tampered")}</Badge>}
                    {after && <Badge tone="warn">{t("audit.unverified")}</Badge>}
                    {ok && (
                      <span className="inline-flex items-center gap-1 text-[12px] text-success">
                        <Icon d={CHECK} className="h-3 w-3" />
                        {t("audit.verifiedShort")}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-[13px] text-muted">
                    <span>{e.actor || t("audit.system")}</span>
                    <time dateTime={e.at} className="num text-[12px]">
                      {fmt(e.at)}
                    </time>
                  </div>
                  {s && <p className="mt-1 text-[13px] leading-5 break-words text-ink-2">{s}</p>}
                  <div className="mt-2">
                    <HashChip hash={e.hash} label={t("audit.copyHash", { seq: e.seq })} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
