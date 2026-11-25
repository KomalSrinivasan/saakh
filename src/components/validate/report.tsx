"use client";

import { Fragment, type ReactNode } from "react";
import type { CategoryResult, Failure } from "@/lib/validation";
import { Badge, Card, Para, Spinner, cx } from "@/components/ui";
import { useUi } from "@/components/ui-provider";

export type Prog = { done: number; total: number };

/** Category status badge: Running / Passed / Failed / AI unavailable / Offline / Not run. */
export function StatusBadge({ r, prog }: { r: CategoryResult; prog?: Prog }) {
  const { t } = useUi();
  if (prog) return <Badge tone="info"><Spinner className="h-3 w-3 border-[1.5px]" />{t("validate.status.running")}</Badge>;
  if (r.status === "unavailable") return <Badge tone="warn" dot>{t(r.reason === "offline" ? "validate.offlineShort" : "validate.status.aiOff")}</Badge>;
  if (r.status === "idle") return <Badge dot>{t("validate.notRunShort")}</Badge>;
  return r.pass === r.total ? <Badge tone="success" dot>{t("validate.status.passed")}</Badge> : <Badge tone="danger" dot>{t("validate.status.failed")}</Badge>;
}

export function ScoreCard({ title, method, meta, r, prog }: { title: string; method: string; meta: string; r: CategoryResult; prog?: Prog }) {
  const { t } = useUi();
  const done = r.status === "done" && !prog;
  const pct = prog ? (prog.done / Math.max(prog.total, 1)) * 100 : done ? (r.pass / Math.max(r.total, 1)) * 100 : 0;
  const bar = prog ? "bg-info" : pct === 100 ? "bg-success" : pct >= 80 ? "bg-warn" : "bg-danger";
  return (
    <section aria-busy={!!prog} className="card flex flex-col px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        <StatusBadge r={r} prog={prog} />
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <div className="num text-[36px] leading-none font-semibold tracking-[-0.02em] text-ink">
          {done ? r.pass : prog ? prog.done : "–"}
          <span className="text-[20px] font-medium text-muted">/{r.total}</span>
        </div>
        <div className={cx("num text-[15px] font-semibold", done ? (pct === 100 ? "text-success" : "text-danger") : "text-muted")}>
          {done ? `${Math.round(pct)}%` : prog ? t("validate.checked") : t("validate.noScore")}
        </div>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className={cx("h-full rounded-full transition-[width] duration-300", bar)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-[13px] text-ink-2">{method}</p>
      <p className="mt-auto pt-3 text-[12px] text-muted">{meta}</p>
      {!prog && r.status === "unavailable" && (
        <p className="mt-3 rounded-lg border border-warn/20 bg-warn-soft px-3 py-2 text-[12px] text-ink-2">{t(r.reason === "offline" ? "validate.offline" : "validate.aiUnavailable")}</p>
      )}
    </section>
  );
}

export type Col = { label: string; right?: boolean; className?: string; block?: boolean };
export type Item = { id: string; values: ReactNode[] };

function RowResult({ r, failed, prog }: { r: CategoryResult; failed: boolean; prog?: Prog }) {
  const { t } = useUi();
  if (prog) return <Badge>{t("validate.status.pending")}</Badge>;
  if (r.status !== "done") return <Badge>{t("validate.status.notScored")}</Badge>;
  return failed ? <Badge tone="danger">{t("validate.fail")}</Badge> : <Badge tone="success">{t("validate.pass")}</Badge>;
}

function FailureList({ items }: { items: Failure[] }) {
  const { t } = useUi();
  return (
    <ul className="space-y-1.5">
      {items.map((f, i) => (
        <li key={`${f.detail}-${i}`} className="grid gap-x-3 gap-y-0.5 text-[12px] sm:grid-cols-[140px_1fr_1fr]">
          <span className={cx("font-mono text-danger", f.expected == null && "sm:col-span-3")}>{f.detail}</span>
          {f.expected != null ? (
            <>
              <span className="min-w-0 break-words text-ink-2"><span className="text-muted">{t("validate.expected")}: </span>{f.expected}</span>
              <span className="min-w-0 break-words font-medium text-danger"><span className="font-normal text-muted">{t("validate.actual")}: </span>{f.actual}</span>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Per-case results: table on desktop, stacked rows on mobile; failed rows highlighted with field diffs. */
export function CaseTable({ title, description, idLabel, cols, items, r, prog }: { title: string; description: ReactNode; idLabel: string; cols: Col[]; items: Item[]; r: CategoryResult; prog?: Prog }) {
  const { t } = useUi();
  const byId = new Map<string, Failure[]>();
  for (const f of r.status === "done" ? r.failures : []) byId.set(f.id, [...(byId.get(f.id) ?? []), f]);
  const th = "bg-subtle px-4 py-2.5 text-[12px] font-medium tracking-wide whitespace-nowrap text-muted uppercase";
  return (
    <Card flush title={title} description={description} actions={<StatusBadge r={r} prog={prog} />}>
      <table className="hidden w-full text-left text-[13px] md:table">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>{idLabel}</th>
            {cols.map((c) => <th key={c.label} scope="col" className={cx(th, c.right && "text-right")}>{c.label}</th>)}
            <th scope="col" className={cx(th, "text-right")}>{t("validate.result")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const fails = byId.get(it.id);
            return (
              <Fragment key={it.id}>
                <tr className={cx("border-t border-line first:border-0", fails && "bg-danger-soft/60")}>
                  <th scope="row" className={cx("px-4 py-2.5 font-mono text-[12px] font-normal whitespace-nowrap", fails ? "text-danger shadow-[inset_2px_0_0_var(--saakh-danger)]" : "text-ink-2")}>
                    {it.id}
                  </th>
                  {it.values.map((v, i) => (
                    <td key={cols[i].label} className={cx("px-4 py-2.5 text-ink", cols[i].right && "num text-right whitespace-nowrap", cols[i].className)}>{v}</td>
                  ))}
                  <td className="px-4 py-2.5 text-right"><RowResult r={r} failed={!!fails} prog={prog} /></td>
                </tr>
                {fails && (
                  <tr className="bg-danger-soft/60">
                    <td colSpan={cols.length + 2} className="px-4 pt-0 pb-3"><FailureList items={fails} /></td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <ul className="divide-y divide-line md:hidden">
        {items.map((it) => {
          const fails = byId.get(it.id);
          return (
            <li key={it.id} className={cx("px-4 py-3", fails && "bg-danger-soft/60")}>
              <div className="flex items-center justify-between gap-3">
                <span className={cx("font-mono text-[12px]", fails ? "text-danger" : "text-ink-2")}>{it.id}</span>
                <RowResult r={r} failed={!!fails} prog={prog} />
              </div>
              {it.values.map((v, i) => cols[i].block && <p key={cols[i].label} className="mt-1 text-[13px] break-words text-ink-2">{v}</p>)}
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                {it.values.map(
                  (v, i) =>
                    !cols[i].block && (
                      <Fragment key={cols[i].label}>
                        <dt className="text-muted">{cols[i].label}</dt>
                        <dd className={cx("min-w-0 text-right break-words text-ink", cols[i].right && "num")}>{v}</dd>
                      </Fragment>
                    ),
                )}
              </dl>
              {fails && <div className="mt-2 border-t border-danger/15 pt-2"><FailureList items={fails} /></div>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const CASE_RE = /\s*\(((?:C\d{2}(?:,\s*)?)+)\)\.?$/;

/** RBI paragraphs an interpretation touches, inferred from its wording. */
function parasFor(s: string): string[] {
  const out = new Set<string>();
  if (/annex\s*i\b/i.test(s)) out.add("Annex I");
  for (const m of s.matchAll(/para\s+(\d+(?:\(\d+\))?)/gi)) out.add(m[1]);
  if (/collateral-free/i.test(s)) out.add("25");
  if (/affidavit/i.test(s)) out.add("30");
  return [...out];
}

export function Interpretations({ items }: { items: string[] }) {
  const { t } = useUi();
  return (
    <Card title={t("validate.openTitle")} description={t("validate.openDesc")} actions={<Badge tone="info">{t("validate.openCount", { count: items.length })}</Badge>} flush>
      <ol className="divide-y divide-line">
        {items.map((s, i) => {
          const cases = s.match(CASE_RE)?.[1].split(/,\s*/) ?? [];
          const text = s.replace(CASE_RE, "").replace(/\.?$/, ".");
          return (
            <li key={s} className="flex gap-4 px-5 py-3.5">
              <span className="num pt-px font-mono text-[12px] text-muted">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-ink">{text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {parasFor(s).map((p) => <Para key={p} p={p} />)}
                  {cases.map((c) => (
                    <span key={c} className="rounded border border-line px-1.5 py-px font-mono text-[11px] leading-4 text-muted">{t("validate.testedBy", { id: c })}</span>
                  ))}
                </div>
              </div>
              <div className="hidden shrink-0 sm:block"><Badge>{t("validate.applied")}</Badge></div>
            </li>
          );
        })}
      </ol>
      <p className="border-t border-line bg-subtle px-5 py-3 text-[12px] text-muted">{t("validate.openFoot")}</p>
    </Card>
  );
}

export function Methodology({ rows }: { rows: { term: string; body: string }[] }) {
  const { t } = useUi();
  return (
    <section aria-labelledby="method-title" className="border-t border-line pt-5">
      <h2 id="method-title" className="eyebrow">{t("validate.methodTitle")}</h2>
      <dl className="mt-3 grid gap-4 text-[13px] md:grid-cols-3">
        {rows.map((r) => (
          <div key={r.term}>
            <dt className="font-medium text-ink-2">{r.term}</dt>
            <dd className="mt-1 text-muted">{r.body}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[12px] text-muted">{t("validate.methodFoot")}</p>
    </section>
  );
}
