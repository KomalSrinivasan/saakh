import { cx } from "@/components/ui";

// Lucide-style path data, stroke 1.75.
export const ICONS = {
  upload: "M12 15V3m0 0L7 8m5-5 5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
  download: "M12 3v12m0 0-5-5m5 5 5-5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
  x: "M18 6 6 18M6 6l12 12",
  link: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  chevron: "m6 9 6 6 6-6",
  check: "M20 6 9 17l-5-5",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  play: "M6 4l14 8-14 8V4z",
  rotate: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
} as const;

export function Svg({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={cx("h-4 w-4 shrink-0", className)} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Single-select segmented filter; scrolls horizontally on narrow screens. */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex rounded-lg border border-line-strong bg-subtle p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              "h-10 cursor-pointer rounded-md px-3 sm:h-8 text-[13px] font-medium whitespace-nowrap transition-colors duration-150",
              value === o.value ? "bg-surface text-ink shadow-card ring-1 ring-line-strong" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
