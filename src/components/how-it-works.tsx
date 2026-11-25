"use client";

import { useId, useState } from "react";
import type { DemoKind } from "@/lib/demo";
import { Icon } from "./shell";
import { cx } from "./ui";
import { useUi } from "./ui-provider";

export type CaseStepKey = "land" | "crops" | "confirm" | "result" | "note" | "decision" | "audit";

/** Explainer steps and the demo case + case step each one opens. */
export const HOW_STEPS: { key: string; kind: DemoKind; step: CaseStepKey; icon: string }[] = [
  { key: "how.s1", kind: "walkthrough", step: "land", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5" },
  { key: "how.s2", kind: "walkthrough", step: "crops", icon: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3" },
  { key: "how.s3", kind: "walkthrough", step: "confirm", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" },
  { key: "how.s4", kind: "suspicious", step: "confirm", icon: "M12 8V4H8M4 8h16v12H4zM2 14h2M20 14h2M15 13v2M9 13v2" },
  { key: "how.s5", kind: "walkthrough", step: "note", icon: "M11 5 6 9H2v6h4l5 4zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" },
  { key: "how.s6", kind: "approved", step: "audit", icon: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4" },
];

const CHEVRON = "m9 18 6-6-6-6";

export function HowItWorks({ onOpen, busy }: { onOpen: (kind: DemoKind, step: CaseStepKey) => void; busy?: boolean }) {
  const { t } = useUi();
  const [i, setI] = useState(0);
  const panelId = useId();
  const s = HOW_STEPS[i];
  const last = HOW_STEPS.length - 1;

  return (
    <section aria-labelledby={`${panelId}-title`} className="card mb-6 overflow-hidden">
      <div className="border-b border-line px-4 py-3.5 sm:px-5">
        <div className="eyebrow mb-1">{t("how.eyebrow")}</div>
        <h2 id={`${panelId}-title`} className="text-[16px] font-semibold text-ink">
          {t("how.title")}
        </h2>
        <p className="mt-1 text-[13px] text-ink-2">
          <span className="font-semibold text-primary">{t("how.principle")}</span>
        </p>
      </div>

      <ol className="grid grid-cols-6 border-b border-line bg-subtle">
        {HOW_STEPS.map((x, n) => (
          <li key={x.key} className="min-w-0">
            <button
              type="button"
              onClick={() => setI(n)}
              aria-current={n === i ? "step" : undefined}
              aria-controls={panelId}
              aria-label={`${n + 1}. ${t(`${x.key}.title`)}`}
              className={cx(
                "flex h-full min-h-12 w-full cursor-pointer flex-col items-center justify-center gap-1 border-b-2 px-1 py-2 transition-colors lg:flex-row lg:justify-start lg:gap-2 lg:px-4 lg:text-left",
                n === i ? "border-primary bg-surface text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              <span className={cx("num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold", n === i ? "bg-primary text-on-primary" : n < i ? "bg-primary/15 text-primary" : "bg-surface ring-1 ring-line-strong")}>{n + 1}</span>
              <span className="hidden min-w-0 text-[12px] leading-tight font-medium lg:block">{t(`${x.key}.short`)}</span>
            </button>
          </li>
        ))}
      </ol>

      <div id={panelId} role="region" aria-live="polite" aria-label={t(`${s.key}.title`)} className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-[auto_minmax(0,1fr)] md:gap-5 md:py-5">
        <span className="hidden h-11 w-11 place-items-center rounded-lg bg-primary-soft text-primary md:grid">
          <Icon d={s.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="num text-[12px] font-medium text-muted">{t("how.stepOf", { n: i + 1, total: HOW_STEPS.length })}</p>
          <h3 className="mt-0.5 text-[15px] font-semibold text-ink">{t(`${s.key}.title`)}</h3>
          <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-ink-2">{t(`${s.key}.body`)}</p>
          <p className="mt-2 text-[12px] text-muted">{t(`${s.key}.case`)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
        <button type="button" className="btn-ghost h-11 w-11 shrink-0 px-0" onClick={() => setI(i - 1)} disabled={i === 0} aria-label={t("how.prev")}>
          <Icon d={CHEVRON} className="h-4 w-4 rotate-180" />
        </button>
        <button type="button" className="btn-primary min-w-0 flex-1 sm:flex-none" onClick={() => onOpen(s.kind, s.step)} disabled={busy}>
          <span className="truncate">{t("how.open")}</span>
        </button>
        <button type="button" className="btn-ghost ml-auto h-11 shrink-0" onClick={() => setI(i + 1)} disabled={i === last} aria-label={t("how.next")}>
          <span className="hidden sm:inline">{t("how.next")}</span>
          <Icon d={CHEVRON} className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
