"use client";

import { useEffect, useRef, useState } from "react";
import { append } from "@/lib/audit";
import { langName, type LangCode } from "@/lib/i18n";
import type { CropLine } from "@/lib/kcc";
import { listCrops } from "@/lib/sof";
import type { Case } from "@/lib/store";
import { LanguageSelect } from "@/components/shell";
import { useUi } from "@/components/ui-provider";
import { Badge, Callout, Card, cx } from "@/components/ui";
import type { CasePatch } from "./capture-land";
import { AiBusy, AiErrorBox, callAi, cropName, FollowUps, Ico, ICONS, type AiFail } from "./shared";

type CropsResp = { transcript: string; english: string; crops: (CropLine & { spokenAs?: string })[]; unmapped: string[]; followUps: string[]; models: string[] };

const MAX_SECS = 30;
const RING = 2 * Math.PI * 54;
const SEASON_TONE = { kharif: "success", rabi: "info", zaid: "warn", annual: "neutral" } as const;
// Fictional sample clips of the same crop plan, see public/samples/crop-plans.json.
const CLIP_LANGS: LangCode[] = ["hi-IN", "mr-IN", "gu-IN", "te-IN", "ta-IN", "en-IN"];
const clipSrc = (l: LangCode) => `/samples/crop-plan-${l.slice(0, 2)}.wav`;
const clock = (s: number) => `0:${String(s).padStart(2, "0")}`;

export function CaptureCrops({ c, actor, onApply, onManual }: { c: Case; actor: string; onApply: (p: CasePatch) => void; onManual: () => void }) {
  const { t, mode: appMode } = useUi();
  const [farmerLang, setFarmerLang] = useState<LangCode>(c.farmerLang);
  const [clip, setClip] = useState<LangCode>(CLIP_LANGS.includes(c.farmerLang) ? c.farmerLang : "hi-IN");
  const [landHa, setLandHa] = useState(c.landHa > 0 ? String(c.landHa) : "");
  const [mode, setMode] = useState<"speak" | "type">("speak");
  const [text, setText] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiFail | null>(null);
  const [micErr, setMicErr] = useState(false);
  const [resp, setResp] = useState<CropsResp | null>(null);
  const [landErr, setLandErr] = useState(false);
  const last = useRef<Blob | string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const runId = useRef(0);

  useEffect(
    () => () => {
      clearInterval(tick.current);
      if (rec.current?.state === "recording") rec.current.stop();
    },
    [],
  );

  const send = async (input: Blob | string, lang = farmerLang) => {
    const ha = Number(landHa);
    if (!(ha > 0)) return setLandErr(true);
    last.current = input;
    const id = ++runId.current;
    setBusy(true);
    setError(null);
    setResp(null);
    const fd = new FormData();
    if (typeof input === "string") fd.append("text", input);
    else fd.append("audio", input, `plan.${input.type.includes("wav") ? "wav" : input.type.includes("mp4") ? "m4a" : "webm"}`);
    fd.append("farmerLang", lang);
    fd.append("officerLang", c.officerLang);
    fd.append("district", c.district);
    fd.append("landHa", String(ha));
    fd.append("crops", JSON.stringify(listCrops(c.district)));
    const r = await callAi<CropsResp>("crops", fd, c.id, actor);
    if (id !== runId.current) return;
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setResp(r.data);
    append({ caseId: c.id, type: "extracted", actor, data: { kind: "crops", crops: r.data.crops, unmapped: r.data.unmapped, followUps: r.data.followUps?.length ?? 0 } }).catch(() => {});
  };

  const stop = () => {
    clearInterval(tick.current);
    setLeft(null);
    if (rec.current?.state === "recording") rec.current.stop();
  };

  const record = async () => {
    setMicErr(false);
    if (!(Number(landHa) > 0)) return setLandErr(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setMicErr(true);
    }
    const chunks: Blob[] = [];
    const mr = new MediaRecorder(stream);
    rec.current = mr;
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      if (blob.size) send(blob);
    };
    mr.start();
    const started = Date.now();
    setLeft(MAX_SECS);
    tick.current = setInterval(() => {
      const remain = MAX_SECS - Math.floor((Date.now() - started) / 1000);
      if (remain <= 0) stop();
      else setLeft(remain);
    }, 250);
  };

  const loadSamplePlan = async () => {
    try {
      const res = await fetch("/samples/crop-plans.json");
      const j = (await res.json()) as { plans: { lang: string; text: string }[] };
      const p = j.plans.find((x) => x.lang === farmerLang) ?? j.plans.find((x) => x.lang === "hi-IN");
      if (p) {
        setText(p.text);
        if (p.lang !== farmerLang && (p.lang === "hi-IN" || p.lang === "en-IN")) setFarmerLang(p.lang);
      }
    } catch {}
  };

  const pickClip = async () => {
    try {
      const res = await fetch(clipSrc(clip));
      if (!res.ok) throw new Error(String(res.status));
      setFarmerLang(clip);
      send(await res.blob(), clip);
    } catch {
      setError({ kind: "provider", message: "sample" });
    }
  };

  const apply = () => {
    if (!resp) return;
    onApply({
      farmerLang,
      landHa: Number(landHa),
      crops: resp.crops.map(({ crop, season, areaHa }) => ({ crop, season, areaHa })),
      extracted: { ...c.extracted, crops: { crops: resp.crops, unmapped: resp.unmapped }, transcript: resp.transcript },
    });
  };

  const recording = left !== null;
  const elapsed = recording ? MAX_SECS - (left ?? 0) : 0;
  const langLabel = langName(farmerLang);

  return (
    <Card
      title={t("case.step.crops")}
      description={t("case.recordHint")}
      actions={
        !resp && (
          <button type="button" className="hidden h-8 rounded-md px-2 text-[13px] font-medium text-primary hover:bg-primary-soft sm:inline-flex sm:items-center" onClick={onManual}>
            {t("error.manual")}
          </button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="crop-flang" className="label">
            {t("lang.farmer")}
          </label>
          <LanguageSelect id="crop-flang" value={farmerLang} onChange={setFarmerLang} />
        </div>
        <div>
          <label htmlFor="crop-land" className="label">
            {t("case.landHa")}
            <span className="ml-0.5 text-danger">*</span>
          </label>
          <div className="relative">
            <input
              id="crop-land"
              className={cx("field num pr-10 text-right", landErr && "border-danger")}
              inputMode="decimal"
              value={landHa}
              aria-invalid={landErr}
              aria-describedby={landErr ? "crop-land-err" : undefined}
              onChange={(e) => {
                setLandHa(e.target.value);
                setLandErr(false);
              }}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-muted">ha</span>
          </div>
          {landErr && (
            <p id="crop-land-err" className="mt-1 text-[12px] font-medium text-danger">
              {t("case.landRequired")}
            </p>
          )}
        </div>
      </div>

      {!busy && !resp && (
        <div className="mt-5">
          <div role="tablist" aria-label={t("case.step.crops")} className="inline-flex rounded-lg border border-line bg-subtle p-0.5">
            {(["speak", "type"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                disabled={recording}
                onClick={() => setMode(m)}
                className={cx(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
                  mode === m ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink",
                )}
              >
                <Ico d={m === "speak" ? ICONS.mic : ICONS.file} className="h-3.5 w-3.5" />
                {t(m === "speak" ? "case.speak" : "case.type")}
              </button>
            ))}
          </div>

          {mode === "speak" ? (
            <div className="mt-4 flex flex-col items-center rounded-lg border border-line bg-subtle px-4 py-7" role="status" aria-live="polite">
              <div className="relative grid h-32 w-32 place-items-center">
                <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden="true">
                  <circle cx="60" cy="60" r="54" fill="none" strokeWidth="4" className="stroke-line" />
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={RING}
                    strokeDashoffset={RING * (1 - elapsed / MAX_SECS)}
                    className={cx("transition-[stroke-dashoffset] duration-1000 ease-linear", recording ? "stroke-danger" : "stroke-transparent")}
                  />
                </svg>
                <button
                  type="button"
                  onClick={recording ? stop : record}
                  aria-label={recording ? t("case.stopRecording") : t("case.recordCrops")}
                  className={cx(
                    "grid h-24 w-24 place-items-center rounded-full text-white shadow-card transition-colors focus-visible:ring-4",
                    recording ? "bg-danger hover:bg-danger/90 focus-visible:ring-danger/20" : "bg-primary hover:bg-primary-hover focus-visible:ring-primary/20",
                  )}
                >
                  <Ico d={recording ? ICONS.stop : ICONS.mic} className="h-8 w-8" />
                </button>
              </div>
              {recording ? (
                <>
                  <p className="num mt-4 text-[20px] font-semibold tracking-tight text-ink">
                    {clock(elapsed)} <span className="text-[14px] font-normal text-muted">/ {clock(MAX_SECS)}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-danger">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" aria-hidden />
                    {t("case.recordingLeft", { s: left ?? 0 })}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-4 text-[14px] font-semibold text-ink">{t("case.tapToRecord")}</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {langLabel} · {t("case.recordLimit", { s: MAX_SECS })}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor="crop-text" className="text-[13px] font-medium text-ink-2">
                  {t("case.typePlan")}
                </label>
                {appMode === "demo" && (
                  <button type="button" className="inline-flex h-8 items-center rounded-md px-2 text-[13px] font-medium text-primary hover:bg-primary-soft" onClick={loadSamplePlan}>
                    {t("case.samplePlan")}
                  </button>
                )}
              </div>
              <textarea id="crop-text" lang={farmerLang} className="field h-auto min-h-28 py-2.5 leading-relaxed" rows={4} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="mt-3 flex justify-end">
                <button type="button" className="btn-primary w-full sm:w-auto" disabled={!text.trim()} onClick={() => send(text.trim())}>
                  {t("case.understandText")}
                  <Ico d={ICONS.arrow} />
                </button>
              </div>
            </div>
          )}
          {micErr && <Callout tone="danger" title={t("error.mic")} className="mt-3" />}
          {appMode === "demo" && !recording && (
            <fieldset className="mt-5">
              <legend className="eyebrow mb-2">{t("demo.clipsTitle")}</legend>
              <div className="flex flex-wrap gap-1.5">
                {CLIP_LANGS.map((l) => (
                  <label key={l} className={cx("inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-[13px] font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary", clip === l ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink-2 hover:text-ink")}>
                    <input type="radio" name="sample-clip" value={l} checked={clip === l} onChange={() => setClip(l)} className="sr-only" />
                    {langName(l)}
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <audio key={clip} controls preload="none" src={clipSrc(clip)} className="h-11 w-full min-w-0 sm:flex-1" aria-label={`${t("demo.clipsTitle")}: ${langName(clip)}`} />
                <button type="button" className="btn-primary shrink-0" onClick={pickClip}>
                  {t("demo.useClip")}
                  <Ico d={ICONS.arrow} />
                </button>
              </div>
              <p className="mt-2 text-[12px] text-muted">{t("demo.clipsHint")}</p>
            </fieldset>
          )}
        </div>
      )}

      <div className="mt-5 space-y-4 empty:hidden">
        {busy && (
          <AiBusy
            label={t("case.transcribing")}
            onCancel={() => {
              runId.current++;
              setBusy(false);
            }}
          />
        )}
        {error && <AiErrorBox error={error} fallbackKey="error.unclearAudio" onRetry={() => last.current && send(last.current)} onManual={onManual} />}
        {resp && (
          <>
            {resp.transcript && (
              <div className="overflow-hidden rounded-lg border border-line">
                <div className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-4 py-2">
                  <span className="eyebrow">{t("case.transcript")}</span>
                  <Badge>{langLabel}</Badge>
                </div>
                <p lang={farmerLang} className="px-4 py-3 text-[15px] leading-relaxed text-ink">
                  {resp.transcript}
                </p>
                {resp.english && resp.english !== resp.transcript && (
                  <div className="border-t border-line px-4 py-3">
                    <div className="eyebrow mb-1">{t("case.english")}</div>
                    <p className="text-[13px] leading-relaxed text-muted">{resp.english}</p>
                  </div>
                )}
              </div>
            )}

            <FollowUps items={resp.followUps} />

            <div className="overflow-hidden rounded-lg border border-line">
              <div className="border-b border-line px-4 py-2.5 text-[14px] font-semibold text-ink">{t("case.mappedCrops")}</div>
              {resp.crops.length ? (
                <>
                  <table className="hidden w-full text-[14px] sm:table">
                    <thead className="bg-subtle text-left text-[12px] font-medium tracking-wide text-muted uppercase">
                      <tr>
                        <th className="px-4 py-2 font-medium">{t("case.crop")}</th>
                        <th className="px-4 py-2 font-medium">{t("case.season")}</th>
                        <th className="px-4 py-2 text-right font-medium">{t("case.area")}</th>
                        <th className="px-4 py-2 font-medium">{t("case.spokenAs")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resp.crops.map((cl, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="px-4 py-2.5 font-medium text-ink">{cropName(cl.crop)}</td>
                          <td className="px-4 py-2.5">
                            <Badge tone={SEASON_TONE[cl.season] ?? "neutral"}>{t(`season.${cl.season}`)}</Badge>
                          </td>
                          <td className="num px-4 py-2.5 text-right text-ink">{cl.areaHa}</td>
                          <td lang={farmerLang} className="max-w-[180px] truncate px-4 py-2.5 text-muted">
                            {cl.spokenAs || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ul className="divide-y divide-line sm:hidden">
                    {resp.crops.map((cl, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-medium text-ink">{cropName(cl.crop)}</span>
                            <Badge tone={SEASON_TONE[cl.season] ?? "neutral"}>{t(`season.${cl.season}`)}</Badge>
                          </div>
                          {cl.spokenAs && (
                            <div lang={farmerLang} className="mt-0.5 truncate text-[12px] text-muted">
                              {cl.spokenAs}
                            </div>
                          )}
                        </div>
                        <span className="num shrink-0 text-[14px] font-medium text-ink">{cl.areaHa} ha</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="px-4 py-3 text-[13px] text-muted">{t("case.noCrops")}</p>
              )}
            </div>

            {resp.unmapped.length > 0 && (
              <Callout tone="warn" title={t("case.unmapped")}>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {resp.unmapped.map((u) => (
                    <Badge key={u} tone="warn">
                      {u}
                    </Badge>
                  ))}
                </div>
              </Callout>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setResp(null);
                  setError(null);
                }}
              >
                {t("error.retry")}
              </button>
              <button type="button" className="btn-primary" disabled={!resp.crops.length} onClick={apply}>
                {t("case.useCrops")}
                <Ico d={ICONS.arrow} />
              </button>
            </div>
          </>
        )}
      </div>

      {!busy && !resp && !recording && !error && (
        <button type="button" className="btn-ghost mt-4 w-full sm:hidden" onClick={onManual}>
          {t("case.skipToManual")}
        </button>
      )}
    </Card>
  );
}
