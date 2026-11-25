"use client";

import { useEffect, useMemo, useState } from "react";
import { loadUploaded, sofTable, type SofRow } from "@/lib/sof";
import type { Season } from "@/lib/kcc";
import { Callout, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { useUi } from "@/components/ui-provider";
import { ICONS, Segmented, Svg } from "@/components/sof/icons";
import { SofList, SofTable } from "@/components/sof/sof-table";
import { ResetButton, UploadDrawer } from "@/components/sof/upload-drawer";

const SEASONS: Season[] = ["kharif", "rabi", "zaid", "annual"];

export default function SofPage() {
  const { t } = useUi();
  const [rows, setRows] = useState<SofRow[] | null>(null);
  const [uploaded, setUploaded] = useState(0);
  const [district, setDistrict] = useState("all");
  const [season, setSeason] = useState("all");
  const [drawer, setDrawer] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);

  const refresh = () => {
    setRows(sofTable());
    setUploaded(loadUploaded().length);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read from localStorage
  useEffect(refresh, []);

  const districts = useMemo(() => [...new Set((rows ?? []).map((r) => r.district))].sort(), [rows]);
  const seasons = useMemo(() => SEASONS.filter((s) => rows?.some((r) => r.season === s)), [rows]);
  const shown = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => (district === "all" || r.district === district) && (season === "all" || r.season === season))
        .sort((a, b) => a.district.localeCompare(b.district) || SEASONS.indexOf(a.season) - SEASONS.indexOf(b.season) || a.crop.localeCompare(b.crop)),
    [rows, district, season],
  );
  const official = shown.filter((r) => r.source === "official").length;

  const changed = (msg: string, ok: boolean) => {
    refresh();
    setStatus({ msg, ok });
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-5 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow={t("sof.eyebrow")}
        title={t("sof.title")}
        description={t("sof.description")}
        actions={
          <>
            <a href="/samples/sof-sehore.csv" download className="btn-ghost w-full sm:w-auto">
              <Svg d={ICONS.download} />
              {t("sof.sample")}
            </a>
            <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setDrawer(true)}>
              <Svg d={ICONS.upload} />
              {t("sof.uploadBank")}
            </button>
          </>
        }
      />

      <div className="space-y-4 lg:space-y-5">
        {rows?.some((r) => r.source === "proxy-pmfby") && (
          <Callout tone="warn" title={t("sof.estimateTitle")}>
            {t("sof.estimateBody")}
          </Callout>
        )}

        <div role="status" aria-live="polite">
          {status && (
            <Callout tone={status.ok ? "success" : "danger"} action={<button type="button" className="text-[13px] font-medium text-ink-2 hover:text-ink" onClick={() => setStatus(null)}>{t("common.close")}</button>}>
              {status.msg}
            </Callout>
          )}
        </div>

        {uploaded > 0 && (
          <div className="card flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[14px] text-ink-2">
              <span className="num font-semibold text-ink">{uploaded}</span> {t("sof.uploadedActiveRows")}
            </div>
            <ResetButton count={uploaded} onDone={changed} />
          </div>
        )}

        <Card
          flush
          title={t("sof.tableTitle")}
          description={rows ? t("sof.tableMeta", { count: shown.length, official }) : undefined}
        >
          <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <Segmented
              label={t("sof.district")}
              value={district}
              onChange={setDistrict}
              options={[{ value: "all", label: t("sof.filterAll") }, ...districts.map((d) => ({ value: d, label: d }))]}
            />
            <Segmented
              label={t("sof.season")}
              value={season}
              onChange={setSeason}
              options={[{ value: "all", label: t("sof.allSeasons") }, ...seasons.map((s) => ({ value: s, label: t(`season.short.${s}`) }))]}
            />
          </div>

          {!rows ? (
            <div className="flex items-center gap-2 px-5 py-10 text-[13px] text-muted" role="status">
              <Spinner /> {t("common.loading")}
            </div>
          ) : shown.length === 0 ? (
            <EmptyState icon={<Svg d={ICONS.file} className="h-5 w-5" />} title={t("sof.empty")} description={t("sof.emptyHint")} />
          ) : (
            <>
              <div className="hidden md:block">
                <SofTable rows={shown} />
              </div>
              <div className="md:hidden">
                <SofList rows={shown} />
              </div>
            </>
          )}

          <p className="flex gap-2 border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">
            <Svg d={ICONS.info} className="mt-px h-3.5 w-3.5" />
            {t("sof.frozen")}
          </p>
        </Card>
      </div>

      <UploadDrawer open={drawer} onClose={() => setDrawer(false)} uploaded={uploaded} onChanged={changed} />
    </div>
  );
}
