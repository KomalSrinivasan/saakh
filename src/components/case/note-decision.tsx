"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { append } from "@/lib/audit";
import { LANGUAGES, type LangCode } from "@/lib/i18n";
import { streamNote } from "@/lib/note-stream";
import { decide, saveCase, type Case, type Decision } from "@/lib/store";
import { Icon } from "@/components/shell";
import { useUi } from "@/components/ui-provider";
import { Badge, Callout, Card, Para, Spinner, cx, inr } from "@/components/ui";
import { hasBlockingError } from "./result-panel";
import { AiErrorBox, callAi, ICONS, type AiFail } from "./shared";

type Live = { officer: string; phase: "drafting" | "checking" | "redrafting" };

const I = {
  doc: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5M9 13h6M9 17h4",
  copy: "M9 9h10a1 1 0 011 1v10a1 1 0 01-1 1H9a1 1 0 01-1-1V10a1 1 0 011-1zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1",
  check: "M20 6L9 17l-5-5",
  shield: "M9 12l2 2 4-4m5.6-4.4A12 12 0 0112 2.9 12 12 0 013.4 7.6 12 12 0 0012 21.1a12 12 0 008.6-13.5z",
  play: "M7 4.5v15l12.5-7.5L7 4.5z",
  pause: "M8 5v14M16 5v14",
  refresh: "M4 4v6h6M20 20v-6h-6M5.6 15a8 8 0 0013.4 2.5L20 14M18.4 9A8 8 0 005 6.5L4 10",
  arrow: "M5 12h14m-6-6l6 6-6 6",
  lock: "M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z",
};

const langLabel = (code: LangCode, ui: LangCode) => {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? (ui === "en-IN" ? l.english : l.name) : code;
};

const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

// Renders "para 13(5)", "(Para 10)", "पैरा 10" and "¶ 13(3)" as citation chips.
const PARA_RE = /\(?(?:¶\s*|\b[Pp]ara(?:graph)?\s+|पैरा\s+)(\d+(?:\([0-9a-z]+\))*)\)?/g;
function WithParas({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(PARA_RE)) {
    out.push(text.slice(last, m.index));
    out.push(<Para key={m.index} p={m[1]} className="mx-0.5 align-[1px]" />);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

function useElapsed(on: boolean) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!on) return;
    const start = Date.now();
    const id = setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 250);
    return () => {
      clearInterval(id);
      setSecs(0);
    };
  }, [on]);
  return secs;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useUi();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button type="button" onClick={copy} aria-label={label} className="btn-ghost h-8 gap-1.5 px-2.5 text-[13px] font-medium">
      <Icon d={copied ? I.check : I.copy} className={cx("h-3.5 w-3.5", copied && "text-success")} />
      <span aria-live="polite">{copied ? t("note.copied") : t("note.copy")}</span>
    </button>
  );
}

function SkeletonLines({ n }: { n: number }) {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-line/80" style={{ width: `${[92, 100, 86, 97, 72, 88, 60][i % 7]}%` }} />
      ))}
    </div>
  );
}

export function NotePanel({ c, actor, locked, onSaved, onNext }: { c: Case; actor: string; locked: boolean; onSaved: (c: Case) => void; onNext: () => void }) {
  const { t, lang } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiFail | null>(null);
  const [audio, setAudio] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [audioErr, setAudioErr] = useState<AiFail | null>(null);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const player = useRef<HTMLAudioElement | null>(null);
  const playerText = useRef("");
  const runId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const secs = useElapsed(busy);

  useEffect(
    () => () => {
      player.current?.pause();
      abort.current?.abort();
    },
    [],
  );

  const resetAudio = () => {
    player.current?.pause();
    player.current = null;
    playerText.current = "";
    setAudio("idle");
    setPos(0);
    setDur(0);
  };

  const cancel = () => {
    runId.current++;
    abort.current?.abort();
    setBusy(false);
    setLive(null);
  };

  // Streams the draft for display; the note is saved (and copy/continue unlock) only after the server verified every figure.
  const draft = async () => {
    const id = ++runId.current;
    abort.current?.abort();
    const ctrl = (abort.current = new AbortController());
    resetAudio();
    setBusy(true);
    setError(null);
    setLive({ officer: "", phase: "drafting" });
    const started = performance.now();
    const r = await streamNote(
      { case: { ...c, extracted: undefined }, officerLang: c.officerLang, farmerLang: c.farmerLang },
      (e) => {
        if (id !== runId.current) return;
        if (e.type === "redraft") return setLive({ officer: "", phase: "redrafting" });
        setLive((l) => {
          const cur = l ?? { officer: "", phase: "drafting" };
          if (e.type === "checking") return { ...cur, phase: "checking" };
          return e.type === "draft" ? { ...cur, officer: e.reset ? e.text : cur.officer + e.text } : cur;
        });
      },
      ctrl.signal,
    );
    const ms = Math.round(performance.now() - started);
    append({ caseId: c.id, type: "ai_call", actor, data: { action: "note", models: r.ok ? r.data.models : [], ms, ok: r.ok, ...(r.ok ? {} : { status: r.status, error: r.error.kind }) } }).catch(() => {});
    if (id !== runId.current) return;
    setBusy(false);
    setLive(null);
    if (!r.ok) return setError(r.error);
    try {
      const next = saveCase({ ...c, note: { officer: r.data.officer, farmer: r.data.farmer } });
      onSaved(next);
      append({ caseId: c.id, type: "note_drafted", actor, data: { models: r.data.models, officerLang: c.officerLang, farmerLang: c.farmerLang, chars: r.data.officer.length + r.data.farmer.length } }).catch(() => {});
    } catch {
      setError({ kind: "input", message: t("error.storage") });
    }
  };

  const play = async () => {
    const p = player.current;
    if (audio === "playing") {
      p?.pause();
      return setAudio("paused");
    }
    if (!c.note) return;
    // Resume the cached clip when the summary has not changed.
    if (p && playerText.current === c.note.farmer) {
      try {
        await p.play();
        return setAudio("playing");
      } catch {}
    }
    setAudio("loading");
    setAudioErr(null);
    const r = await callAi<{ audio: string; models: string[] }>("tts", { text: c.note.farmer.slice(0, 1500), lang: c.farmerLang }, c.id, actor);
    if (!r.ok || !r.data.audio) {
      setAudio("idle");
      return setAudioErr(r.ok ? { kind: "provider", message: "empty" } : r.error);
    }
    const a = new Audio(`data:audio/wav;base64,${r.data.audio}`);
    player.current = a;
    playerText.current = c.note.farmer;
    a.onloadedmetadata = () => setDur(a.duration);
    a.ontimeupdate = () => setPos(a.currentTime);
    a.onended = () => {
      setAudio("idle");
      setPos(0);
    };
    a.onerror = () => {
      setAudio("idle");
      setAudioErr({ kind: "provider", message: "playback" });
    };
    try {
      await a.play();
      setAudio("playing");
    } catch {
      setAudio("idle");
      setAudioErr({ kind: "provider", message: "playback" });
    }
  };

  const farmerLang = langLabel(c.farmerLang, lang);
  const officerLang = langLabel(c.officerLang, lang);
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;

  if (!c.note && !busy && !error) {
    return (
      <Card title={t("note.title")} description={t("note.desc")}>
        {locked ? (
          <p className="text-[14px] text-muted">{t("note.none")}</p>
        ) : (
          <div className="flex flex-col items-center px-2 py-8 text-center sm:py-10">
            <div className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-subtle text-muted">
              <Icon d={I.doc} className="h-5 w-5" />
            </div>
            <div className="mt-3 text-[15px] font-semibold text-ink">{t("note.emptyTitle")}</div>
            <p className="mt-1 max-w-md text-[13px] leading-5 text-muted">{t("note.hint")}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              <Badge>{t("note.langOfficer", { lang: officerLang })}</Badge>
              <Badge>{t("note.langFarmer", { lang: farmerLang })}</Badge>
            </div>
            <div className="mt-5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button type="button" className="btn-primary btn-lg" onClick={draft}>
                <Icon d={I.doc} className="h-4 w-4" />
                {t("note.draft")}
              </button>
              <button type="button" className="btn-ghost btn-lg" onClick={onNext}>
                {t("note.skip")}
              </button>
            </div>
          </div>
        )}
      </Card>
    );
  }

  if (busy) {
    const phase = live?.phase === "checking" ? t("note.checking") : live?.phase === "redrafting" ? t("note.redrafting") : t("note.drafting");
    return (
      <div className="space-y-4">
        <div role="status" aria-live="polite" aria-busy="true" className="card flex items-center gap-3 px-5 py-3.5">
          <Spinner className="text-primary" />
          <div className="min-w-0 flex-1 text-[14px]">
            <span className="font-semibold text-ink">{phase}</span>
            <span className="num ml-2 text-muted">{t("ai.elapsed", { s: secs })}</span>
            {secs >= 15 && <span className="ml-2 text-muted">{t("ai.slow")}</span>}
          </div>
          <button type="button" className="btn-ghost h-9 px-3 text-[13px]" onClick={cancel}>
            {t("common.cancel")}
          </button>
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {live?.officer ? (
            <Card title={t("note.officerTitle")} description={officerLang} flush>
              <article className="px-5 py-5 sm:px-6" aria-busy="true">
                <div className="text-[14px] leading-7 whitespace-pre-wrap text-ink-2">
                  <WithParas text={live.officer} />
                </div>
              </article>
              <div className="flex items-center gap-2 border-t border-line bg-warn-soft px-5 py-2.5 text-[12px] text-ink-2 sm:px-6">
                <Icon d={I.shield} className="h-4 w-4 shrink-0 text-warn" />
                {t("note.unverified")}
              </div>
            </Card>
          ) : (
            <Card title={t("note.officer")}>
              <SkeletonLines n={7} />
            </Card>
          )}
          <Card title={t("note.farmer")}>
            <SkeletonLines n={5} />
          </Card>
        </div>
      </div>
    );
  }

  if (!c.note) {
    return (
      <Card title={t("note.title")}>
        {error && <AiErrorBox error={error} fallbackKey="note.failed" onRetry={draft} onManual={onNext} manualKey="note.toDecision" />}
        <p className="mt-3 text-[13px] text-muted">{t("note.skipHint")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      {error && <AiErrorBox error={error} fallbackKey="note.failed" onRetry={draft} onManual={onNext} manualKey="note.toDecision" />}
      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
        <Card
          title={t("note.officerTitle")}
          description={officerLang}
          actions={<CopyButton text={c.note.officer} label={t("note.copyOfficer")} />}
          flush
        >
          <article className="px-5 py-5 sm:px-6">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-dashed border-line pb-3">
              <span className="eyebrow">{t("note.docHead")}</span>
              <span className="num font-mono text-[11px] text-muted">{c.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="text-[14px] leading-7 whitespace-pre-wrap text-ink-2">
              <WithParas text={c.note.officer} />
            </div>
          </article>
          <div className="flex items-center gap-2 border-t border-line bg-subtle px-5 py-2.5 text-[12px] text-success sm:px-6">
            <Icon d={I.shield} className="h-4 w-4 shrink-0" />
            {t("note.verified")}
          </div>
        </Card>

        <Card title={t("note.farmerTitle")} actions={<Badge tone="brand">{farmerLang}</Badge>} className="lg:sticky lg:top-6" flush>
          <article className="px-5 py-5 text-[15px] leading-7 whitespace-pre-wrap text-ink sm:px-6">
            <WithParas text={c.note.farmer} />
          </article>
          <div className="border-t border-line bg-subtle px-4 py-3 sm:px-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={play}
                disabled={audio === "loading"}
                aria-pressed={audio === "playing"}
                aria-label={audio === "playing" ? t("audio.pause") : t("audio.readAloud", { lang: farmerLang })}
                className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-on-primary shadow-card transition-colors hover:bg-primary-hover disabled:cursor-wait disabled:opacity-70"
              >
                {audio === "loading" ? <Spinner /> : <Icon d={audio === "playing" ? I.pause : I.play} className={cx("h-4 w-4", audio !== "playing" && "ml-0.5 fill-current")} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">
                    {audio === "loading" ? t("audio.loading") : t("audio.readAloud", { lang: farmerLang })}
                  </span>
                  <span className="num shrink-0 text-[12px] text-muted">
                    {clock(pos)} / {clock(dur)}
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={t("audio.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                  <div className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <CopyButton text={c.note.farmer} label={t("note.copyFarmer")} />
            </div>
            {audioErr && <p className="mt-2 text-[13px] text-danger">{audioErr.kind === "config" ? t("ai.notConfigured") : t("audio.unavailable")}</p>}
          </div>
        </Card>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        {!locked ? (
          <button type="button" className="btn-ghost" onClick={draft}>
            <Icon d={I.refresh} className="h-4 w-4" />
            {t("note.regenerate")}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="btn-primary btn-lg" onClick={onNext}>
          {t("note.continue")}
          <Icon d={I.arrow} className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

type Mode = "approved" | "edited_approved" | "rejected" | null;

export function DecisionPanel({ c, actor, onDecided }: { c: Case; actor: string; onDecided: (c: Case) => void }) {
  const { t, lang } = useUi();
  const [mode, setMode] = useState<Mode>(null);
  const [limit, setLimit] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const r = c.result;
  const clearErr = (k: string) => setErr((e) => Object.fromEntries(Object.entries(e).filter(([x]) => x !== k)));

  if (c.decision) return <DecisionSummary d={c.decision} recommended={r?.kccLimit} />;
  if (!r) return null;
  const blocked = hasBlockingError(r);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    const er: Record<string, string> = {};
    const finalLimit = mode === "approved" ? r.kccLimit : mode === "rejected" ? 0 : Number(limit);
    if (mode === "edited_approved" && !(finalLimit > 0)) er.limit = t("case.amountInvalid");
    if (mode === "edited_approved" && finalLimit === r.kccLimit) er.limit = t("decision.sameLimit");
    if (mode !== "approved" && !reason.trim()) er.reason = mode === "rejected" ? t("decision.rejectReasonRequired") : t("decision.reasonRequired");
    setErr(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const d: Omit<Decision, "at"> = { action: mode, finalLimit, by: actor, ...(mode !== "approved" ? { reason: reason.trim() } : {}) };
      const next = saveCase(decide(c, d));
      await append({ caseId: c.id, type: "decision", actor, data: { action: mode, finalLimit, recommended: r.kccLimit, reason: d.reason } });
      onDecided(next);
    } catch {
      setErr({ form: t("error.storage") });
      setBusy(false);
    }
  };

  const options: { m: Exclude<Mode, null>; title: string; desc: string; amount?: string; disabled?: boolean; tone: string }[] = [
    { m: "approved", title: t("decision.opt.approve"), desc: t("decision.opt.approveDesc"), amount: inr(r.kccLimit), disabled: blocked, tone: "border-primary ring-primary/15 bg-primary-soft/50" },
    { m: "edited_approved", title: t("decision.opt.edit"), desc: t("decision.opt.editDesc"), disabled: blocked, tone: "border-primary ring-primary/15 bg-primary-soft/50" },
    { m: "rejected", title: t("decision.opt.reject"), desc: t("decision.opt.rejectDesc"), tone: "border-danger ring-danger/15 bg-danger-soft/60" },
  ];
  const edited = Number(limit);
  const diff = edited > 0 ? edited - r.kccLimit : 0;

  return (
    <Card title={t("decision.title")} description={t("decision.notAuto")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-subtle px-4 py-3">
        <span className="text-[13px] text-muted">{t("decision.computed")}</span>
        <span className="flex items-center gap-2">
          <span className="num text-[18px] font-semibold text-ink">{inr(r.kccLimit)}</span>
          <Para p="10" />
        </span>
      </div>
      {blocked && <Callout tone="danger" title={t("decision.blocked")} className="mb-4" />}
      <form onSubmit={submit} noValidate className="space-y-5">
        <fieldset>
          <legend className="label">{t("decision.choose")}</legend>
          <div className="grid gap-2.5 md:grid-cols-3">
            {options.map((o) => {
              const on = mode === o.m;
              return (
                <label
                  key={o.m}
                  className={cx(
                    "relative flex min-h-11 gap-3 rounded-lg border p-3.5 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/20",
                    o.disabled ? "cursor-not-allowed border-line bg-subtle opacity-55" : "cursor-pointer",
                    on ? cx("ring-2", o.tone) : !o.disabled && "border-line-strong bg-surface hover:border-muted/60 hover:bg-subtle",
                  )}
                >
                  <input
                    type="radio"
                    name="decision"
                    value={o.m}
                    checked={on}
                    disabled={o.disabled}
                    onChange={() => {
                      setMode(o.m);
                      setErr({});
                    }}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cx(
                      "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                      on ? (o.m === "rejected" ? "border-danger bg-danger" : "border-primary bg-primary") : "border-line-strong bg-surface",
                    )}
                  >
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cx("block text-[14px] font-semibold", on && o.m === "rejected" ? "text-danger" : "text-ink")}>{o.title}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-[18px] text-muted">{o.desc}</span>
                    {o.amount && <span className="num mt-1.5 block text-[14px] font-semibold text-ink">{o.amount}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {mode === "edited_approved" && (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
            <div>
              <label htmlFor="dec-limit" className="label">
                {t("decision.finalLimit")} <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-[15px] text-muted" aria-hidden="true">
                  ₹
                </span>
                <input
                  id="dec-limit"
                  className="field num pl-7"
                  inputMode="numeric"
                  autoComplete="off"
                  value={limit ? Number(limit).toLocaleString("en-IN") : ""}
                  aria-invalid={!!err.limit}
                  aria-describedby="dec-limit-help"
                  onChange={(e) => {
                    setLimit(e.target.value.replace(/[^\d]/g, "").slice(0, 9));
                    clearErr("limit");
                  }}
                />
              </div>
              <p id="dec-limit-help" className={cx("num mt-1.5 text-[12px]", err.limit ? "text-danger" : "text-muted")}>
                {err.limit ?? (diff ? t(diff < 0 ? "decision.below" : "decision.above", { amount: inr(Math.abs(diff)) }) : t("decision.limitHelp"))}
              </p>
            </div>
            <ReasonField id="dec-reason" label={t("decision.reason")} value={reason} onChange={(v) => {
                setReason(v);
                clearErr("reason");
              }} error={err.reason} placeholder={t("decision.reasonPh")} />
          </div>
        )}
        {mode === "rejected" && <ReasonField id="dec-reason" label={t("decision.rejectReason")} value={reason} onChange={(v) => {
                setReason(v);
                clearErr("reason");
              }} error={err.reason} placeholder={t("decision.rejectPh")} />}
        {err.form && <p className="text-[13px] text-danger">{err.form}</p>}

        {mode && (
          <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5 text-[13px] leading-5">
              <Icon d={I.lock} className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <div>
                <div className="font-medium text-ink">{t("decision.final")}</div>
                <div className="text-muted">{t("decision.finalWarning", { name: actor, date: new Date().toLocaleDateString(lang) })}</div>
              </div>
            </div>
            <button type="submit" className={cx(mode === "rejected" ? "btn-danger" : "btn-primary", "btn-lg shrink-0")} disabled={busy}>
              {busy && <Spinner />}
              {mode === "rejected" ? t("decision.confirmReject") : t("decision.confirm")}
            </button>
          </div>
        )}
      </form>
    </Card>
  );
}

function ReasonField({ id, label, value, onChange, error, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; placeholder: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label} <span className="text-danger">*</span>
      </label>
      <textarea
        id={id}
        className="field min-h-24 py-2 leading-6"
        maxLength={500}
        value={value}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={`${id}-help`}
        onChange={(e) => onChange(e.target.value)}
      />
      <div id={`${id}-help`} className="mt-1.5 flex justify-between gap-2 text-[12px]">
        <span className="text-danger">{error}</span>
        <span className="num text-muted">{value.length}/500</span>
      </div>
    </div>
  );
}

function DecisionSummary({ d, recommended }: { d: Decision; recommended?: number }) {
  const { t, lang } = useUi();
  const rejected = d.action === "rejected";
  const when = new Date(d.at).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
  return (
    <Card
      title={t("decision.title")}
      actions={
        <Badge>
          <Icon d={I.lock} className="h-3 w-3" />
          {t("decision.lockedBadge")}
        </Badge>
      }
      flush
    >
      <div className={cx("flex items-start gap-4 border-b px-5 py-5 sm:px-6", rejected ? "border-danger/20 bg-danger-soft" : "border-success/20 bg-success-soft")}>
        <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-full text-white", rejected ? "bg-danger" : "bg-success")}>
          <Icon d={rejected ? ICONS.x : I.check} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className={cx("text-[15px] font-semibold", rejected ? "text-danger" : "text-success")}>{t(`status.${d.action}`)}</div>
          {!rejected && <div className="num mt-1 text-[28px] leading-none font-semibold tracking-[-0.01em] text-ink">{inr(d.finalLimit)}</div>}
          <div className="mt-2 text-[13px] text-ink-2">{t("decision.by", { name: d.by, date: when })}</div>
        </div>
      </div>
      <dl className="divide-y divide-line px-5 pb-1.5 sm:px-6">
        {recommended != null && (
          <div className="flex justify-between gap-4 py-2.5 text-[14px]">
            <dt className="text-muted">{t("decision.computed")}</dt>
            <dd className="num font-medium text-ink">{inr(recommended)}</dd>
          </div>
        )}
        {!rejected && (
          <div className="flex justify-between gap-4 py-2.5 text-[14px]">
            <dt className="text-muted">{t("decision.finalLimitShort")}</dt>
            <dd className="num font-medium text-ink">{inr(d.finalLimit)}</dd>
          </div>
        )}
        {d.reason && (
          <div className="py-2.5 text-[14px]">
            <dt className="text-muted">{rejected ? t("decision.rejectReason") : t("decision.reason")}</dt>
            <dd className="mt-1 text-ink">{d.reason}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
