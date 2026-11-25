"use client";

import { useEffect, useState } from "react";
import setJson from "@/data/validation-set.json";
import { idle, LAST_RUN_KEY, runCalc, runExtraction, runParity, type CategoryResult, type ValidationRun, type ValidationSet } from "@/lib/validation";
import { langName } from "@/lib/i18n";
import { Callout, PageHeader, Spinner, inr } from "@/components/ui";
import { useUi } from "@/components/ui-provider";
import { ICONS, Svg } from "@/components/sof/icons";
import { CaseTable, Interpretations, Methodology, ScoreCard, type Prog } from "@/components/validate/report";

const SET = setJson as unknown as ValidationSet;
type Cat = "calc" | "extraction" | "parity";

function loadRun(): ValidationRun | null {
  try {
    const r = JSON.parse(localStorage.getItem(LAST_RUN_KEY) ?? "null");
    return r && r.calc && r.extraction && r.parity ? r : null;
  } catch {
    return null;
  }
}

const freshRun = (): ValidationRun => ({
  ranAt: "",
  calc: runCalc(SET),
  extraction: idle(SET.extraction.items.length),
  parity: idle(SET.parity.transcripts.length),
  openInterpretations: SET.openInterpretations,
});

const fileId = (f: string) => f.split("/").pop() ?? f;
const cropPlan = SET.parity.expectedCrops.map((c) => `${c.crop} ${c.areaHa} ha (${c.season})`).join(", ");

export default function ValidatePage() {
  const { t, lang } = useUi();
  const [run, setRun] = useState<ValidationRun | null>(null);
  const [prog, setProg] = useState<Partial<Record<Cat, Prog>>>({});
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read from localStorage; calc is pure and instant
    setRun(loadRun() ?? freshRun());
  }, []);

  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = async () => {
    setRunning(true);
    setElapsed(0);
    setSaveFailed(false);
    const base = freshRun();
    setRun(base);
    const track = (cat: Cat) => (done: number, total: number) => setProg((p) => ({ ...p, [cat]: { done, total } }));
    const offline = (r: CategoryResult): CategoryResult => ({ ...r, status: "unavailable", reason: "offline" });
    const safe = async (fn: () => Promise<CategoryResult>, fallback: CategoryResult) => {
      try {
        return await fn();
      } catch {
        return offline(fallback);
      }
    };
    const [extraction, parity] = navigator.onLine
      ? await Promise.all([
          safe(() => runExtraction(SET, { onProgress: track("extraction"), officerLang: lang }), base.extraction),
          safe(() => runParity(SET, { onProgress: track("parity"), officerLang: lang }), base.parity),
        ])
      : [offline(base.extraction), offline(base.parity)];
    const done: ValidationRun = { ...base, ranAt: new Date().toISOString(), extraction, parity };
    setRun(done);
    setProg({});
    setRunning(false);
    try {
      localStorage.setItem(LAST_RUN_KEY, JSON.stringify(done));
    } catch {
      setSaveFailed(true);
    }
  };

  const p = (cat: Cat) => (running && cat !== "calc" ? (prog[cat] ?? { done: 0, total: run?.[cat].total ?? 0 }) : undefined);
  const when = run?.ranAt ? new Date(run.ranAt).toLocaleString(lang, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-5 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow={t("validate.eyebrow")}
        title={t("validate.reportTitle")}
        description={t("validate.description")}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <button type="button" className="btn-primary w-full sm:w-auto" onClick={start} disabled={running || !run} aria-busy={running}>
              {running ? <Spinner /> : <Svg d={ICONS.play} />}
              {running ? t("validate.runningFor", { s: elapsed }) : t("validate.runFull")}
            </button>
            <p className="num text-[12px] text-muted" role="status" aria-live="polite">
              {running ? t("validate.runHint") : when ? t("validate.lastRun", { date: when }) : t("validate.notRunAi")}
            </p>
          </div>
        }
      />

      {!run ? (
        <div className="flex items-center gap-2 py-10 text-[13px] text-muted" role="status">
          <Spinner /> {t("common.loading")}
        </div>
      ) : (
        <div className="space-y-4 lg:space-y-5">
          <Callout tone="info" title={t("validate.syntheticTitle")}>
            {t("validate.syntheticBody")}
          </Callout>
          {saveFailed && <Callout tone="danger">{t("validate.saveFailed")}</Callout>}

          <div className="grid gap-4 md:grid-cols-3 lg:gap-5">
            <ScoreCard title={t("validate.calc")} method={t("validate.method.calc")} meta={t("validate.meta.calc", { count: run.calc.total })} r={run.calc} />
            <ScoreCard title={t("validate.extractionTitle")} method={t("validate.method.extraction")} meta={t("validate.meta.extraction", { count: run.extraction.total })} r={run.extraction} prog={p("extraction")} />
            <ScoreCard title={t("validate.parity")} method={t("validate.method.parity")} meta={t("validate.meta.parity", { count: run.parity.total })} r={run.parity} prog={p("parity")} />
          </div>

          <CaseTable
            title={t("validate.calc")}
            description={t("validate.detail.calc")}
            idLabel={t("validate.col.case")}
            r={run.calc}
            cols={[
              { label: t("validate.col.scenario"), className: "min-w-[280px] text-ink-2", block: true },
              { label: t("validate.col.year1"), right: true },
              { label: t("validate.col.limit"), right: true },
            ]}
            items={SET.calc.map((c) => ({ id: c.id, values: [c.desc, inr(c.expected.yearlyLimits[0]), inr(c.expected.kccLimit)] }))}
          />

          <CaseTable
            title={t("validate.extractionTitle")}
            description={t("validate.detail.extraction")}
            idLabel={t("validate.col.record")}
            r={run.extraction}
            prog={p("extraction")}
            cols={[
              { label: t("validate.col.owner") },
              { label: t("validate.col.survey"), className: "font-mono text-[12px]" },
              { label: t("validate.col.area"), right: true },
              { label: t("validate.col.aadhaar"), right: true, className: "font-mono text-[12px]" },
            ]}
            items={SET.extraction.items.map((e) => ({ id: fileId(e.file), values: [e.ownerName, e.surveyNos.join(", "), e.areaHa.toFixed(2), e.aadhaarLast4 ? `XXXX ${e.aadhaarLast4}` : t("validate.none")] }))}
          />

          <CaseTable
            title={t("validate.parity")}
            description={t("validate.detail.parity", { plan: cropPlan })}
            idLabel={t("validate.col.lang")}
            r={run.parity}
            prog={p("parity")}
            cols={[
              { label: t("validate.col.language") },
              { label: t("validate.col.transcript"), className: "max-w-[420px] truncate text-ink-2", block: true },
            ]}
            items={SET.parity.transcripts.map((tr) => ({ id: tr.lang, values: [langName(tr.lang), <span key="x" lang={tr.lang} title={tr.text}>{tr.text}</span>] }))}
          />

          <Interpretations items={SET.openInterpretations} />

          <Methodology
            rows={[
              { term: t("validate.calc"), body: t("validate.methodCalc") },
              { term: t("validate.extractionTitle"), body: t("validate.methodExtraction") },
              { term: t("validate.parity"), body: t("validate.methodParity") },
            ]}
          />
        </div>
      )}
    </div>
  );
}
