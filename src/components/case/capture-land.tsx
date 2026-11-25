"use client";

import { useEffect, useRef, useState } from "react";
import { append } from "@/lib/audit";
import { maskAadhaar, type Case } from "@/lib/store";
import { useUi } from "@/components/ui-provider";
import type { LandEvidence, ReadField } from "@/lib/agent/types";
import { Badge, Card, cx } from "@/components/ui";
import { AiBusy, AiErrorBox, callAi, ConfidenceChip, FollowUps, Ico, ICONS, type AiFail } from "./shared";

type LandFields = { ownerName: string; village: string; surveyNos: string[]; areaHa: number | null; areaUnitSeen?: string; aadhaarLast4?: string | null };
type LandResp = { fields: LandFields; confidence: { areaHa: number; ownerName: number }; followUps: string[]; models: string[]; evidence?: LandEvidence };

const readVal = (v: unknown) => (v == null || v === "" ? "-" : Array.isArray(v) ? v.join(", ") || "-" : String(v));

/** Dual-read indicator: both vision readers agree, or show the two values side by side. */
function AgreeChip({ f }: { f?: ReadField<unknown> }) {
  const { t } = useUi();
  if (!f) return null;
  if (f.agree)
    return (
      <Badge tone="success">
        <Ico d={ICONS.check} className="h-3 w-3" />
        {t("land.agree")}
      </Badge>
    );
  const text = t("land.disagree", { a: readVal(f.reads[0]?.value), b: readVal(f.reads[1]?.value) });
  return (
    <Badge tone="warn" className="max-w-[16rem]">
      <Ico d={ICONS.alert} className="h-3 w-3 shrink-0" />
      <span className="truncate" title={f.reads.map((r) => `${r.source}: ${readVal(r.value)}`).join("\n")}>
        {text}
      </span>
    </Badge>
  );
}
export type CasePatch = Partial<Omit<Case, "id" | "createdAt" | "status" | "result" | "decision">>;

const SAMPLES = Array.from({ length: 10 }, (_, i) => `/samples/khasra-${i + 1}.jpg`);
const MAX_PX = 1600;

/** Downscales to <= 1600px JPEG so uploads stay under the 4.5 MB body limit. */
async function downscale(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
    if (!out) throw new Error("encode failed");
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CaptureLand({ c, actor, onApply, onManual }: { c: Case; actor: string; onApply: (p: CasePatch) => void; onManual: () => void }) {
  const { t, lang, mode } = useUi();
  const [preview, setPreview] = useState<string>("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiFail | null>(null);
  const [resp, setResp] = useState<LandResp | null>(null);
  const [form, setForm] = useState({ ownerName: "", village: "", surveyNos: "", areaHa: "", aadhaar: "" });
  const [formErr, setFormErr] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const runId = useRef(0);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const extract = async (img: Blob) => {
    const id = ++runId.current;
    setBusy(true);
    setError(null);
    setResp(null);
    const fd = new FormData();
    fd.append("image", img, "land.jpg");
    fd.append("district", c.district);
    fd.append("officerLang", c.officerLang ?? lang);
    const r = await callAi<LandResp>("land", fd, c.id, actor);
    if (id !== runId.current) return;
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const f = r.data.fields;
    setResp(r.data);
    setForm({
      ownerName: f.ownerName ?? "",
      village: f.village ?? "",
      surveyNos: (f.surveyNos ?? []).join(", "),
      areaHa: f.areaHa == null ? "" : String(Math.round(f.areaHa * 10000) / 10000),
      aadhaar: f.aadhaarLast4 ?? "",
    });
    append({
      caseId: c.id,
      type: "extracted",
      actor,
      data: { kind: "land", fields: { ...f, aadhaarLast4: f.aadhaarLast4 ?? undefined }, confidence: r.data.confidence, followUps: r.data.followUps?.length ?? 0 },
    }).catch(() => {});
  };

  const pick = async (file: Blob | undefined | null) => {
    if (!file) return;
    setError(null);
    try {
      const small = await downscale(file);
      setPreview(URL.createObjectURL(small));
      setBlob(small);
      extract(small);
    } catch {
      setError({ kind: "input", message: t("error.unreadablePhoto") });
    }
  };

  const loadSample = async (src: string) => {
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      pick(await res.blob());
    } catch {
      setError({ kind: "provider", message: "sample" });
    }
  };

  const cancel = () => {
    runId.current++;
    setBusy(false);
  };

  const confirm = () => {
    const errs: Record<string, string> = {};
    const area = Number(form.areaHa);
    if (!(area > 0)) errs.areaHa = t("case.landRequired");
    let a4: string | undefined;
    if (form.aadhaar.trim()) {
      try {
        a4 = maskAadhaar(form.aadhaar);
      } catch {
        errs.aadhaar = t("new.aadhaarInvalid");
      }
    }
    setFormErr(errs);
    if (Object.keys(errs).length) return;
    onApply({
      landHa: area,
      farmer: {
        ...c.farmer,
        name: c.farmer.name || form.ownerName.trim(),
        village: form.village.trim() || c.farmer.village,
        surveyNos: form.surveyNos.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
        aadhaarLast4: a4,
      },
      extracted: { ...c.extracted, land: resp?.fields ? { ...resp.fields, aadhaarLast4: a4, evidence: resp.evidence } : undefined },
    });
  };

  const field = (k: keyof typeof form, label: string, opts: { conf?: number; read?: ReadField<unknown>; inputMode?: "decimal" | "numeric"; required?: boolean; suffix?: string; hint?: string; wide?: boolean } = {}) => (
    <div className={cx(opts.wide && "sm:col-span-2")}>
      <div className="mb-1.5 flex min-h-5 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <label htmlFor={`land-${k}`} className="text-[13px] font-medium text-ink-2">
          {label}
          {opts.required && <span className="ml-0.5 text-danger">*</span>}
        </label>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <AgreeChip f={opts.read} />
          <ConfidenceChip value={opts.conf} />
        </span>
      </div>
      <div className="relative">
        <input
          id={`land-${k}`}
          className={cx("field", opts.suffix && "num pr-10 text-right", formErr[k] && "border-danger focus:border-danger focus:ring-danger/10")}
          inputMode={opts.inputMode}
          value={form[k]}
          aria-invalid={!!formErr[k]}
          aria-describedby={formErr[k] ? `land-${k}-err` : undefined}
          onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
        />
        {opts.suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-muted">{opts.suffix}</span>}
      </div>
      {opts.hint && !formErr[k] && <p className="mt-1 text-[12px] text-muted">{opts.hint}</p>}
      {formErr[k] && (
        <p id={`land-${k}-err`} className="mt-1 text-[12px] font-medium text-danger">
          {formErr[k]}
        </p>
      )}
    </div>
  );

  const unitHint = resp?.fields.areaUnitSeen && resp.fields.areaUnitSeen !== "hectare" ? t("case.unitSeen", { unit: resp.fields.areaUnitSeen }) : undefined;
  const empty = !preview && !busy;
  const ev = resp?.evidence;

  return (
    <Card
      title={t("case.step.land")}
      description={t("case.landHint")}
      actions={
        !resp && (
          <button type="button" className="hidden h-8 rounded-md px-2 text-[13px] font-medium text-primary hover:bg-primary-soft sm:inline-flex sm:items-center" onClick={onManual}>
            {t("error.manual")}
          </button>
        )
      }
    >
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={galRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />

      {empty ? (
        <div className="space-y-5">
          {error && <AiErrorBox error={error} fallbackKey="error.unreadablePhoto" onManual={onManual} />}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={cx("flex flex-col items-center rounded-lg border border-dashed px-5 py-8 text-center transition-colors sm:py-10", dragging ? "border-primary bg-primary-soft" : "border-line-strong bg-subtle")}
          >
            <span className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-surface text-ink-2 shadow-card">
              <Ico d={ICONS.file} className="h-5 w-5" />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-ink">{t("case.dropTitle")}</p>
            <p className="mt-1 max-w-sm text-[13px] text-muted">{t("case.dropHint")}</p>
            <div className="mt-5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button type="button" className="btn-primary" onClick={() => camRef.current?.click()}>
                <Ico d={ICONS.camera} />
                {t("case.takePhoto")}
              </button>
              <button type="button" className="btn-ghost" onClick={() => galRef.current?.click()}>
                <Ico d={ICONS.upload} />
                {t("case.upload")}
              </button>
            </div>
          </div>

          {mode === "demo" && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="eyebrow">{t("case.samplesFictional")}</span>
              <span className="num text-[12px] text-muted">{SAMPLES.length}</span>
            </div>
            <ul className="grid grid-cols-5 gap-2 sm:grid-cols-10" aria-label={t("case.samplesFictional")}>
              {SAMPLES.map((s, i) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => loadSample(s)}
                    className="group block w-full overflow-hidden rounded-md border border-line bg-surface shadow-card transition-colors hover:border-primary"
                    aria-label={`${t("case.sample")} ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- static sample thumbnails */}
                    <img src={s} alt="" className="aspect-[3/4] w-full bg-subtle object-cover" loading="lazy" />
                    <span className="num block border-t border-line py-1 text-center text-[11px] font-medium text-muted group-hover:text-primary">{String(i + 1).padStart(2, "0")}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-muted">{t("demo.landSampleHint")}</p>
          </div>
          )}

          <button type="button" className="btn-ghost w-full sm:hidden" onClick={onManual}>
            {t("case.skipToManual")}
          </button>
        </div>
      ) : (
        <div className={cx("grid gap-5", preview && "md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]")}>
          {preview && (
            <figure className="min-w-0">
              <div className="overflow-hidden rounded-lg border border-line bg-subtle">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img src={preview} alt={t("case.photoAlt")} className={cx("max-h-[300px] w-full object-contain md:max-h-[440px]", busy && "opacity-60")} />
              </div>
              <figcaption className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[12px] text-muted">{t("case.uploadedRecord")}</span>
                {!busy && (
                  <span className="flex gap-1">
                    <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-2 hover:bg-subtle" onClick={() => camRef.current?.click()}>
                      <Ico d={ICONS.camera} className="h-3.5 w-3.5" />
                      {t("case.retakePhoto")}
                    </button>
                    <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-2 hover:bg-subtle" onClick={() => galRef.current?.click()}>
                      <Ico d={ICONS.upload} className="h-3.5 w-3.5" />
                      {t("case.upload")}
                    </button>
                  </span>
                )}
              </figcaption>
            </figure>
          )}

          <div className="min-w-0 space-y-4">
            {busy && <AiBusy label={t("case.extracting")} onCancel={cancel} steps={[t("case.stepReading"), t("case.stepStructuring")]} />}
            {error && <AiErrorBox error={error} fallbackKey="error.unreadablePhoto" onRetry={blob ? () => extract(blob) : undefined} onManual={onManual} />}
            {resp && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[14px] font-semibold text-ink">{t("case.extractedFields")}</h3>
                </div>
                <p className="-mt-3 text-[13px] text-muted">{t("case.extracted")}</p>
                <FollowUps items={resp.followUps} />
                <div className="grid items-end gap-4 sm:grid-cols-2">
                  {field("areaHa", t("case.landHa"), { conf: resp.confidence.areaHa, read: ev?.areaHa, inputMode: "decimal", required: true, suffix: "ha", hint: unitHint, wide: true })}
                  {field("ownerName", t("case.ownerName"), { conf: resp.confidence.ownerName, read: ev?.ownerName, wide: true })}
                  {field("village", t("new.village"), { read: ev?.village })}
                  {field("surveyNos", t("case.surveyNos"), { read: ev?.surveyNos })}
                  {field("aadhaar", t("new.aadhaar"), { read: ev?.aadhaarLast4, inputMode: "numeric", wide: true })}
                </div>
                <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
                  <button type="button" className="btn-ghost" onClick={onManual}>
                    {t("error.manual")}
                  </button>
                  <button type="button" className="btn-primary" onClick={confirm}>
                    {t("case.useDetails")}
                    <Ico d={ICONS.arrow} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
