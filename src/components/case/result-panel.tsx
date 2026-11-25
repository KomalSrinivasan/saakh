"use client";

import type { ReactNode } from "react";
import { COLLATERAL_FREE, COLLATERAL_FREE_TIEUP, EFFECTIVE_FROM, RBI_DIRECTION, type Flag, type KccResult } from "@/lib/kcc";
import type { Case } from "@/lib/store";
import { Icon } from "@/components/shell";
import { useUi } from "@/components/ui-provider";
import { Badge, Callout, Card, Para, cx, inr } from "@/components/ui";
import { cropName } from "./shared";

const FLAG_ICON: Record<Flag["level"], string> = {
  error: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  warn: "M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  info: "M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};
const FLAG_TONE: Record<Flag["level"], string> = { error: "text-danger", warn: "text-warn", info: "text-muted" };
const CHECK = "M20 6L9 17l-5-5";
const ARROW = "M5 12h14m-6-6l6 6-6 6";
const LINK = "M14 3h7v7m0-7L10 14M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5";
const ORDER: Flag["level"][] = ["error", "warn", "info"];
// Rows that close a block in the ledger: year-1 subtotal, year-6 subtotal, final CMPL.
const SUBTOTAL = new Set(["13(5)", "13(6)"]);

export const hasBlockingError = (r?: KccResult) => !!r?.flags.some((f) => f.level === "error");

export function ParaBadge({ para }: { para: string }) {
  return <Para p={para} className="shrink-0" />;
}

export function Para2Notice() {
  const { t, lang } = useUi();
  const date = new Date(`${EFFECTIVE_FROM}T00:00:00`).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" });
  return (
    <Callout
      tone="info"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t("para2.title")} <Para p="2" />
        </span>
      }
    >
      {t("para2.noticeDate", { date })}
    </Callout>
  );
}

function HeroStat({ label, value, hint, para }: { label: ReactNode; value: ReactNode; hint?: ReactNode; para?: string }) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-5 md:py-3.5">
      <dt className="text-[12px] leading-4 text-muted">{label}</dt>
      <dd className="num mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-5 font-semibold text-ink">
        {value}
        {para && (
          <span className="hidden sm:inline">
            <Para p={para} />
          </span>
        )}
      </dd>
      {hint && <dd className="mt-0.5 text-[12px] leading-4 text-muted">{hint}</dd>}
    </div>
  );
}

const th = "px-5 py-2 text-left text-[12px] font-medium tracking-wide text-muted uppercase";

export function ResultPanel({ c, onNext }: { c: Case; onNext?: () => void }) {
  const { t } = useUi();
  const r = c.result;
  if (!r) return null;
  const blocked = hasBlockingError(r);
  const flags = [...r.flags].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));
  const errors = flags.filter((f) => f.level === "error");
  const usedCrops = [...new Set(c.crops.map((l) => l.crop))];
  const cap = c.recoveryTieUp ? COLLATERAL_FREE_TIEUP : COLLATERAL_FREE;
  const maxYear = Math.max(...r.yearlyLimits, 1);
  const anyProxy = usedCrops.some((k) => c.sofSnapshot?.[k]?.source === "proxy-pmfby");

  return (
    <div className="space-y-4 lg:space-y-5">
      {errors.length > 0 && (
        <Callout tone="danger" title={t("result.blocked")}>
          <ul className="mt-1 space-y-1">
            {errors.map((f, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                {f.message} {f.para && <Para p={f.para} />}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <Card
        title={t("result.heroTitle")}
        actions={blocked ? <Badge tone="danger" dot>{t("result.badgeBlocked")}</Badge> : <Badge tone="success" dot>{t("result.badgeComputed")}</Badge>}
        flush
      >
        <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <div id="kcc-limit" className="eyebrow">
              {t("result.cmplNote")}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span data-testid="kcc-limit" className={cx("num text-[34px] leading-none font-semibold tracking-[-0.02em] sm:text-[40px]", blocked ? "text-muted line-through decoration-danger/60 decoration-2" : "text-ink")}>
                {inr(r.kccLimit)}
              </span>
              <Para p="10" />
            </div>
            <p className="mt-3 max-w-md text-[13px] leading-5 text-muted">{r.termLoan > 0 ? t("result.heroSub", { y6: inr(r.shortTermYear6), term: inr(r.termLoan) }) : t("result.heroSubNoTerm", { y6: inr(r.shortTermYear6) })}</p>
            {r.marginal && (
              <div className="mt-3">
                <Badge tone="brand">{t("result.marginal")}</Badge>
              </div>
            )}
          </div>
          <dl className="grid grid-cols-3 divide-x divide-line border-t border-line md:grid-cols-1 md:divide-x-0 md:divide-y md:border-t-0 md:border-l">
            <HeroStat label={t("result.year1")} value={inr(r.yearlyLimits[0])} para="13(5)" />
            {r.collateralFree ? (
              <HeroStat label={t("result.collateralFreeUpTo")} value={inr(cap)} para={c.recoveryTieUp ? "25" : "23"} />
            ) : (
              <HeroStat label={t("result.collateralLabel")} value={<span className="text-warn">{t("common.required")}</span>} hint={t("result.aboveCap", { cap: inr(cap) })} />
            )}
            <HeroStat
              label={t("result.flexiLabel")}
              value={r.flexiEligible ? <span className="text-success">{t("common.yes")}</span> : <span className="text-ink-2">{t("common.no")}</span>}
              para="13(7)"
            />
          </dl>
        </div>
        <div className="border-t border-line bg-subtle px-5 py-2.5 font-mono text-[11px] leading-4 break-words text-muted sm:px-6">{t("result.source", { ref: RBI_DIRECTION })}</div>
      </Card>

      <Card title={t("flags.title")} actions={<span className="num text-[13px] text-muted">{flags.length}</span>} flush>
        {flags.length ? (
          <ul className="divide-y divide-line">
            {flags.map((f, i) => (
              <li key={i} className={cx("flex items-start gap-3 px-5 py-3", f.level === "error" && "bg-danger-soft/60")}>
                <Icon d={FLAG_ICON[f.level]} className={cx("mt-0.5 h-[18px] w-[18px] shrink-0", FLAG_TONE[f.level])} />
                <div className="min-w-0 flex-1 text-[14px] leading-5 text-ink-2">
                  <span className={cx("mr-2 text-[12px] font-semibold tracking-wide uppercase", FLAG_TONE[f.level])}>{t(`flags.${f.level}`)}</span>
                  {f.message}
                </div>
                {f.para && <Para p={f.para} className="mt-0.5 shrink-0" />}
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-3 px-5 py-4 text-[14px] text-ink-2">
            <Icon d={CHECK} className="h-[18px] w-[18px] text-success" />
            {t("flags.none")}
          </div>
        )}
      </Card>

      <Card title={t("result.yearlyLimits")} description={<span className="inline-flex flex-wrap items-center gap-2">{t("result.yearlyHint")} <Para p="13(6)" /></span>} flush>
        <div className="hidden px-6 pt-5 pb-3 md:block" aria-hidden="true">
          <div className="flex h-40 items-end gap-4 border-b border-line">
            {r.yearlyLimits.map((v, i) => (
              <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                <span className="num mb-1.5 text-[12px] font-medium text-ink-2">{inr(v)}</span>
                <div className={cx("w-full max-w-14 rounded-t-[4px]", i === r.yearlyLimits.length - 1 ? "bg-primary" : "bg-primary/70")} style={{ height: `${Math.max(4, (v / maxYear) * 100) * 0.78}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4">
            {r.yearlyLimits.map((_, i) => (
              <div key={i} className="flex-1 text-center text-[12px] text-muted">
                {t("result.yearShort", { n: i + 1 })}
              </div>
            ))}
          </div>
        </div>
        <table className="w-full text-[14px] md:border-t md:border-line">
          <caption className="sr-only">{t("result.yearlyLimits")}</caption>
          <thead className="bg-subtle">
            <tr>
              <th scope="col" className={th}>
                {t("result.colYear")}
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                {t("result.colLimit")}
              </th>
              <th scope="col" className={cx(th, "hidden text-right sm:table-cell")}>
                {t("result.colChange")}
              </th>
            </tr>
          </thead>
          <tbody>
            {r.yearlyLimits.map((v, i) => (
              <tr key={i} className="border-t border-line">
                <th scope="row" className="px-5 py-2.5 text-left font-normal text-ink-2">
                  {t("result.year", { n: i + 1 })}
                </th>
                <td className="num px-5 py-2.5 text-right font-medium text-ink">{inr(v)}</td>
                <td className="num hidden px-5 py-2.5 text-right text-muted sm:table-cell">{i === 0 ? t("result.base") : `+${inr(v - r.yearlyLimits[i - 1])}`}</td>
              </tr>
            ))}
            {r.termLoan > 0 && (
              <tr className="border-t border-line">
                <th scope="row" className="px-5 py-2.5 text-left font-normal text-ink-2">
                  {t("result.termLoan")} <Para p="19" className="ml-1" />
                </th>
                <td className="num px-5 py-2.5 text-right font-medium text-ink">{inr(r.termLoan)}</td>
                <td className="hidden sm:table-cell" />
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title={t("result.steps")} flush>
        <table className="w-full text-[14px]">
          <caption className="sr-only">{t("result.steps")}</caption>
          <thead className="bg-subtle">
            <tr>
              <th scope="col" className={cx(th, "px-4 sm:px-5")}>
                {t("result.colComponent")}
              </th>
              <th scope="col" className={cx(th, "hidden w-px sm:table-cell")}>
                {t("result.colPara")}
              </th>
              <th scope="col" className={cx(th, "px-4 text-right sm:px-5")}>
                {t("result.colAmount")}
              </th>
            </tr>
          </thead>
          <tbody>
            {r.steps.map((s, i) => {
              const total = s.para === "10";
              const sub = SUBTOTAL.has(s.para);
              return (
                <tr key={i} className={cx(total ? "border-t-2 border-primary/25 bg-primary-soft" : sub ? "border-t border-line-strong" : "border-t border-line")}>
                  <td className={cx("px-4 py-2.5 align-top leading-5 sm:px-5", total ? "font-semibold text-primary" : sub ? "font-semibold text-ink" : "text-ink-2")}>
                    {s.label}
                    <div className="mt-1 sm:hidden">
                      <Para p={s.para} />
                    </div>
                  </td>
                  <td className="hidden px-5 py-2.5 align-top sm:table-cell">
                    <Para p={s.para} className="whitespace-nowrap" />
                  </td>
                  <td className={cx("num px-4 py-2.5 text-right align-top whitespace-nowrap sm:px-5", total ? "text-[15px] font-semibold text-primary" : sub ? "font-semibold text-ink" : "text-ink")}>{inr(s.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title={t("result.sofUsed")} flush>
        <table className="hidden w-full text-[14px] sm:table">
          <caption className="sr-only">{t("result.sofUsed")}</caption>
          <thead className="bg-subtle">
            <tr>
              <th scope="col" className={th}>
                {t("sof.crop")}
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                {t("sof.current")}
              </th>
              <th scope="col" className={cx(th, "text-right")}>
                {t("sof.previous")}
              </th>
              <th scope="col" className={th}>
                {t("sof.source")}
              </th>
              <th scope="col" className={th}>
                {t("sof.scope")}
              </th>
              <th scope="col" className={cx(th, "w-px")}>
                <span className="sr-only">{t("sof.ref")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {usedCrops.map((k) => {
              const s = c.sofSnapshot?.[k] as (NonNullable<Case["sofSnapshot"]>[string] & { ref?: string }) | undefined;
              return (
                <tr key={k} className="border-t border-line">
                  <td className="px-5 py-2.5 font-medium text-ink">{cropName(k)}</td>
                  <td className="num px-5 py-2.5 text-right text-ink">{s?.current != null ? inr(s.current) : <span className="text-muted">{t("sof.notNotified")}</span>}</td>
                  <td className="num px-5 py-2.5 text-right text-ink-2">{s?.previous != null ? inr(s.previous) : <span className="text-muted">-</span>}</td>
                  <td className="px-5 py-2.5">{s ? <SourceBadge source={s.source} /> : <Badge tone="danger">{t("result.notInSof")}</Badge>}</td>
                  <td className="px-5 py-2.5 text-ink-2">{s ? t(`sof.scope.${s.scope}`) : ""}</td>
                  <td className="px-3 py-1.5 text-right">{s?.ref && <SofRef value={s.ref} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ul className="divide-y divide-line sm:hidden">
          {usedCrops.map((k) => {
            const s = c.sofSnapshot?.[k] as (NonNullable<Case["sofSnapshot"]>[string] & { ref?: string }) | undefined;
            return (
              <li key={k} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-ink">
                    {cropName(k)} {s ? <SourceBadge source={s.source} /> : <Badge tone="danger">{t("result.notInSof")}</Badge>}
                  </div>
                  {s && (
                    <div className="num mt-1 text-[13px] text-muted">
                      {s.current != null ? `${inr(s.current)}/ha` : t("sof.notNotified")}
                      {s.previous != null && ` · ${t("sof.prevShort")} ${inr(s.previous)}`} · {t(`sof.scope.${s.scope}`)}
                    </div>
                  )}
                </div>
                {s?.ref && <SofRef value={s.ref} />}
              </li>
            );
          })}
        </ul>
        {anyProxy && <p className="border-t border-line bg-warn-soft/60 px-4 py-2.5 text-[12px] leading-4 text-warn sm:px-5">{t("sof.proxyWarning")}</p>}
      </Card>

      <Para2Notice />

      {onNext && (
        <div className="flex justify-end pt-1">
          <button type="button" className="btn-primary btn-lg w-full sm:w-auto" onClick={onNext}>
            {t("result.continue")}
            <Icon d={ARROW} className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: "official" | "proxy-pmfby" }) {
  const { t } = useUi();
  return source === "official" ? (
    <Badge tone="success" dot>
      {t("sof.source.official")}
    </Badge>
  ) : (
    <Badge tone="warn" dot>
      {t("sof.proxyShort")}
    </Badge>
  );
}

function SofRef({ value }: { value: string }) {
  const { t } = useUi();
  const url = value.match(/https?:\/\/\S+/)?.[0];
  const rest = value.replace(url ?? "", "").replace(/^\s*\|\s*/, "").trim();
  const cls = "inline-grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-primary";
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className={cls} title={rest || url} aria-label={t("sof.openRef")}>
      <Icon d={LINK} className="h-4 w-4" />
    </a>
  ) : (
    <span className={cls} title={rest} aria-label={rest}>
      <Icon d={FLAG_ICON.info} className="h-4 w-4" />
    </span>
  );
}
