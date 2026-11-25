"use client";

import { useEffect, useState, type ReactNode } from "react";
import { append } from "@/lib/audit";
import { useUi } from "@/components/ui-provider";
import { Badge, Callout, Card as UiCard, cx, inr, Spinner } from "@/components/ui";

export { inr };
export const cropName = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);

export type AiFail = { kind: "config" | "timeout" | "offline" | "input" | "provider"; message: string };
export type AiResult<T> = { ok: true; data: T } | { ok: false; error: AiFail };

const CLIENT_TIMEOUT_MS = 60_000;

/** Lucide-style stroke icon, 1.75 stroke per the design system. */
export function Ico({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  check: "M5 12l5 5L20 7",
  camera: "M3 8.5A1.5 1.5 0 014.5 7h2.3l1.7-2.5h7l1.7 2.5h2.3A1.5 1.5 0 0121 8.5v10a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  upload: "M12 15V3m0 0l-4 4m4-4l4 4M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4",
  file: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M9 13h6M9 17h4",
  mic: "M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM19 11a7 7 0 01-14 0M12 18v3",
  stop: "M7 7h10v10H7z",
  alert: "M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM9 12l2 2 4-4",
  lock: "M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z",
  back: "M15 18l-6-6 6-6",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  arrow: "M5 12h14m-5-5l5 5-5 5",
  help: "M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
  x: "M18 6L6 18M6 6l12 12",
  chevron: "M9 6l6 6-6 6",
} as const;

/** POSTs to /api/ai/[action], logs an ai_call audit event, never throws. */
export async function callAi<T extends { models?: string[] }>(action: string, body: FormData | object, caseId: string, actor: string): Promise<AiResult<T>> {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  let out: AiResult<T>;
  let status = 0;
  try {
    const isForm = body instanceof FormData;
    const res = await fetch(`/api/ai/${action}`, {
      method: "POST",
      body: isForm ? body : JSON.stringify(body),
      headers: isForm ? undefined : { "content-type": "application/json" },
      signal: ctrl.signal,
    });
    status = res.status;
    const json = await res.json().catch(() => ({}));
    if (res.ok) out = { ok: true, data: json as T };
    else {
      const kind: AiFail["kind"] = res.status === 503 ? "config" : res.status === 504 ? "timeout" : res.status === 400 ? "input" : "provider";
      out = { ok: false, error: { kind, message: String(json.error ?? res.statusText) } };
    }
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    out = { ok: false, error: { kind: aborted ? "timeout" : offline ? "offline" : "provider", message: String(e) } };
  } finally {
    clearTimeout(timer);
  }
  const ms = Math.round(performance.now() - started);
  const models = out.ok ? (out.data.models ?? []) : [];
  append({ caseId, type: "ai_call", actor, data: { action, models, ms, ok: out.ok, ...(out.ok ? {} : { status, error: out.error.kind }) } }).catch(() => {});
  return out;
}

/** Kept for other case panels; delegates to the shared Card primitive. */
export function Card({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <UiCard title={title} className={className}>
      {children}
    </UiCard>
  );
}

/** Spinner with elapsed seconds and optional step list so long AI waits never look frozen. */
export function AiBusy({ label, onCancel, steps }: { label: string; onCancel?: () => void; steps?: string[] }) {
  const { t } = useUi();
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const active = steps ? Math.min(steps.length - 1, Math.floor(secs / 4)) : 0;
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="rounded-lg border border-line bg-subtle px-4 py-3.5">
      <div className="flex items-center gap-3">
        <Spinner className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-ink">{label}</p>
          <p className="num text-[12px] text-muted">
            {t("ai.elapsed", { s: secs })}
            {secs >= 15 && <span className="ml-1.5">{t("ai.slow")}</span>}
          </p>
        </div>
        {onCancel && (
          <button type="button" className="btn-ghost h-9 px-3 text-[13px]" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        )}
      </div>
      {steps && (
        <ol className="mt-3 space-y-1.5 border-t border-line pt-3">
          {steps.map((s, i) => (
            <li key={s} className={cx("flex items-center gap-2 text-[13px]", i < active ? "text-ink-2" : i === active ? "font-medium text-ink" : "text-muted")}>
              <span className={cx("grid h-4 w-4 shrink-0 place-items-center rounded-full", i < active ? "bg-primary text-on-primary" : i === active ? "text-primary" : "border border-line-strong")}>
                {i < active ? <Ico d={ICONS.check} className="h-3 w-3" /> : i === active ? <Spinner className="h-3.5 w-3.5" /> : null}
              </span>
              {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function AiErrorBox({ error, fallbackKey, onRetry, onManual, manualKey = "error.manual" }: { error: AiFail; fallbackKey: string; onRetry?: () => void; onManual: () => void; manualKey?: string }) {
  const { t } = useUi();
  const msg =
    error.kind === "config" ? t("ai.notConfigured") : error.kind === "timeout" ? t("error.timeout") : error.kind === "offline" ? t("offline.aiUnavailable") : t(fallbackKey);
  return (
    <Callout tone="danger" title={msg}>
      {error.kind === "input" && <p className="break-words">{error.message}</p>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {onRetry && error.kind !== "config" && (
          <button type="button" className="btn-ghost h-9 px-3 text-[13px]" onClick={onRetry}>
            {t("error.retry")}
          </button>
        )}
        <button type="button" className="btn-primary h-9 px-3 text-[13px]" onClick={onManual}>
          {t(manualKey)}
        </button>
      </div>
    </Callout>
  );
}

export function ConfidenceChip({ value }: { value?: number }) {
  const { t } = useUi();
  if (value == null) return null;
  const tone = value >= 0.9 ? "success" : value >= 0.7 ? "warn" : "danger";
  return (
    <Badge tone={tone} dot className="num">
      {t("ai.confidence", { pct: Math.round(value * 100) })}
    </Badge>
  );
}

export function FollowUps({ items }: { items?: string[] }) {
  const { t } = useUi();
  if (!items?.length) return null;
  return (
    <Callout tone="warn" title={t("case.followUp")}>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ul>
    </Callout>
  );
}
