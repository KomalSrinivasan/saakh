"use client";

import { useEffect, useRef, useState } from "react";
import { CSV_COLUMNS, loadUploaded, parseSofCsv, saveUploaded, type CsvError, type SofRow } from "@/lib/sof";
import { Badge, Callout, cx } from "@/components/ui";
import { useUi } from "@/components/ui-provider";
import { ICONS, Svg } from "./icons";
import { cap, Rate, sofKey } from "./sof-table";

const MAX_BYTES = 1024 * 1024;
type Pending = { name: string; size: number; rows: SofRow[]; errors: CsvError[] };

/** Danger ghost with an inline two-step confirm. */
export function ResetButton({ count, onDone }: { count: number; onDone: (msg: string, ok: boolean) => void }) {
  const { t } = useUi();
  const [confirming, setConfirming] = useState(false);
  if (!count) return null;
  const reset = () => {
    try {
      saveUploaded([]);
      onDone(t("sof.resetDone"), true);
    } catch {
      onDone(t("error.storage"), false);
    }
    setConfirming(false);
  };
  return confirming ? (
    <div role="group" aria-label={t("sof.reset")} className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-danger">{t("sof.resetAsk", { count })}</span>
      <button type="button" className="btn-ghost h-9" onClick={() => setConfirming(false)}>{t("common.cancel")}</button>
      <button type="button" className="btn-danger h-9" onClick={reset} autoFocus>{t("sof.resetYes")}</button>
    </div>
  ) : (
    <button type="button" className="btn-danger" onClick={() => setConfirming(true)}>
      <Svg d={ICONS.rotate} />
      {t("sof.reset")}
    </button>
  );
}

export function UploadDrawer({ open, onClose, uploaded, onChanged }: { open: boolean; onClose: () => void; uploaded: number; onChanged: (msg: string, ok: boolean) => void }) {
  const { t } = useUi();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    setPending(null);
    setError("");
    onClose();
  };

  const pick = async (file?: File) => {
    setError("");
    setPending(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setError(t("sof.tooLarge"));
    try {
      setPending({ name: file.name, size: file.size, ...parseSofCsv(await file.text()) });
    } catch {
      setError(t("sof.readError"));
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const save = () => {
    if (!pending?.rows.length) return;
    const incoming = new Set(pending.rows.map(sofKey));
    try {
      saveUploaded([...loadUploaded().filter((r) => !incoming.has(sofKey(r))), ...pending.rows]);
      onChanged(t("sof.uploaded", { count: pending.rows.length }), true);
      close();
    } catch {
      setError(t("error.storage"));
    }
  };

  const th = "sticky top-0 bg-subtle px-3 py-2 text-[11px] whitespace-nowrap font-medium tracking-wide text-muted uppercase shadow-[inset_0_-1px_0_var(--saakh-line)]";

  return (
    <dialog
      ref={dialog}
      onClose={close}
      onClick={(e) => e.target === dialog.current && close()}
      aria-labelledby="sof-upload-title"
      className="fixed inset-0 m-0 ml-auto h-dvh max-h-none w-full max-w-none bg-surface p-0 text-ink shadow-pop backdrop:bg-ink/40 sm:max-w-[600px] sm:border-l sm:border-line"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="eyebrow mb-1">{t("sof.eyebrow")}</div>
            <h2 id="sof-upload-title" className="text-[17px] font-semibold text-ink">{t("sof.uploadTitle")}</h2>
            <p className="mt-0.5 text-[13px] text-muted">{t("sof.uploadDesc")}</p>
          </div>
          <button type="button" onClick={close} aria-label={t("common.close")} className="-mr-2 grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink">
            <Svg d={ICONS.x} className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <label
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
            className={cx(
              "flex cursor-pointer flex-col items-center rounded-xl border border-dashed px-6 py-7 text-center transition-colors duration-150 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10",
              dragging ? "border-primary bg-primary-soft" : "border-line-strong bg-subtle hover:border-muted/60",
            )}
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-ink-2 shadow-card">
              <Svg d={ICONS.upload} className="h-5 w-5" />
            </span>
            <span className="mt-3 text-[14px] font-medium text-ink">
              {t("sof.dropTitle")} <span className="text-primary underline underline-offset-2">{t("sof.browse")}</span>
            </span>
            <span className="mt-1 text-[12px] text-muted">{t("sof.dropHint")}</span>
            <code className="mt-3 rounded-md border border-line bg-surface px-2 py-1 font-mono text-[11px] text-ink-2">{CSV_COLUMNS.join(",")}</code>
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>

          {error && <Callout tone="danger">{error}</Callout>}

          {pending && (
            <div className="space-y-4" aria-live="polite">
              <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
                <Svg d={ICONS.file} className="h-5 w-5 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-ink">{pending.name}</div>
                  <div className="num text-[12px] text-muted">{(pending.size / 1024).toFixed(1)} KB</div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <Badge tone={pending.rows.length ? "success" : "neutral"}>{t("sof.countValid", { count: pending.rows.length })}</Badge>
                  {pending.errors.length > 0 && <Badge tone="danger">{t("sof.countErrors", { count: pending.errors.length })}</Badge>}
                </div>
              </div>

              {pending.errors.length > 0 && (
                <section role="alert" className="overflow-hidden rounded-lg border border-danger/25">
                  <h3 className="flex items-center gap-2 border-b border-danger/20 bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">
                    <Svg d={ICONS.alert} />
                    {pending.rows.length ? t("sof.skippedRows", { count: pending.errors.length }) : t("sof.noValidRows")}
                  </h3>
                  <ul className="max-h-48 divide-y divide-line overflow-y-auto">
                    {pending.errors.map((e) => (
                      <li key={e.line} className="flex gap-3 px-3 py-2 text-[13px]">
                        <span className="num w-14 shrink-0 font-mono text-[12px] text-danger">{t("sof.line", { n: e.line })}</span>
                        <span className="min-w-0 break-words text-ink-2">{e.message}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {pending.rows.length > 0 && (
                <section>
                  <h3 className="eyebrow mb-2">{t("sof.preview")}</h3>
                  <div className="max-h-72 overflow-auto rounded-lg border border-line">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr>
                          <th scope="col" className={th}>{t("sof.district")}</th>
                          <th scope="col" className={th}>{t("sof.crop")}</th>
                          <th scope="col" className={cx(th, "hidden sm:table-cell")}>{t("sof.season")}</th>
                          <th scope="col" className={cx(th, "text-right")}>{t("sof.col.current")}</th>
                          <th scope="col" className={cx(th, "text-right")}>{t("sof.col.previous")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pending.rows.map((r) => (
                          <tr key={sofKey(r)} className="border-t border-line first:border-0">
                            <td className="px-3 py-2 text-ink">{r.district}</td>
                            <td className="px-3 py-2 text-ink">{cap(r.crop)}<span className="text-[12px] text-muted sm:hidden"> · {t(`season.short.${r.season}`)}</span></td>
                            <td className="hidden px-3 py-2 text-ink-2 sm:table-cell">{t(`season.short.${r.season}`)}</td>
                            <td className="px-3 py-2 text-right"><Rate value={r.current} strong /></td>
                            <td className="px-3 py-2 text-right"><Rate value={r.previous} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )}

          <ul className="space-y-1.5 text-[12px] text-muted">
            <li className="flex gap-2"><Svg d={ICONS.info} className="mt-px h-3.5 w-3.5" />{t("sof.replaces")}</li>
            <li className="flex gap-2"><Svg d={ICONS.info} className="mt-px h-3.5 w-3.5" />{t("sof.frozen")}</li>
          </ul>
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-line bg-subtle px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between">
          <ResetButton count={uploaded} onDone={(m, ok) => { onChanged(m, ok); if (ok) close(); }} />
          <div className="flex gap-2 sm:ml-auto">
            <button type="button" className="btn-ghost flex-1 sm:flex-none" onClick={close}>{t("common.cancel")}</button>
            <button type="button" className="btn-primary flex-1 sm:flex-none" disabled={!pending?.rows.length} onClick={save}>
              {t("sof.saveRows", { count: pending?.rows.length ?? 0 })}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
