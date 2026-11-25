import type { ReactNode } from "react";
import { inr } from "@/lib/ai-pure";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

export { inr };

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink sm:text-[26px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[14px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, description, actions, children, className, bodyClassName, flush }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; bodyClassName?: string; flush?: boolean }) {
  return (
    <section className={cx("card", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cx(!flush && "px-5 py-4", bodyClassName)}>{children}</div>
    </section>
  );
}

type Tone = "neutral" | "brand" | "success" | "warn" | "danger" | "info" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-subtle text-ink-2 ring-line-strong",
  brand: "bg-primary-soft text-primary ring-primary/20",
  success: "bg-success-soft text-success ring-success/20",
  warn: "bg-warn-soft text-warn ring-warn/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  info: "bg-info-soft text-info ring-info/20",
  accent: "bg-accent-soft text-accent ring-accent/25",
};

export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ring-1 ring-inset", tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** RBI paragraph citation chip, e.g. "13(3)". */
export function Para({ p, className }: { p: string; className?: string }) {
  return (
    <span title={`RBI KCC Directions 2026, para ${p}`} className={cx("inline-flex items-center rounded border border-line-strong bg-subtle px-1.5 py-px font-mono text-[11px] leading-4 text-ink-2", className)}>
      ¶&nbsp;{p}
    </span>
  );
}

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cx("num", className)}>{inr(value)}</span>;
}

export function Stat({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="num mt-1 text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink">{value}</div>
      {hint && <div className="mt-1 text-[12px] text-muted">{hint}</div>}
    </div>
  );
}

const calloutTone: Record<Exclude<Tone, "neutral" | "brand" | "accent">, string> = {
  info: "border-info/20 bg-info-soft text-info",
  warn: "border-warn/20 bg-warn-soft text-warn",
  danger: "border-danger/20 bg-danger-soft text-danger",
  success: "border-success/20 bg-success-soft text-success",
};

export function Callout({ tone = "info", title, children, action, className }: { tone?: keyof typeof calloutTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={cx("flex gap-3 rounded-lg border px-4 py-3 text-[13px]", calloutTone[tone], className)}>
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx("text-ink-2", !!title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg border border-line bg-subtle text-muted">{icon}</div>}
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Key/value row for definition-style lists. */
export function Row({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start justify-between gap-4 py-2.5", className)}>
      <div className="min-w-0 text-[14px] text-ink-2">
        {label}
        {sub && <div className="mt-0.5">{sub}</div>}
      </div>
      <div className="num shrink-0 text-right text-[14px] font-medium text-ink">{value}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}
