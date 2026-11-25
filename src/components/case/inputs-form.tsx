"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Season, Tenure } from "@/lib/kcc";
import { listCrops, sofTable } from "@/lib/sof";
import type { Case } from "@/lib/store";
import { useUi } from "@/components/ui-provider";
import { Callout, Card, cx } from "@/components/ui";
import type { CasePatch } from "./capture-land";
import { cropName, Ico, ICONS } from "./shared";

const TENURES: Tenure[] = ["owner", "tenant", "oral_lessee", "sharecropper"];
const SEASONS: Season[] = ["kharif", "rabi", "zaid", "annual"];

type Line = { crop: string; season: Season; area: string };
type Draft = { landHa: string; tenure: Tenure; crops: Line[]; insurance: string; termLoan: string; recoveryTieUp: boolean };

const str = (n?: number) => (n == null || n === 0 ? "" : String(n));
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

function toPatch(d: Draft): CasePatch {
  return {
    landHa: Number(d.landHa) || 0,
    tenure: d.tenure,
    crops: d.crops.map((l) => ({ crop: l.crop, season: l.season, areaHa: Number(l.area) || 0 })),
    insurancePremium: num(d.insurance),
    termLoan: num(d.termLoan),
    recoveryTieUp: d.recoveryTieUp,
  };
}

const invalidCls = "border-danger focus:border-danger focus:ring-danger/10";

/** Numeric input with a unit prefix or suffix, right aligned. */
function UnitInput({ id, unit, prefix, invalid, describedBy, ...rest }: { id: string; unit: string; prefix?: boolean; invalid?: boolean; describedBy?: string; value: string; inputMode: "decimal" | "numeric"; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] text-muted">{unit}</span>}
      <input id={id} className={cx("field num text-right", prefix ? "pl-7" : "pr-10", invalid && invalidCls)} aria-invalid={!!invalid} aria-describedby={describedBy} {...rest} />
      {!prefix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-muted">{unit}</span>}
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-5 first:border-t-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function InputsForm({ c, locked, onChange, onCompute }: { c: Case; locked: boolean; onChange: (p: CasePatch) => void; onCompute: () => void }) {
  const { t } = useUi();
  const crops = useMemo(() => listCrops(c.district), [c.district]);
  const seasonOf = useMemo(() => {
    const m = new Map<string, Season>();
    for (const r of sofTable()) if (r.district.toLowerCase() === c.district.toLowerCase()) m.set(r.crop, r.season);
    return m;
  }, [c.district]);
  const [draft, setDraft] = useState<Draft>(() => ({
    landHa: str(c.landHa),
    tenure: c.tenure,
    crops: c.crops.map((l) => ({ crop: l.crop, season: l.season, area: str(l.areaHa) })),
    insurance: str(c.insurancePremium),
    termLoan: str(c.termLoan),
    recoveryTieUp: c.recoveryTieUp,
  }));
  const [errs, setErrs] = useState<Record<string, string>>({});

  const update = (fn: (d: Draft) => Draft) => {
    const next = fn(draft);
    setDraft(next);
    setErrs({});
    onChange(toPatch(next));
  };
  const setLine = (i: number, patch: Partial<Line>) => update((d) => ({ ...d, crops: d.crops.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!(Number(draft.landHa) > 0)) er.landHa = t("case.landRequired");
    if (!draft.crops.length) er.crops = t("case.cropsRequired");
    draft.crops.forEach((l, i) => {
      if (!l.crop) er[`crop${i}`] = t("common.required");
      if (!(Number(l.area) > 0)) er[`area${i}`] = t("case.areaInvalid");
    });
    for (const k of ["insurance", "termLoan"] as const) {
      const v = num(draft[k]);
      if (v !== undefined && !(v >= 0)) er[k] = t("case.amountInvalid");
    }
    setErrs(er);
    if (Object.keys(er).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    onCompute();
  };

  const err = (k: string) =>
    errs[k] && (
      <p id={`in-${k}-err`} className="mt-1 text-[12px] font-medium text-danger">
        {errs[k]}
      </p>
    );
  const total = draft.crops.reduce((s, l) => s + (Number(l.area) || 0), 0);

  return (
    <Card title={t("case.confirmFields")} flush>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={locked}>
          {c.status === "computed" && (
            <div className="px-5 pt-4">
              <Callout tone="warn">{t("case.editResets")}</Callout>
            </div>
          )}

          <Section title={t("case.sectionFarmer")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="label">{t("case.district")}</span>
                <p className="field flex items-center bg-subtle text-ink-2 shadow-none">{c.district}</p>
              </div>
              <div>
                <label htmlFor="in-land" className="label">
                  {t("case.landHaShort")}
                  <span className="ml-0.5 text-danger">*</span>
                </label>
                <UnitInput
                  id="in-land"
                  unit="ha"
                  inputMode="decimal"
                  value={draft.landHa}
                  invalid={!!errs.landHa}
                  describedBy={errs.landHa ? "in-landHa-err" : undefined}
                  onChange={(e) => update((d) => ({ ...d, landHa: e.target.value }))}
                />
                {err("landHa")}
              </div>
              <div>
                <label htmlFor="in-tenure" className="label">
                  {t("case.tenure")}
                </label>
                <select id="in-tenure" className="field" value={draft.tenure} onChange={(e) => update((d) => ({ ...d, tenure: e.target.value as Tenure }))}>
                  {TENURES.map((x) => (
                    <option key={x} value={x}>
                      {t(`tenure.${x}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Section>

          <Section
            title={t("case.sectionCrops")}
            aside={
              <span className="text-[12px] text-muted">
                {t("case.totalCropped")} <span className="num font-semibold text-ink">{Math.round(total * 100) / 100} ha</span>
              </span>
            }
          >
            <div className={cx("overflow-hidden rounded-lg border", errs.crops ? "border-danger/40" : "border-line")}>
              <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_40px] gap-3 bg-subtle px-3 py-2 text-[12px] font-medium tracking-wide text-muted uppercase sm:grid">
                <span>{t("case.crop")}</span>
                <span>{t("case.season")}</span>
                <span className="text-right">{t("case.area")}</span>
                <span className="sr-only">{t("case.removeCrop")}</span>
              </div>
              {draft.crops.length === 0 && <p className="px-3 py-4 text-[13px] text-muted">{t("case.cropsRequired")}</p>}
              <ul>
                {draft.crops.map((l, i) => (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] items-start gap-x-2 gap-y-2 border-t border-line px-3 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_40px] sm:gap-x-3 sm:py-2 sm:[&:first-child]:border-t">
                    <div className="col-span-2 sm:col-span-1">
                      <label htmlFor={`in-crop-${i}`} className="mb-1 block text-[12px] font-medium text-muted sm:sr-only">
                        {t("case.crop")}
                      </label>
                      <select
                        id={`in-crop-${i}`}
                        className={cx("field", errs[`crop${i}`] && invalidCls)}
                        value={l.crop}
                        aria-invalid={!!errs[`crop${i}`]}
                        aria-describedby={errs[`crop${i}`] ? `in-crop${i}-err` : undefined}
                        onChange={(e) => setLine(i, { crop: e.target.value, season: seasonOf.get(e.target.value) ?? l.season })}
                      >
                        <option value="">{t("case.cropPick")}</option>
                        {l.crop && !crops.includes(l.crop) && <option value={l.crop}>{cropName(l.crop)}</option>}
                        {crops.map((k) => (
                          <option key={k} value={k}>
                            {cropName(k)}
                          </option>
                        ))}
                      </select>
                      {err(`crop${i}`)}
                    </div>
                    <button
                      type="button"
                      aria-label={`${t("case.removeCrop")} ${i + 1}`}
                      className="row-start-1 col-start-3 mt-5 grid h-10 w-10 place-items-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger sm:col-start-4 sm:mt-0"
                      onClick={() => update((d) => ({ ...d, crops: d.crops.filter((_, j) => j !== i) }))}
                    >
                      <Ico d={ICONS.trash} />
                    </button>
                    <div>
                      <label htmlFor={`in-season-${i}`} className="mb-1 block text-[12px] font-medium text-muted sm:sr-only">
                        {t("case.season")}
                      </label>
                      <select id={`in-season-${i}`} className="field" value={l.season} onChange={(e) => setLine(i, { season: e.target.value as Season })}>
                        {SEASONS.map((s) => (
                          <option key={s} value={s}>
                            {t(`season.${s}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:row-start-1 sm:col-start-3">
                      <label htmlFor={`in-area-${i}`} className="mb-1 block text-[12px] font-medium text-muted sm:sr-only">
                        {t("case.area")}
                      </label>
                      <UnitInput
                        id={`in-area-${i}`}
                        unit="ha"
                        inputMode="decimal"
                        value={l.area}
                        invalid={!!errs[`area${i}`]}
                        describedBy={errs[`area${i}`] ? `in-area${i}-err` : undefined}
                        onChange={(e) => setLine(i, { area: e.target.value })}
                      />
                      {err(`area${i}`)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {err("crops")}
            <button type="button" className="btn-ghost mt-3 h-9 px-3 text-[13px]" onClick={() => update((d) => ({ ...d, crops: [...d.crops, { crop: "", season: "kharif", area: "" }] }))}>
              <Ico d={ICONS.plus} />
              {t("case.addCrop")}
            </button>
          </Section>

          <Section title={t("case.sectionOther")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["insurance", "case.insurancePremium"],
                  ["termLoan", "case.termLoan"],
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <label htmlFor={`in-${k}`} className="label">
                    {t(label).replace(/\s*\(₹\)$/, "")} <span className="font-normal text-muted">({t("common.optional")})</span>
                  </label>
                  <UnitInput
                    id={`in-${k}`}
                    unit="₹"
                    prefix
                    inputMode="numeric"
                    value={draft[k]}
                    invalid={!!errs[k]}
                    describedBy={errs[k] ? `in-${k}-err` : undefined}
                    onChange={(e) => update((d) => ({ ...d, [k]: e.target.value }))}
                  />
                  {err(k)}
                </div>
              ))}
            </div>
            <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 transition-colors hover:bg-subtle">
              <input type="checkbox" className="h-4 w-4 rounded accent-primary" checked={draft.recoveryTieUp} onChange={(e) => update((d) => ({ ...d, recoveryTieUp: e.target.checked }))} />
              <span className="text-[14px] text-ink">{t("case.recoveryTieUp")}</span>
            </label>
          </Section>

          {!locked && (
            <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-3 rounded-b-xl border-t border-line bg-surface/95 px-5 py-3 backdrop-blur lg:static lg:bottom-auto">
              <p className="hidden text-[13px] text-muted sm:block">{t("case.confirmHint")}</p>
              <button type="submit" className="btn-primary w-full sm:w-auto">
                {t("case.confirmCompute")}
                <Ico d={ICONS.arrow} />
              </button>
            </div>
          )}
        </fieldset>
      </form>
    </Card>
  );
}
