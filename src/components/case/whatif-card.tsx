"use client";

import type { WhatIf } from "@/lib/agent/types";
import { useUi } from "@/components/ui-provider";
import { Badge, Card, inr, Money, Para } from "@/components/ui";
import { Ico, ICONS } from "./shared";

export function WhatIfCard({ items, base }: { items: WhatIf[]; base: number }) {
  const { t } = useUi();
  if (!items.length) return null;
  return (
    <Card
      title={t("agent.whatIfs")}
      description={t("agent.whatIfsHint")}
      actions={
        <span className="text-[12px] text-muted">
          {t("agent.base")} <Money value={base} className="font-medium text-ink" />
        </span>
      }
      flush
    >
      <ul className="divide-y divide-line">
        {items.map((w) => (
          <li key={w.id} className="px-5 py-3.5">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="min-w-0 flex-1 text-[14px] font-medium text-ink">{w.label}</span>
              <span className="flex flex-wrap items-center gap-2">
                <Ico d={ICONS.arrow} className="hidden h-4 w-4 text-muted sm:block" />
                <Money value={w.kccLimit} className="text-[15px] font-semibold text-ink" />
                <Badge tone={w.delta > 0 ? "success" : w.delta < 0 ? "danger" : "neutral"} className="num">
                  {w.delta > 0 ? "+" : w.delta < 0 ? "-" : "±"}
                  {inr(Math.abs(w.delta))}
                </Badge>
                {w.collateralFree && <Badge tone="brand">{t("agent.collateralFree")}</Badge>}
                {w.para && <Para p={w.para} />}
              </span>
            </div>
            {w.note && <p className="mt-1 text-[13px] text-muted">{w.note}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
