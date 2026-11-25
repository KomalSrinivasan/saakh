"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Icon } from "./shell";
import { useUi } from "./ui-provider";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type State = "hidden" | "prompt" | "ios";

// Module scope so the event is caught even if it fires before any button mounts.
let deferred: InstallPrompt | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

const subscribe = (cb: () => void) => {
  subs.add(cb);
  const mq = matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => {
    subs.delete(cb);
    mq.removeEventListener("change", cb);
  };
};
const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const snapshot = (): State => (installed || standalone() ? "hidden" : deferred ? "prompt" : ios() ? "ios" : "hidden");

const DOWNLOAD = "M12 15V3M7 10l5 5 5-5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4";
const SHARE = "M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7";

/** Install entry point: native prompt on Chromium, Add to Home Screen hint on iOS, nothing when installed. */
export function InstallButton({ variant }: { variant: "nav" | "card" }) {
  const { t } = useUi();
  const state = useSyncExternalStore(subscribe, snapshot, () => "hidden" as State);
  const [hint, setHint] = useState(false);
  const hintId = useId();
  if (state === "hidden") return null;

  const onClick = async () => {
    if (state === "ios") return setHint((h) => !h);
    const p = deferred;
    if (!p) return;
    await p.prompt();
    const { outcome } = await p.userChoice;
    deferred = null;
    if (outcome === "accepted") installed = true;
    emit();
  };

  const tip = hint && (
    <p id={hintId} role="note" className="mt-2 flex items-start gap-2 rounded-lg border border-line bg-subtle px-3 py-2.5 text-[13px] leading-snug text-ink-2">
      <Icon d={SHARE} className="mt-px h-4 w-4 shrink-0 text-primary" />
      {t("install.iosHint")}
    </p>
  );

  if (variant === "nav")
    return (
      <div>
        <button
          type="button"
          onClick={onClick}
          aria-expanded={state === "ios" ? hint : undefined}
          aria-controls={state === "ios" ? hintId : undefined}
          className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-[14px] font-medium text-primary transition-colors hover:bg-primary-soft"
        >
          <Icon d={DOWNLOAD} className="h-[18px] w-[18px]" />
          {t("install.cta")}
        </button>
        {tip}
      </div>
    );

  return (
    <section aria-label={t("install.cta")} className="card mb-6 px-4 py-3.5 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Icon d={DOWNLOAD} className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-ink">{t("install.title")}</h2>
            <p className="text-[13px] text-muted">{t("install.body")}</p>
          </div>
        </div>
        <button type="button" onClick={onClick} aria-expanded={state === "ios" ? hint : undefined} aria-controls={state === "ios" ? hintId : undefined} className="btn-primary w-full shrink-0 sm:w-auto">
          {t("install.cta")}
        </button>
      </div>
      {tip}
    </section>
  );
}
