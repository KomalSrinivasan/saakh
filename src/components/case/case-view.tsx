"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { append, verify } from "@/lib/audit";
import { langName } from "@/lib/i18n";
import { computeKcc, EFFECTIVE_FROM, RBI_DIRECTION } from "@/lib/kcc";
import { sofSnapshot, toEngineSof } from "@/lib/sof";
import { editInputs, getCase, isDemoCase, isLocked, saveCase, transition, type Case, type CaseStatus } from "@/lib/store";
import { HOW_STEPS } from "@/components/how-it-works";
import { useUi } from "@/components/ui-provider";
import { Badge, Callout, Card, cx, EmptyState, Money, PageHeader, Para, Row, Spinner, Stat } from "@/components/ui";
import { AgentPanel, agentLine } from "./agent-panel";
import { AuditPanel } from "./audit-panel";
import { CaptureCrops } from "./capture-crops";
import { CaptureLand, type CasePatch } from "./capture-land";
import { InputsForm } from "./inputs-form";
import { DecisionPanel, NotePanel } from "./note-decision";
import { cropName, Ico, ICONS } from "./shared";

const ENGINE_VERSION = `kcc.ts@${EFFECTIVE_FROM} ${RBI_DIRECTION}`;
const STEPS = ["land", "crops", "confirm", "result", "note", "decision"] as const;
type Step = (typeof STEPS)[number] | "audit";
type Chain = "checking" | "ok" | "broken";
const LABEL: Record<(typeof STEPS)[number], string> = {
  land: "case.step.land",
  crops: "case.step.crops",
  confirm: "case.step.confirm",
  result: "case.step.appraise",
  note: "case.step.note",
  decision: "case.step.decision",
};
const STATUS_TONE: Record<CaseStatus, "neutral" | "info" | "success" | "danger"> = {
  draft: "neutral",
  computed: "info",
  approved: "success",
  edited_approved: "success",
  rejected: "danger",
};

// Explainer step shown on a demo case for each case step.
const HOW_FOR: Record<Step, number> = { land: 0, crops: 1, confirm: 2, result: 3, note: 4, decision: 5, audit: 5 };
const needsResult = (s: Step) => s === "result" || s === "note" || s === "decision";

const initialStep = (c: Case): Step => (isLocked(c) ? "decision" : c.result ? "result" : c.landHa > 0 && c.crops.length ? "confirm" : "land");

export function CaseView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, profile, mode } = useUi();
  const actor = profile?.name ?? "officer";
  const [c, setC] = useState<Case | null | undefined>(undefined);
  const [step, setStep] = useState<Step>("land");
  const [version, setVersion] = useState(0);
  const [err, setErr] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [chain, setChain] = useState<Chain>("checking");

  useEffect(() => {
    let found: Case | undefined;
    let demo = false;
    try {
      found = getCase(id);
      demo = !!found && isDemoCase(found);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read from localStorage
    setC(found ?? null);
    setIsDemo(demo);
    // ?step= deep link from the explainer; ignored when the step is not reachable yet.
    const want = new URLSearchParams(window.location.search).get("step") as Step | null;
    const ok = want && (want === "audit" || (STEPS as readonly string[]).includes(want)) && (!needsResult(want) || !!found?.result);
    if (found) setStep(ok ? want : initialStep(found));
  }, [id]);

  useEffect(() => {
    let live = true;
    verify()
      .then((r) => live && setChain(r.ok ? "ok" : "broken"))
      .catch(() => live && setChain("broken"));
    return () => {
      live = false;
    };
  }, [version, step]);

  const go = (s: Step) => {
    setStep(s);
    setErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const commit = (next: Case) => {
    setC(next);
    setVersion((v) => v + 1);
  };

  if (c === undefined)
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-[14px] text-muted" role="status">
        <Spinner /> {t("common.loading")}
      </div>
    );
  if (c === null)
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="card">
          <EmptyState
            icon={<Ico d={ICONS.file} className="h-5 w-5" />}
            title={t("error.notFound")}
            action={
              <Link href="/" className="btn-primary">
                {t("nav.cases")}
              </Link>
            }
          />
        </div>
      </div>
    );

  if (isDemo !== (mode === "demo"))
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="card">
          <EmptyState
            icon={<Ico d={ICONS.file} className="h-5 w-5" />}
            title={t(isDemo ? "mode.demoCaseHidden" : "mode.realCaseHidden")}
            description={t(isDemo ? "mode.demoCaseHiddenBody" : "mode.realCaseHiddenBody")}
            action={
              <Link href="/" className="btn-primary">
                {t("nav.cases")}
              </Link>
            }
          />
        </div>
      </div>
    );

  const locked = isLocked(c);
  const how = HOW_STEPS[HOW_FOR[step]];
  const proxySof = Object.values(c.sofSnapshot ?? sofSnapshot(c.district)).some((e) => e.source === "proxy-pmfby");

  const edit = (p: CasePatch, then?: Step) => {
    try {
      commit(saveCase(editInputs(c, c.agent ? { ...p, agent: undefined } : p))); // input edits invalidate the agent run
      if (then) go(then);
    } catch {
      setErr(t("error.storage"));
    }
  };

  const compute = async () => {
    try {
      const base = c.status === "computed" ? transition(c, "draft") : c;
      const inputs = { landHa: base.landHa, tenure: base.tenure, crops: base.crops, insurancePremium: base.insurancePremium, termLoan: base.termLoan, recoveryTieUp: base.recoveryTieUp };
      const { name, village, surveyNos, aadhaarLast4 } = base.farmer;
      await append({ caseId: c.id, type: "confirmed", actor, data: { inputs, farmer: { name, village, surveyNos, aadhaarLast4 } } });
      const snap = sofSnapshot(c.district);
      const result = computeKcc({ ...inputs, sof: toEngineSof(c.district) });
      const next = saveCase(transition({ ...base, sofSnapshot: snap, result }, "computed"));
      await append({
        caseId: c.id,
        type: "computed",
        actor,
        data: {
          engine: ENGINE_VERSION,
          sofSnapshot: snap,
          summary: { kccLimit: result.kccLimit, yearlyLimits: result.yearlyLimits, termLoan: result.termLoan, flags: result.flags.map((f) => `${f.level}:${f.code}`) },
        },
      });
      commit(next);
      go("result");
    } catch {
      setErr(t("error.storage"));
    }
  };

  const reachable = (s: Step) => (needsResult(s) ? !!c.result : true);
  const isDone = (s: (typeof STEPS)[number], i: number) => current > i || (!!c.result && i <= 3) || (s === "land" && c.landHa > 0) || (s === "crops" && c.crops.length > 0) || (s === "note" && !!c.note) || (s === "decision" && locked);
  const current = STEPS.indexOf(step as (typeof STEPS)[number]);
  const shown = current < 0 ? STEPS.indexOf(initialStep(c) as (typeof STEPS)[number]) : current;
  const chainTone = chain === "ok" ? "bg-success" : chain === "broken" ? "bg-danger" : "bg-muted/50";
  const chainLabel = t(chain === "ok" ? "case.chainIntact" : chain === "broken" ? "case.chainBroken" : "case.chainChecking");

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-5 lg:px-8 lg:py-8">
      <Link href="/" className="-ml-1 mb-3 inline-flex h-8 items-center gap-1 rounded-md px-1 text-[13px] font-medium text-muted transition-colors hover:text-ink">
        <Ico d={ICONS.back} />
        {t("nav.cases")}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 break-words">{c.farmer.name || t("cases.unnamed")}</span>
            <Badge tone={STATUS_TONE[c.status]} dot className="align-middle">
              {t(`status.${c.status}`)}
            </Badge>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {[c.farmer.village, c.district].filter(Boolean).join(", ")}
            <span aria-hidden className="text-line-strong">
              |
            </span>
            <span>
              {t("lang.farmer")}: <span className="text-ink-2">{langName(c.farmerLang)}</span>
            </span>
          </span>
        }
        actions={
          <button type="button" onClick={() => go(step === "audit" ? initialStep(c) : "audit")} aria-pressed={step === "audit"} className={cx("btn-ghost", step === "audit" && "border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary")}>
            <Ico d={ICONS.shield} />
            {t("audit.title")}
            <span className="flex items-center gap-1.5 border-l border-line pl-2 text-[12px] font-medium text-muted">
              <span className={cx("h-1.5 w-1.5 rounded-full", chainTone)} aria-hidden />
              <span className="hidden sm:inline">{chainLabel}</span>
              <span className="sr-only sm:hidden">{chainLabel}</span>
            </span>
          </button>
        }
      />

      <FactStrip c={c} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="min-w-0 space-y-4 lg:space-y-5">
          {isDemo && (
            <Callout tone="info" title={`${t("how.stepOf", { n: HOW_FOR[step] + 1, total: HOW_STEPS.length })}: ${t(`${how.key}.title`)}`}>
              <p>{t(`${how.key}.body`)}</p>
              <p className="mt-1.5 text-[12px] text-muted">{t("demo.caseFictional")}</p>
            </Callout>
          )}
          {proxySof && (step === "confirm" || step === "result") && (
            <Callout tone="warn" title={t("sof.estimateTitle")}>
              {t("sof.estimateBody")}{" "}
              <Link href="/sof" className="font-medium whitespace-nowrap text-primary underline underline-offset-2 hover:no-underline">
                {t("sof.uploadBank")}
              </Link>
            </Callout>
          )}
          {locked && (
            <Callout tone={c.status === "rejected" ? "danger" : "success"}>
              <span className="flex items-center gap-2 font-medium text-ink">
                <Ico d={ICONS.lock} className="h-4 w-4 shrink-0" />
                {t("decision.locked")}
              </span>
            </Callout>
          )}

          <nav aria-label={t("case.steps")} className="card px-4 py-3.5 sm:px-5">
            <Stepper
              steps={STEPS.map((s, i) => ({ key: s, label: t(LABEL[s]), done: isDone(s, i), active: s === step, ok: reachable(s) }))}
              onPick={(s) => go(s as Step)}
              shown={shown}
              stepOf={(n) => t("case.stepOf", { n, total: STEPS.length })}
            />
          </nav>

          {err && <Callout tone="danger" title={err} />}

          {step === "land" &&
            (locked ? (
              <ReadOnly c={c} />
            ) : (
              <CaptureLand key={`land-${c.id}`} c={c} actor={actor} onApply={(p) => edit(p, "crops")} onManual={() => go("confirm")} />
            ))}
          {step === "crops" &&
            (locked ? (
              <ReadOnly c={c} />
            ) : (
              <CaptureCrops key={`crops-${c.id}`} c={c} actor={actor} onApply={(p) => edit(p, "confirm")} onManual={() => go("confirm")} />
            ))}
          {step === "confirm" && <InputsForm c={c} locked={locked} onChange={(p) => edit(p)} onCompute={compute} />}
          {step === "result" && <AgentPanel key={`agent-${c.id}`} c={c} actor={actor} locked={locked} onSaved={commit} onNext={() => go(locked ? "decision" : "note")} />}
          {step === "note" && <NotePanel c={c} actor={actor} locked={locked} onSaved={commit} onNext={() => go("decision")} />}
          {step === "decision" && (
            <DecisionPanel
              c={c}
              actor={actor}
              onDecided={(next) => {
                commit(next);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}
          {step === "audit" && <AuditPanel caseId={c.id} actor={actor} version={version} />}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <Summary c={c} chain={chain} chainLabel={chainLabel} chainTone={chainTone} />
          </div>
        </aside>
      </div>
    </div>
  );
}

type StepItem = { key: string; label: string; done: boolean; active: boolean; ok: boolean };

function Stepper({ steps, onPick, shown, stepOf }: { steps: StepItem[]; onPick: (k: string) => void; shown: number; stepOf: (n: number) => string }) {
  const cur = steps[shown];
  return (
    <>
      <ol className="hidden items-center md:flex">
        {steps.map((s, i) => (
          <li key={s.key} className={cx("flex items-center", i < steps.length - 1 && "flex-1")}>
            <button
              type="button"
              disabled={!s.ok}
              onClick={() => onPick(s.key)}
              aria-current={s.active ? "step" : undefined}
              className="group flex h-10 shrink-0 items-center gap-2 rounded-md pr-1 disabled:cursor-not-allowed"
            >
              <span
                className={cx(
                  "num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold transition-colors",
                  s.active ? "bg-surface text-primary ring-2 ring-primary" : s.done ? "bg-primary text-on-primary" : "bg-surface text-muted ring-1 ring-line-strong",
                )}
              >
                {s.done && !s.active ? <Ico d={ICONS.check} className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cx("text-[13px] whitespace-nowrap transition-colors", s.active ? "font-semibold text-ink" : s.ok ? "font-medium text-ink-2 group-hover:text-ink" : "text-muted")}>{s.label}</span>
            </button>
            {i < steps.length - 1 && <span aria-hidden className={cx("mx-2 h-px min-w-3 flex-1", s.done ? "bg-primary" : "bg-line-strong")} />}
          </li>
        ))}
      </ol>

      <div className="md:hidden">
        <p className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="font-semibold text-ink">{cur?.label}</span>
          <span className="num text-muted">{stepOf(shown + 1)}</span>
        </p>
        <ol className="mt-2 grid grid-cols-6 gap-1">
          {steps.map((s, i) => (
            <li key={s.key}>
              <button type="button" disabled={!s.ok} onClick={() => onPick(s.key)} aria-current={s.active ? "step" : undefined} aria-label={`${i + 1}. ${s.label}`} className="flex h-6 w-full items-center disabled:cursor-not-allowed">
                <span className={cx("h-1 w-full rounded-full", s.active ? "bg-primary" : s.done ? "bg-primary/45" : "bg-line")} />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function FactStrip({ c }: { c: Case }) {
  const { t } = useUi();
  const facts = [
    { k: t("case.land"), v: c.landHa > 0 ? `${c.landHa} ha` : "-" },
    { k: t("case.crop"), v: c.crops.length ? c.crops.map((l) => cropName(l.crop)).join(", ") : "-" },
    { k: t("result.kccLimit"), v: c.result ? <Money value={c.result.kccLimit} /> : "-" },
  ];
  return (
    <dl className="card mb-4 grid grid-cols-3 divide-x divide-line lg:hidden">
      {facts.map((f) => (
        <div key={f.k} className="min-w-0 px-3 py-2.5">
          <dt className="truncate text-[11px] text-muted">{f.k}</dt>
          <dd className="num mt-0.5 truncate text-[13px] font-semibold text-ink">{f.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Summary({ c, chain, chainLabel, chainTone }: { c: Case; chain: Chain; chainLabel: string; chainTone: string }) {
  const { t } = useUi();
  return (
    <Card title={t("case.summary")} flush>
      <div className="divide-y divide-line px-5">
        <Row
          label={t("case.farmer")}
          value={<span className="font-sans">{c.farmer.name || t("cases.unnamed")}</span>}
          sub={c.farmer.village && <span className="text-[12px] text-muted">{c.farmer.village}</span>}
        />
        <Row label={t("case.aadhaarLast4")} value={c.farmer.aadhaarLast4 ? `XXXX ${c.farmer.aadhaarLast4}` : "-"} />
        <Row label={t("case.land")} value={c.landHa > 0 ? `${c.landHa} ha` : "-"} sub={<span className="text-[12px] text-muted">{t(`tenure.${c.tenure}`)}</span>} />
      </div>
      <div className="border-t border-line">
        <div className="px-5 pt-3 pb-1.5 eyebrow">{t("case.cropLines")}</div>
        {c.crops.length ? (
          <table className="w-full text-[13px]">
            <tbody>
              {c.crops.map((l, i) => (
                <tr key={i} className="border-t border-line first:border-t-0">
                  <td className="py-2 pl-5 font-medium text-ink">{cropName(l.crop)}</td>
                  <td className="py-2 text-muted">{t(`season.${l.season}`)}</td>
                  <td className="num py-2 pr-5 text-right text-ink">{l.areaHa} ha</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 pb-3 text-[13px] text-muted">-</p>
        )}
      </div>
      <div className="border-t border-line bg-subtle px-5 py-4">
        {c.result ? (
          <Stat
            label={
              <span className="flex items-center gap-2">
                {t("result.kccLimit")} <Para p="10" />
              </span>
            }
            value={<Money value={c.result.kccLimit} className="text-primary" />}
          />
        ) : (
          <Stat label={t("result.kccLimit")} value={<span className="text-[15px] font-medium text-muted">{t("case.notComputed")}</span>} />
        )}
      </div>
      <div className="divide-y divide-line border-t border-line px-5">
        <Row
          label={t("case.status")}
          value={
            <Badge tone={STATUS_TONE[c.status]} dot>
              {t(`status.${c.status}`)}
            </Badge>
          }
        />
        {c.agent && (
          <Row
            label={t("agent.rail")}
            value={
              <span className={cx("inline-flex items-center gap-1.5 font-sans text-[13px]", c.agent.report.recommendation === "approve" ? "text-success" : c.agent.report.recommendation === "review" ? "text-warn" : "text-danger")}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                {agentLine(c.agent, t)}
              </span>
            }
          />
        )}
        <Row
          label={t("case.chain")}
          value={
            <span className={cx("inline-flex items-center gap-1.5 font-sans text-[13px]", chain === "broken" ? "text-danger" : chain === "ok" ? "text-success" : "text-muted")}>
              <span className={cx("h-1.5 w-1.5 rounded-full", chainTone)} aria-hidden />
              {chainLabel}
            </span>
          }
        />
      </div>
      <p className="flex gap-2 border-t border-line px-5 py-3 text-[12px] text-muted">
        <Ico d={ICONS.help} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("case.directionsNote")}
      </p>
    </Card>
  );
}

function ReadOnly({ c }: { c: Case }) {
  const { t } = useUi();
  return (
    <Card title={t("case.confirmed")}>
      <div className="divide-y divide-line">
        <Row label={t("case.landHa")} value={`${c.landHa} ha`} />
        <Row label={t("case.surveyNos")} value={c.farmer.surveyNos.join(", ") || "-"} />
        <Row label={t("case.crop")} value={c.crops.map((l) => `${cropName(l.crop)} ${l.areaHa} ha`).join(", ") || "-"} />
      </div>
    </Card>
  );
}
