"use client";

import { Fragment, useState } from "react";
import type { SofRow } from "@/lib/sof";
import { Badge, cx, inr } from "@/components/ui";
import { useUi } from "@/components/ui-provider";
import { ICONS, Svg } from "./icons";

export const sofKey = (r: SofRow) =>
  `${r.district.trim().toLowerCase()}|${r.crop}|${r.season}`;
const refId = (r: SofRow) => sofKey(r).replace(/[^a-z0-9]+/g, "-");
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const seasonTone = {
  kharif: "success",
  rabi: "info",
  zaid: "accent",
  annual: "neutral",
} as const;

/** Splits a ref string into source URLs and the free-text note. */
function parseRef(text: string) {
  const urls = text.match(/https?:\/\/[^\s,|]+/g) ?? [];
  const note = text
    .replace(/https?:\/\/[^\s,|]+/g, "")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/^[\s|,]+|[\s|,]+$/g, "");
  return { urls, note };
}

export function Rate({ value, strong }: { value?: number; strong?: boolean }) {
  const { t } = useUi();
  if (value == null)
    return (
      <span className="text-[12px] text-muted">{t("sof.notNotified")}</span>
    );
  return (
    <span className={cx("num", strong ? "font-medium text-ink" : "text-ink-2")}>
      {inr(value)}
    </span>
  );
}

export function SeasonBadge({ season }: { season: SofRow["season"] }) {
  const { t } = useUi();
  return <Badge tone={seasonTone[season]}>{t(`season.short.${season}`)}</Badge>;
}

export function SourceBadge({ row }: { row: SofRow }) {
  const { t } = useUi();
  return row.source === "proxy-pmfby" ? (
    <Badge tone="warn" dot>
      {t("sof.badge.proxy")}
    </Badge>
  ) : (
    <Badge tone="success" dot>
      {t("sof.badge.official")}
    </Badge>
  );
}

function RefNote({ text }: { text: string }) {
  const { t } = useUi();
  const { urls, note } = parseRef(text);
  return (
    <div className="space-y-2 text-[13px]">
      {note && <p className="max-w-3xl break-words text-ink-2">{note}</p>}
      {urls.length > 0 && (
        <ul className="flex flex-col gap-1">
          {urls.map((u) => (
            <li key={u} className="min-w-0">
              <a
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 font-medium text-primary hover:underline"
              >
                <Svg d={ICONS.link} className="h-3.5 w-3.5" />
                <span className="truncate">
                  {new URL(u).hostname.replace(/^www\./, "")}
                </span>
                <span className="sr-only">({t("sof.opensNewTab")})</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RefToggle({
  open,
  onClick,
  id,
}: {
  open: boolean;
  onClick: () => void;
  id: string;
}) {
  const { t } = useUi();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={id}
      title={t("sof.showRef")}
      aria-label={t("sof.showRef")}
      className={cx(
        "grid h-10 w-10 cursor-pointer md:h-8 md:w-8 place-items-center rounded-md transition-colors duration-150",
        open
          ? "bg-primary-soft text-primary"
          : "text-muted hover:bg-subtle hover:text-ink",
      )}
    >
      <Svg d={ICONS.info} />
    </button>
  );
}

/** Desktop data table; district shown once per group. */
export function SofTable({ rows }: { rows: SofRow[] }) {
  const { t } = useUi();
  const [open, setOpen] = useState<string | null>(null);
  const th =
    "sticky top-0 z-10 bg-subtle px-4 py-2.5 text-[12px] font-medium tracking-wide text-muted uppercase shadow-[inset_0_-1px_0_var(--saakh-line)]";
  return (
    <table className="w-full text-left text-[14px]">
      <caption className="sr-only">{t("sof.title")}</caption>
      <thead>
        <tr>
          <th scope="col" className={th}>
            {t("sof.district")}
          </th>
          <th scope="col" className={th}>
            {t("sof.crop")}
          </th>
          <th scope="col" className={th}>
            {t("sof.season")}
          </th>
          <th scope="col" className={cx(th, "text-right")}>
            {t("sof.col.current")}
          </th>
          <th scope="col" className={cx(th, "text-right")}>
            {t("sof.col.previous")}
          </th>
          <th scope="col" className={th}>
            {t("sof.source")}
          </th>
          <th scope="col" className={th}>
            {t("sof.scope")}
          </th>
          <th scope="col" className={cx(th, "w-12")}>
            <span className="sr-only">{t("sof.ref")}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const k = sofKey(r);
          const first = i === 0 || rows[i - 1].district !== r.district;
          const id = `ref-${refId(r)}`;
          const isOpen = open === k;
          return (
            <Fragment key={k}>
              <tr
                className={cx(
                  "transition-colors duration-150 hover:bg-subtle/60",
                  i > 0 &&
                    (first
                      ? "border-t border-line-strong"
                      : "border-t border-line"),
                )}
              >
                <td className="px-4 py-3 align-middle font-medium text-ink">
                  {first ? (
                    r.district
                  ) : (
                    <span className="sr-only">{r.district}</span>
                  )}
                </td>
                <th scope="row" className="px-4 py-3 font-normal text-ink">
                  {cap(r.crop)}
                </th>
                <td className="px-4 py-3">
                  <SeasonBadge season={r.season} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Rate value={r.current} strong />
                </td>
                <td className="px-4 py-3 text-right">
                  <Rate value={r.previous} />
                </td>
                <td className="px-4 py-3">
                  <SourceBadge row={r} />
                </td>
                <td className="px-4 py-3 text-[13px] text-ink-2">
                  {t(`sof.scope.${r.scope}`)}
                </td>
                <td className="px-2 py-2">
                  <RefToggle
                    open={isOpen}
                    id={id}
                    onClick={() => setOpen(isOpen ? null : k)}
                  />
                </td>
              </tr>
              {isOpen && (
                <tr id={id} className="bg-subtle">
                  <td colSpan={8} className="border-t border-line px-4 py-3">
                    <div className="eyebrow mb-1.5">{t("sof.ref")}</div>
                    <RefNote text={r.ref} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** Mobile stacked rows grouped by district. */
export function SofList({ rows }: { rows: SofRow[] }) {
  const { t } = useUi();
  const [open, setOpen] = useState<string | null>(null);
  const districts = [...new Set(rows.map((r) => r.district))];
  return (
    <div>
      {districts.map((d) => {
        const group = rows.filter((r) => r.district === d);
        return (
          <section key={d} aria-label={d}>
            <h3 className="flex items-center justify-between border-y border-line bg-subtle px-4 py-2 text-[13px] font-semibold text-ink">
              {d}
              <span className="num text-[12px] font-normal text-muted">
                {t("sof.rowCount", { count: group.length })}
              </span>
            </h3>
            <ul className="divide-y divide-line">
              {group.map((r) => (
                <li key={sofKey(r)} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-ink">
                        {cap(r.crop)}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <SeasonBadge season={r.season} />
                        <SourceBadge row={r} />
                        <span className="text-[12px] text-muted">
                          {t("sof.scopeLine", {
                            scope: t(`sof.scope.${r.scope}`),
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                      <div className="text-right">
                        <div className="text-[15px]">
                          <Rate value={r.current} strong />
                        </div>
                        <div className="mt-0.5 text-[12px] text-muted">
                          {t("sof.prevShort")} <Rate value={r.previous} />
                        </div>
                      </div>
                      <RefToggle
                        open={open === sofKey(r)}
                        id={`m-${refId(r)}`}
                        onClick={() =>
                          setOpen(open === sofKey(r) ? null : sofKey(r))
                        }
                      />
                    </div>
                  </div>
                  {open === sofKey(r) && (
                    <div
                      id={`m-${refId(r)}`}
                      className="mt-2 rounded-lg bg-subtle px-3 py-2.5"
                    >
                      <RefNote text={r.ref} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
