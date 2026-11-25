"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { append } from "@/lib/audit";
import { buildRequest, type Answer } from "@/lib/agent/client";
import type { AgentRun, Question, SaakhAgentUIMessage } from "@/lib/agent/types";
import { saveCase, type Case } from "@/lib/store";
import { useUi } from "@/components/ui-provider";
import { Badge, Callout, Card, cx, Money, Para, Spinner, Stat } from "@/components/ui";
import { AgentTrace, secs, TOOL_ICON, traceModel } from "./agent-trace";
import { ResultPanel } from "./result-panel";
import { RiskCard } from "./risk-card";
import { callAi, Ico, ICONS } from "./shared";
import { WhatIfCard } from "./whatif-card";

type Outcome = "none" | "done" | "cancelled" | "noReport";
type FailKind = "config" | "offline" | "provider";
type Times = Record<string, { start: number; end?: number }>;
type Finish = { message: SaakhAgentUIMessage; isAbort: boolean; isError: boolean; isDisconnect: boolean };
const REC_TONE = { approve: "success", review: "warn", decline: "danger" } as const;
const REC_BORDER = { approve: "border-l-success", review: "border-l-warn", decline: "border-l-danger" } as const;
const PLAY = "M8 5v14l11-7z";
const PAUSE = "M8 5h3v14H8zM13 5h3v14h-3z";
const REDO = "M3 12a9 9 0 0115.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 01-15.5 6.2L3 16M3 21v-5h5";
const CHIPS: [string, string][] = [
  ["agent.chip.engine", TOOL_ICON.compute_kcc],
  ["agent.chip.identity", "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM17 11l2 2 4-4"],
  ["agent.chip.double", "M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5"],
  ["agent.chip.crop", TOOL_ICON.check_crop_plan],
  ["agent.chip.whatif", TOOL_ICON.what_if],
  ["agent.chip.harness", ICONS.shield],
];

/** One-line agent status for the case summary rail, e.g. "Review . 2 high risks". */
export function agentLine(run: AgentRun, t: (k: string, v?: Record<string, string | number>) => string) {
  const high = run.report.risks.filter((r) => r.severity === "high").length;
  return `${t(`agent.rec.${run.report.recommendation}`)} · ${high ? t("agent.highRisks", { n: high }) : t("agent.noHighRisks")}`;
}

/** Maps a transport error (status text or JSON body) to a user-facing kind. */
function failKind(e: Error): FailKind {
  let msg = e.message;
  try {
    msg = String(JSON.parse(msg).error ?? msg);
  } catch {}
  if (/not configured|not set up|api key|503/i.test(msg)) return "config";
  if ((typeof navigator !== "undefined" && !navigator.onLine) || /failed to fetch|network|load failed/i.test(msg)) return "offline";
  return "provider";
}

/** Records first-seen and finished times per tool call; returns prev when nothing changed. */
function track(prev: Times, parts: readonly unknown[], now: number): Times {
  let next = prev;
  for (const it of traceModel(parts).tools) {
    const cur = next[it.id];
    const end = it.state !== "running" && !cur?.end ? now : cur?.end;
    if (!cur || end !== cur.end) next = { ...next, [it.id]: { start: cur?.start ?? now, end } };
  }
  return next;
}

const durations = (times: Times, now: number) => Object.fromEntries(Object.entries(times).map(([id, x]) => [id, Math.round((x.end ?? now) - x.start)]));

export function AgentPanel({ c, actor, locked, onSaved, onNext }: { c: Case; actor: string; locked: boolean; onSaved: (c: Case) => void; onNext: () => void }) {
  const { t } = useUi();
  const [transport] = useState(() => new DefaultChatTransport<SaakhAgentUIMessage>({ api: "/api/agent" }));
  const onFinish = useRef<(o: Finish) => void>(() => {});
  const onError = useRef<(e: Error) => void>(() => {});
  const { messages, sendMessage, status, stop, error, setMessages } = useChat<SaakhAgentUIMessage>({
    id: `agent-${c.id}`,
    transport,
    onFinish: (o) => onFinish.current(o),
    onError: (e) => onError.current(e),
  });
  const running = status === "submitted" || status === "streaming";
  const parts = messages.findLast((m) => m.role === "assistant")?.parts ?? [];

  const [run, setRun] = useState<AgentRun | undefined>(c.agent);
  const [outcome, setOutcome] = useState<Outcome>(c.agent ? "done" : "none");
  const [answersSent, setAnswersSent] = useState<Answer[] | undefined>(undefined);
  const [calcOpen, setCalcOpen] = useState(locked && !c.agent);
  const [t0, setT0] = useState(0);
  const [now, setNow] = useState(0);
  const [times, setTimes] = useState<Times>({});
  const partsRef = useRef<readonly unknown[]>(parts);
  const timesRef = useRef(times);
  const stopRef = useRef(stop);

  useEffect(() => {
    partsRef.current = parts;
    timesRef.current = times;
    stopRef.current = stop;
  });
  useEffect(() => () => void stopRef.current(), []);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const n = performance.now();
      setNow(n);
      setTimes((prev) => track(prev, partsRef.current, n));
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    onError.current = (e) => {
      append({ caseId: c.id, type: "ai_call", actor, data: { action: "agent", ok: false, error: failKind(e), ms: Math.round(performance.now() - t0) } }).catch(() => {});
    };
    onFinish.current = ({ message, isAbort, isError, isDisconnect }) => {
      if (isAbort) return setOutcome(run ? "done" : "cancelled");
      if (isError || isDisconnect) return;
      const n = performance.now();
      const finalTimes = track(timesRef.current, message.parts, n);
      setTimes(finalTimes);
      const r = traceModel(message.parts).report;
      if (!r) return setOutcome("noReport");
      const next: AgentRun = { at: new Date().toISOString(), report: r, trace: message.parts, toolMs: durations(finalTimes, n) };
      setRun(next);
      setOutcome("done");
      try {
        onSaved(saveCase({ ...c, agent: next }));
      } catch {}
      append({
        caseId: c.id,
        type: "agent_run",
        actor,
        data: {
          recommendation: r.recommendation,
          confidence: r.confidence,
          steps: r.steps,
          ms: r.ms,
          checks: { passed: r.checks.filter((k) => k.ok).length, total: r.checks.length },
          risks: r.risks.map((k) => `${k.severity}:${k.code}`),
          questions: r.questions.length,
          answers: answersSent?.length ?? 0,
          kccLimit: r.result.kccLimit,
          summaryChars: r.summary.length,
          models: r.models,
        },
      }).catch(() => {});
    };
  });

  const start = (answers?: Answer[]) => {
    const n = performance.now();
    setT0(n);
    setNow(n);
    setTimes({});
    setAnswersSent(answers);
    setOutcome("none");
    setMessages([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
    sendMessage({ text: answers?.length ? "Re-appraise with the officer's answers" : "Appraise this case" }, { body: { request: buildRequest(c, answers) } });
  };

  const fail: FailKind | null = running || outcome === "done" ? null : status === "error" && error ? failKind(error) : outcome === "noReport" ? "provider" : null;
  const showRun = !running && !fail && outcome !== "cancelled" && run;

  const calc = (
    <CalcDisclosure open={calcOpen} onToggle={() => setCalcOpen((o) => !o)}>
      <ResultPanel c={c} />
    </CalcDisclosure>
  );
  const nextBar = (
    <div className="flex justify-end pt-1">
      <button type="button" className="btn-primary btn-lg w-full sm:w-auto" onClick={onNext}>
        {t(locked ? "agent.toDecision" : "result.continue")}
        <Ico d={ICONS.arrow} />
      </button>
    </div>
  );

  if (running)
    return (
      <Card
        title={
          <span className="flex items-center gap-2">
            {t("agent.title")}
            <Badge tone="info" dot>
              {t("agent.running")}
            </Badge>
          </span>
        }
        description={answersSent?.length ? t("agent.rerunning", { n: answersSent.length }) : t("agent.runningHint")}
        actions={
          <>
            <span className="num hidden font-mono text-[12px] text-muted sm:inline" aria-label={t("agent.elapsed")}>
              {secs(now - t0)}
            </span>
            <button type="button" className="btn-ghost h-8 px-3 text-[13px]" onClick={() => stop()}>
              {t("common.cancel")}
            </button>
          </>
        }
      >
        <p className="num mb-3 font-mono text-[12px] text-muted sm:hidden">{secs(now - t0)}</p>
        <AgentTrace parts={parts} toolMs={durations(times, now)} live />
      </Card>
    );

  if (showRun)
    return (
      <div className="space-y-4 lg:space-y-5">
        <ReportHero c={c} run={run} locked={locked} onRerun={() => start()} />
        <RiskCard risks={run.report.risks} />
        <WhatIfCard items={run.report.whatIfs} base={run.report.result.kccLimit} />
        {run.report.questions.length > 0 && <Questions c={c} actor={actor} questions={run.report.questions} locked={locked} onRerun={start} />}
        <TraceDisclosure run={run} />
        {calc}
        {nextBar}
      </div>
    );

  return (
    <div className="space-y-4 lg:space-y-5">
      {fail && (
        <Callout tone="danger" title={t(`agent.err.${fail}`)}>
          <p>{t("agent.err.hint")}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {fail !== "config" && (
              <button type="button" className="btn-ghost h-9 px-3 text-[13px]" onClick={() => start(answersSent)}>
                {t("error.retry")}
              </button>
            )}
            <button type="button" className="btn-primary h-9 px-3 text-[13px]" onClick={() => setCalcOpen(true)}>
              {t("agent.skip")}
            </button>
          </div>
        </Callout>
      )}
      {outcome === "cancelled" && <Callout tone="info" title={t("agent.cancelled")} />}
      {locked ? (
        <Callout tone="info" title={t("agent.noRunLocked")} />
      ) : (
        <Intro c={c} onRun={() => start(answersSent)} onSkip={() => setCalcOpen(true)} again={!!fail || outcome !== "none"} />
      )}
      {(fail || outcome === "cancelled") && parts.length > 0 && (
        <Card title={t("agent.partialTrace")}>
          <AgentTrace parts={parts} toolMs={durations(times, now)} />
        </Card>
      )}
      {run && (outcome === "cancelled" || fail) && (
        <button type="button" className="btn-ghost w-full" onClick={() => setOutcome("done")}>
          {t("agent.showLast")}
        </button>
      )}
      {calc}
      {(calcOpen || locked) && nextBar}
    </div>
  );
}

function Intro({ c, onRun, onSkip, again }: { c: Case; onRun: () => void; onSkip: () => void; again: boolean }) {
  const { t } = useUi();
  return (
    <Card
      title={t("agent.title")}
      description={t("agent.intro")}
      actions={
        c.result && (
          <span className="hidden items-center gap-1.5 text-[12px] text-muted sm:flex">
            {t("agent.engineLimit")} <Money value={c.result.kccLimit} className="font-semibold text-ink" />
          </span>
        )
      }
    >
      <div className="eyebrow mb-2">{t("agent.checks")}</div>
      <ul className="flex flex-wrap gap-1.5">
        {CHIPS.map(([k, d]) => (
          <li key={k} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-subtle px-2 py-1 text-[12px] font-medium text-ink-2">
            <Ico d={d} className="h-3.5 w-3.5 text-muted" />
            {t(k)}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex gap-2 text-[13px] text-muted">
        <Ico d={ICONS.lock} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("agent.guarantee")}
      </p>
      <div className="mt-4 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="btn-ghost" onClick={onSkip}>
          {t("agent.skip")}
        </button>
        <button type="button" className="btn-primary" onClick={onRun}>
          {t(again ? "agent.runAgain" : "agent.run")}
          <Ico d={ICONS.arrow} />
        </button>
      </div>
    </Card>
  );
}

function ReportHero({ c, run, locked, onRerun }: { c: Case; run: AgentRun; locked: boolean; onRerun: () => void }) {
  const { t, lang } = useUi();
  const r = run.report;
  const failed = r.checks.filter((k) => !k.ok);
  const stale = !!c.result && c.result.kccLimit !== r.result.kccLimit;
  const time = new Date(run.at).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  return (
    <section className={cx("card overflow-hidden border-l-[3px]", REC_BORDER[r.recommendation])}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="text-[15px] font-semibold text-ink">{t("agent.title")}</h2>
        <span className="flex items-center gap-2">
          <span className="num hidden text-[12px] text-muted sm:inline">{t("agent.meta", { time, steps: r.steps, s: (r.ms / 1000).toFixed(1) })}</span>
          {!locked && (
            <button type="button" className="btn-ghost h-8 px-2.5 text-[13px]" onClick={onRerun}>
              <Ico d={REDO} className="h-3.5 w-3.5" />
              {t("agent.rerun")}
            </button>
          )}
        </span>
      </div>
      <div className="grid gap-5 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="eyebrow mb-2">{t("agent.recommendation")}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={REC_TONE[r.recommendation]} dot className="px-2.5 py-1 text-[14px] font-semibold">
              {t(`agent.rec.${r.recommendation}`)}
            </Badge>
            <Badge>{t(`agent.conf.${r.confidence}`)}</Badge>
          </div>
          <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-ink-2">{r.summary}</p>
        </div>
        <div className="border-t border-line pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
          <Stat
            label={
              <span className="flex items-center gap-2">
                {t("agent.engineLimit")} <Para p="10" />
              </span>
            }
            value={<Money value={r.result.kccLimit} className="text-primary" />}
            hint={t(r.result.collateralFree ? "agent.collateralFree" : "agent.collateralNeeded")}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-subtle px-5 py-2.5">
        {failed.length === 0 ? (
          <Badge tone="success" className="num">
            <Ico d={ICONS.shield} className="h-3.5 w-3.5" />
            {t("agent.verified", { n: r.checks.length, total: r.checks.length })}
          </Badge>
        ) : (
          <Badge tone="warn" className="num whitespace-normal">
            <Ico d={ICONS.alert} className="h-3.5 w-3.5 shrink-0" />
            {t("agent.verifyFailed", { n: r.checks.length - failed.length, total: r.checks.length, list: failed.map((k) => k.verifier).join(", ") })}
          </Badge>
        )}
        <span className="min-w-0 truncate font-mono text-[11px] text-muted" title={r.models.join(", ")}>
          {r.models.join(" + ")}
        </span>
        <span className="num text-[12px] text-muted sm:hidden">{t("agent.meta", { time, steps: r.steps, s: (r.ms / 1000).toFixed(1) })}</span>
      </div>
      {stale && (
        <div className="border-t border-line px-5 py-3">
          <Callout tone="warn" title={t("agent.stale")} />
        </div>
      )}
    </section>
  );
}

function Questions({ c, actor, questions, locked, onRerun }: { c: Case; actor: string; questions: Question[]; locked: boolean; onRerun: (a: Answer[]) => void }) {
  const { t } = useUi();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const filled = questions.filter((q) => answers[q.id]?.trim());
  return (
    <Card title={t("agent.questions")} description={t("agent.questionsHint")} actions={<span className="num text-[13px] text-muted">{questions.length}</span>} flush>
      <ol className="divide-y divide-line">
        {questions.map((q, i) => (
          <li key={q.id} className="px-5 py-4">
            <div className="flex gap-3">
              <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-subtle text-[12px] font-semibold text-ink-2 ring-1 ring-line-strong">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-[14px] font-medium text-ink">{q.text}</p>
                <p className="text-[13px] text-muted">
                  <span className="font-medium text-ink-2">{t("agent.why")} </span>
                  {q.why}
                </p>
                {q.askFarmer && <FarmerLine c={c} actor={actor} text={q.askFarmer} />}
                {!locked && (
                  <>
                    <label htmlFor={`ans-${q.id}`} className="sr-only">
                      {t("agent.answer")}
                    </label>
                    <textarea
                      id={`ans-${q.id}`}
                      rows={2}
                      className="field h-auto min-h-16 py-2 text-[14px]"
                      placeholder={t("agent.answerPh")}
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {!locked && (
        <div className="flex flex-col gap-2 border-t border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="num text-[12px] text-muted">{t("agent.answered", { n: filled.length, total: questions.length })}</span>
          <button
            type="button"
            className="btn-primary"
            disabled={!filled.length}
            onClick={() => onRerun(filled.map((q) => ({ questionId: q.id, question: q.text, answer: answers[q.id].trim() })))}
          >
            <Ico d={REDO} />
            {t("agent.rerunAnswers")}
          </button>
        </div>
      )}
    </Card>
  );
}

function FarmerLine({ c, actor, text }: { c: Case; actor: string; text: string }) {
  const { t } = useUi();
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const play = async () => {
    if (state === "playing") {
      audio.current?.pause();
      return setState("idle");
    }
    if (!audio.current) {
      setState("loading");
      const r = await callAi<{ audio: string; models: string[] }>("tts", { text: text.slice(0, 1500), lang: c.farmerLang }, c.id, actor);
      if (!r.ok || !r.data.audio) return setState("error");
      audio.current = new Audio(`data:audio/wav;base64,${r.data.audio}`);
      audio.current.onended = () => setState("idle");
    }
    try {
      await audio.current.play();
      setState("playing");
    } catch {
      setState("error");
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-subtle px-3 py-2.5 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-[14px] text-ink" lang={c.farmerLang}>
        {text}
      </p>
      <button type="button" onClick={play} disabled={state === "loading"} aria-pressed={state === "playing"} className="btn-ghost h-8 shrink-0 self-start px-2.5 text-[13px] sm:self-auto">
        {state === "loading" ? <Spinner className="h-3.5 w-3.5" /> : <Ico d={state === "playing" ? PAUSE : PLAY} className="h-3.5 w-3.5" />}
        {t(state === "error" ? "audio.unavailable" : "agent.readToFarmer")}
      </button>
    </div>
  );
}

function TraceDisclosure({ run }: { run: AgentRun }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const steps = traceModel(run.trace).steps;
  return (
    <section className="card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-3.5 text-left">
        <Ico d={ICONS.chevron} className={cx("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-90")} />
        <span className="text-[14px] font-medium text-ink">{t("agent.viewTrace")}</span>
        <span className="num ml-auto font-mono text-[12px] text-muted">{t("agent.traceMeta", { steps, s: (run.report.ms / 1000).toFixed(1) })}</span>
      </button>
      {open && (
        <div className="border-t border-line px-3 py-3 sm:px-5 sm:py-4">
          <AgentTrace parts={run.trace} toolMs={run.toolMs} />
        </div>
      )}
    </section>
  );
}

function CalcDisclosure({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const { t } = useUi();
  return (
    <div className="space-y-4 lg:space-y-5">
      <button type="button" onClick={onToggle} aria-expanded={open} className="card flex w-full items-center gap-3 px-5 py-3.5 text-left">
        <Ico d={ICONS.chevron} className={cx("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-90")} />
        <span className="min-w-0">
          <span className="block text-[14px] font-medium text-ink">{t("agent.fullCalc")}</span>
          <span className="block text-[12px] text-muted">{t("agent.fullCalcHint")}</span>
        </span>
      </button>
      {open && children}
    </div>
  );
}
