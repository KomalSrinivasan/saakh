"use client";

import type { Risk, Severity } from "@/lib/agent/types";
import { useUi } from "@/components/ui-provider";
import { Badge, Card, cx, Para } from "@/components/ui";
import { Ico, ICONS } from "./shared";

const ORDER: Severity[] = ["high", "medium", "low"];
const TONE = { high: "danger", medium: "warn", low: "neutral" } as const;
const BORDER: Record<Severity, string> = { high: "border-l-danger", medium: "border-l-warn", low: "border-l-line-strong" };

export function RiskCard({ risks }: { risks: Risk[] }) {
  const { t } = useUi();
  const counts = ORDER.map((s) => [s, risks.filter((r) => r.severity === s).length] as const).filter(([, n]) => n > 0);
  return (
    <Card
      title={t("agent.risks")}
      description={t("agent.risksHint")}
      actions={
        <span className="flex flex-wrap justify-end gap-1.5">
          {counts.map(([s, n]) => (
            <Badge key={s} tone={TONE[s]} dot className="num">
              {n} {t(`agent.sev.${s}`)}
            </Badge>
          ))}
        </span>
      }
      flush
    >
      {risks.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-[14px] text-ink-2">
          <Ico d={ICONS.check} className="h-4 w-4 text-success" />
          {t("agent.noRisks")}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {ORDER.flatMap((s) => risks.filter((r) => r.severity === s)).map((r, i) => (
            <li key={`${r.code}-${i}`} className={cx("border-l-[3px] px-5 py-3.5", BORDER[r.severity])}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[14px] font-semibold text-ink">{r.title}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {r.para && <Para p={r.para} />}
                  <Badge tone={r.source === "rule" ? "neutral" : "info"}>{t(r.source === "rule" ? "agent.src.rule" : "agent.src.agent")}</Badge>
                </span>
              </div>
              <p className="mt-1 text-[13px] text-ink-2">{r.detail}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[11px] text-muted">{r.code}</span>
                {r.evidence.map((e, j) => (
                  <span key={j} className="max-w-full truncate rounded border border-line bg-subtle px-1.5 py-px font-mono text-[11px] text-ink-2" title={e}>
                    {e}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
