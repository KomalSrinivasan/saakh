// Scale of Finance table: bundled MP proxy rows plus bank-uploaded official rows.
import type { Season, SofEntry } from "./kcc.ts";
import defaultJson from "../data/sof-mp.json" with { type: "json" };

export type SofSource = "official" | "proxy-pmfby";
export type SofScope = "district" | "state";

export interface SofRow {
  district: string;
  crop: string;
  aliases?: string[];
  season: Season;
  current?: number;
  previous?: number;
  source: SofSource;
  scope: SofScope;
  ref: string;
}

export type SofSnapshotEntry = SofEntry & { source: SofSource; scope: SofScope; ref: string };
export type SofStore = Pick<Storage, "getItem" | "setItem">;
export interface CsvError {
  line: number;
  message: string;
}

export const UPLOAD_KEY = "saakh.sof.uploaded";
export const CSV_COLUMNS = ["district", "crop", "season", "current", "previous", "ref"] as const;
const SEASONS: Season[] = ["kharif", "rabi", "zaid", "annual"];

export const DEFAULT_SOF = defaultJson as SofRow[];

const browserStore = (): SofStore | undefined => (typeof localStorage === "undefined" ? undefined : localStorage);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
const rowKey = (r: SofRow) => `${norm(r.district)}|${norm(r.crop)}|${r.season}`;

const ALIASES = new Map<string, string>();
for (const r of DEFAULT_SOF) for (const a of [r.crop, ...(r.aliases ?? [])]) ALIASES.set(norm(a), r.crop);

/** Spoken or written crop name (any script) to SoF crop key, e.g. "chana" -> "gram". */
export function lookupCrop(spoken: string): string | undefined {
  return ALIASES.get(norm(spoken));
}

export function loadUploaded(store = browserStore()): SofRow[] {
  try {
    const rows = JSON.parse(store?.getItem(UPLOAD_KEY) ?? "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function saveUploaded(rows: SofRow[], store = browserStore()): void {
  store?.setItem(UPLOAD_KEY, JSON.stringify(rows));
}

/** Merged table: uploaded rows replace defaults with the same district+crop+season. */
export function sofTable(store = browserStore()): SofRow[] {
  const merged = new Map<string, SofRow>();
  for (const r of [...DEFAULT_SOF, ...loadUploaded(store)]) merged.set(rowKey(r), r);
  return [...merged.values()];
}

const rowsFor = (district: string, store?: SofStore) => sofTable(store).filter((r) => norm(r.district) === norm(district));

/** Engine input for computeKcc; missing current is left out so the engine applies previous +10% (13(3)). */
export function toEngineSof(district: string, store = browserStore()): Record<string, SofEntry> {
  return Object.fromEntries(Object.entries(sofSnapshot(district, store)).map(([k, { current, previous }]) => [k, entry(current, previous)]));
}

/** Frozen per-case copy with provenance; same crop in two seasons keeps the later (uploaded) row. */
export function sofSnapshot(district: string, store = browserStore()): Record<string, SofSnapshotEntry> {
  return Object.fromEntries(
    rowsFor(district, store).map((r) => [r.crop, { ...entry(r.current, r.previous), source: r.source, scope: r.scope, ref: r.ref }]),
  );
}

const entry = (current?: number, previous?: number): SofEntry => ({
  ...(current != null ? { current } : {}),
  ...(previous != null ? { previous } : {}),
});

export function listDistricts(store = browserStore()): string[] {
  const seen = new Map<string, string>();
  for (const r of sofTable(store)) if (!seen.has(norm(r.district))) seen.set(norm(r.district), r.district);
  return [...seen.values()];
}

export function listCrops(district: string, store = browserStore()): string[] {
  return [...new Set(rowsFor(district, store).map((r) => r.crop))];
}

const splitCsv = (line: string) =>
  (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).slice(0, -1).map((f) => f.replace(/,$/, "").trim().replace(/^"([\s\S]*)"$/, "$1").replace(/""/g, '"'));

function num(raw: string, name: string, errs: string[]): number | undefined {
  if (raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) errs.push(`${name} must be a positive number in Rs/ha, got "${raw}"`);
  return n;
}

/** Parse a bank SoF CSV (district,crop,season,current,previous,ref); bad rows are reported, good rows kept. */
export function parseSofCsv(text: string): { rows: SofRow[]; errors: CsvError[] } {
  const rows: SofRow[] = [];
  const errors: CsvError[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerAt = lines.findIndex((l) => l.trim() !== "");
  const header = headerAt < 0 ? [] : splitCsv(lines[headerAt]).map((h) => h.toLowerCase());
  if (header.join(",") !== CSV_COLUMNS.join(",")) {
    errors.push({ line: headerAt + 1 || 1, message: `Header must be: ${CSV_COLUMNS.join(",")}` });
    return { rows, errors };
  }
  for (let i = headerAt + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    const [district = "", cropRaw = "", seasonRaw = "", cur = "", prev = "", ref = ""] = splitCsv(lines[i]);
    const errs: string[] = [];
    if (!district) errs.push("district is required");
    if (!cropRaw) errs.push("crop is required");
    const season = seasonRaw.toLowerCase() as Season;
    if (!SEASONS.includes(season)) errs.push(`unknown season "${seasonRaw}" (use ${SEASONS.join(", ")})`);
    const current = num(cur, "current", errs);
    const previous = num(prev, "previous", errs);
    if (cur === "" && prev === "") errs.push("current or previous SoF is required");
    if (errs.length) {
      errors.push({ line: i + 1, message: errs.join("; ") });
      continue;
    }
    const crop = lookupCrop(cropRaw) ?? norm(cropRaw);
    rows.push({ district, crop, season, ...entry(current, previous), source: "official", scope: "district", ref: ref || "Bank SoF upload" });
  }
  return { rows, errors };
}
