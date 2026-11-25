"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { LANGUAGES, isLangCode, type LangCode } from "@/lib/i18n";
import type { AppMode } from "@/lib/store";
import { InstallButton } from "./install";
import { Badge, Callout, cx } from "./ui";
import { useUi } from "./ui-provider";

const NAV = [
  { href: "/", key: "nav.cases", icon: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" },
  { href: "/sof", key: "nav.sof", icon: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M3 15h18M9 9v12" },
  { href: "/validate", key: "nav.validate", icon: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4" },
] as const;

export function Icon({ d, className = "h-6 w-6" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function LanguageSelect({ id, value, onChange }: { id: string; value: LangCode; onChange: (l: LangCode) => void }) {
  const opt = (l: (typeof LANGUAGES)[number]) => (
    <option key={l.code} value={l.code}>
      {l.name === l.english ? l.name : `${l.name} (${l.english})`}
    </option>
  );
  return (
    <select id={id} className="field" value={value} onChange={(e) => isLangCode(e.target.value) && onChange(e.target.value)}>
      <optgroup label="Core">{LANGUAGES.filter((l) => l.core).map(opt)}</optgroup>
      <optgroup label="More">{LANGUAGES.filter((l) => !l.core).map(opt)}</optgroup>
    </select>
  );
}

/** Right-side drawer on desktop, full-screen sheet on mobile; native dialog gives focus trap and Escape. */
export function Drawer({ title, description, onClose, children }: { title: ReactNode; description?: ReactNode; onClose: () => void; children: ReactNode }) {
  const { t } = useUi();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-none bg-surface p-0 text-ink shadow-pop backdrop:bg-ink/40 sm:max-w-[460px] sm:border-l sm:border-line"
    >
      <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="-mr-2 grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink">
            <Icon d="M18 6 6 18M6 6l12 12" className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Layout for a form inside Drawer: scrolling body plus a pinned footer. */
export const drawerBody = "flex-1 space-y-5 overflow-y-auto px-5 py-5";
export const drawerFooter = "flex justify-end gap-2 border-t border-line bg-subtle px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))]";

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

function OfflineBanner() {
  const { t } = useUi();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="px-4 pt-4 lg:px-8">
      <Callout tone="warn" title={t("offline.banner")} className="mx-auto max-w-[1200px]">
        {t("offline.aiUnavailable")}
      </Callout>
    </div>
  );
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-full bg-primary font-semibold text-on-primary", className)}>
      {initials(name)}
    </span>
  );
}

function Brand({ size = 28 }: { size?: number }) {
  const { t } = useUi();
  return (
    <span className="flex items-center gap-2.5">
      <Image src="/icons/icon.svg" alt="" width={size} height={size} unoptimized className="rounded-md" />
      <span className="flex flex-col leading-none">
        <span className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{t("app.name")}</span>
        <span className="mt-1 text-[11px] font-medium text-muted">{t("app.caption")}</span>
      </span>
    </span>
  );
}

const MODES: { value: AppMode; icon: string }[] = [
  { value: "demo", icon: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM10 8l6 4-6 4z" },
  { value: "real", icon: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" },
];

function ModeChoice({ value, onChange, error }: { value: AppMode | null; onChange: (m: AppMode) => void; error?: string }) {
  const { t } = useUi();
  return (
    <fieldset aria-describedby={error ? "mode-error" : undefined}>
      <legend className="label">
        {t("mode.choose")} <span className="text-danger">*</span>
      </legend>
      <div className="grid gap-2.5">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={cx(
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
              value === m.value ? "border-primary bg-primary-soft" : error ? "border-danger" : "border-line-strong hover:bg-subtle",
            )}
          >
            <input type="radio" name="app-mode" value={m.value} checked={value === m.value} onChange={() => onChange(m.value)} className="sr-only" />
            <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", value === m.value ? "bg-primary text-on-primary" : "bg-subtle text-ink-2")}>
              <Icon d={m.icon} className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-ink">{t(`mode.${m.value}.title`)}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t(`mode.${m.value}.body`)}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id="mode-error" className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function ProfileForm({ onDone, onCancel, inDrawer, withMode }: { onDone?: () => void; onCancel?: () => void; inDrawer?: boolean; withMode?: boolean }) {
  const { t, lang, profile, setProfile, mode: savedMode, setMode } = useUi();
  const [mode, setModeChoice] = useState<AppMode | null>(savedMode);
  const [modeErr, setModeErr] = useState("");
  const [name, setName] = useState(profile?.name ?? "");
  const [institution, setInstitution] = useState(profile?.institution ?? "");
  const [uiLang, setUiLang] = useState<LangCode>(profile?.uiLang ?? lang);
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim().length;
    const badName = n < 2 || n > 60;
    setError(badName ? t("officer.nameInvalid") : "");
    setModeErr(withMode && !mode ? t("mode.required") : "");
    if (badName || (withMode && !mode)) return;
    try {
      setProfile({ name, institution, uiLang });
      if (withMode && mode) setMode(mode);
      onDone?.();
    } catch {
      setError(t("error.storage"));
    }
  };

  const fields = (
    <>
      <div>
        <label htmlFor="officer-name" className="label">
          {t("officer.name")} <span className="text-danger">*</span>
        </label>
        <input
          id="officer-name"
          className={cx("field", error && "border-danger")}
          value={name}
          maxLength={60}
          autoComplete="name"
          aria-invalid={!!error}
          aria-describedby={error ? "officer-name-error" : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
        />
        {error && (
          <p id="officer-name-error" className="mt-1.5 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="officer-inst" className="label">
          {t("officer.institution")} <span className="font-normal text-muted">({t("common.optional")})</span>
        </label>
        <input id="officer-inst" className="field" value={institution} maxLength={80} autoComplete="organization" onChange={(e) => setInstitution(e.target.value)} />
      </div>
      <div>
        <label htmlFor="officer-lang" className="label">
          {t("lang.ui")}
        </label>
        <LanguageSelect id="officer-lang" value={uiLang} onChange={setUiLang} />
      </div>
      {withMode && (
        <ModeChoice
          value={mode}
          error={modeErr}
          onChange={(m) => {
            setModeChoice(m);
            setModeErr("");
          }}
        />
      )}
    </>
  );

  return inDrawer ? (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className={drawerBody}>{fields}</div>
      <div className={drawerFooter}>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary">
          {t("officer.save")}
        </button>
      </div>
    </form>
  ) : (
    <form onSubmit={submit} noValidate className="space-y-5">
      {fields}
      <button type="submit" className="btn-primary btn-lg w-full">
        {t("officer.save")}
      </button>
    </form>
  );
}

function SetupScreen() {
  const { t, lang, setLang } = useUi();
  return (
    <div className="flex min-h-dvh flex-col px-4 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between">
        <Brand />
        <button type="button" className="btn-ghost h-9 px-3 text-[13px]" onClick={() => setLang(lang === "hi-IN" ? "en-IN" : "hi-IN")}>
          {lang === "hi-IN" ? "English" : "हिन्दी"}
        </button>
      </div>
      <div className="flex flex-1 items-start justify-center py-8 sm:items-center">
        <div className="w-full max-w-[420px]">
          <div className="card p-6 sm:p-8">
            <div className="eyebrow mb-2">{t("app.caption")}</div>
            <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink">{t("setup.title")}</h1>
            <p className="mt-2 text-[14px] text-muted">{t("setup.subtitle")}</p>
            <div className="my-6 border-t border-line" />
            <ProfileForm key={lang} withMode />
          </div>
          <p className="mt-5 text-center text-[12px] text-muted">{t("shell.footnote")}</p>
        </div>
      </div>
    </div>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  const { t, mode } = useUi();
  if (mode !== "demo") return null;
  return (
    <Badge tone="accent" dot className={className}>
      {t("mode.badge")}
    </Badge>
  );
}

/** Switches demo/real after a confirm; cases of the other mode are hidden, never deleted. */
function ModeRow({ onSwitched }: { onSwitched?: () => void }) {
  const { t, mode, setMode } = useUi();
  const router = useRouter();
  const next: AppMode = mode === "demo" ? "real" : "demo";
  const run = () => {
    if (!confirm(t(next === "demo" ? "mode.confirmDemo" : "mode.confirmReal"))) return;
    setMode(next);
    router.push("/");
    onSwitched?.();
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-subtle py-1.5 pr-1.5 pl-3">
      <div className="min-w-0">
        <div className="text-[11px] font-medium tracking-wide text-muted uppercase">{t("mode.current")}</div>
        <div className="truncate text-[13px] font-semibold text-ink">{t(`mode.${mode ?? "real"}.title`)}</div>
      </div>
      <button type="button" className="btn-ghost h-11 shrink-0 bg-surface px-3 text-[13px]" onClick={run}>
        {t(next === "demo" ? "mode.switchToDemo" : "mode.switchToReal")}
      </button>
    </div>
  );
}

function ProfileDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useUi();
  return (
    <Drawer title={t("shell.editProfile")} description={t("setup.subtitle")} onClose={onClose}>
      <div className="space-y-3 border-b border-line px-5 py-4">
        <ModeRow onSwitched={onClose} />
        <InstallButton variant="nav" />
      </div>
      <ProfileForm inDrawer onDone={onClose} onCancel={onClose} />
    </Drawer>
  );
}

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" || path.startsWith("/case") : path.startsWith(href));
}

function Sidebar({ onEdit }: { onEdit: () => void }) {
  const { t, lang, setLang, profile } = useUi();
  const isActive = useActive();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
        <Link href="/" className="rounded-md">
          <Brand />
        </Link>
        <DemoBadge />
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5 px-3 pt-3">
        {NAV.map((n) => {
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors",
                active ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-subtle hover:text-ink",
              )}
            >
              <Icon d={n.icon} className={cx("h-[18px] w-[18px]", !active && "text-muted")} />
              {t(n.key)}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-3 pb-2">
        <InstallButton variant="nav" />
      </div>
      <div className="px-5 pb-3 text-[11px] leading-snug text-muted">{t("shell.footnote")}</div>
      {profile && (
        <div className="space-y-2 border-t border-line p-3">
          <ModeRow />
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar name={profile.name} className="h-9 w-9 text-[13px]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-ink">{profile.name}</div>
              <div className="truncate text-[12px] text-muted">{profile.institution || t("officer.label")}</div>
            </div>
            <button type="button" onClick={onEdit} aria-label={t("shell.editProfile")} title={t("shell.editProfile")} className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink">
              <Icon d="M12 20h9M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.85.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.85z" className="h-4 w-4" />
            </button>
          </div>
          <label htmlFor="sidebar-lang" className="sr-only">
            {t("lang.ui")}
          </label>
          <div className="mt-1 px-2 [&_select]:h-9 [&_select]:text-[13px]">
            <LanguageSelect id="sidebar-lang" value={lang} onChange={setLang} />
          </div>
        </div>
      )}
    </aside>
  );
}

function TopBar({ onEdit }: { onEdit: () => void }) {
  const { t, profile } = useUi();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface pt-[env(safe-area-inset-top)] lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/" aria-label={t("app.name")}>
          <Brand size={26} />
        </Link>
        <DemoBadge className="mr-auto ml-3" />
        {profile && (
          <button type="button" onClick={onEdit} aria-label={`${t("shell.editProfile")}: ${profile.name}`} className="-mr-1 grid h-11 w-11 cursor-pointer place-items-center rounded-full">
            <Avatar name={profile.name} className="h-8 w-8 text-[12px]" />
          </button>
        )}
      </div>
    </header>
  );
}

function TabBar() {
  const { t } = useUi();
  const isActive = useActive();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {NAV.map((n) => {
        const active = isActive(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cx("flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "text-primary" : "text-muted")}
          >
            <Icon d={n.icon} className="h-5 w-5" />
            <span className="max-w-full truncate px-1">{t(n.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { t, ready, profile, mode } = useUi();
  const [editing, setEditing] = useState(false);
  const setUp = !!profile && !!mode;
  // Chrome shows while loading too, so returning officers see no layout jump.
  const chrome = !ready || setUp;

  return (
    <>
      {chrome && <Sidebar onEdit={() => setEditing(true)} />}
      {chrome && <TopBar onEdit={() => setEditing(true)} />}
      <main className={cx("flex flex-1 flex-col", chrome && "pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-[248px]")}>
        {chrome && <OfflineBanner />}
        {!ready && (
          <p className="sr-only" role="status">
            {t("common.loading")}
          </p>
        )}
        {ready && !setUp && <SetupScreen />}
        {/* Always rendered so Next can validate the segment; hidden until an officer and mode are set. */}
        <div hidden={!ready || !setUp}>{children}</div>
      </main>
      {chrome && <TabBar />}
      {editing && <ProfileDrawer onClose={() => setEditing(false)} />}
    </>
  );
}
