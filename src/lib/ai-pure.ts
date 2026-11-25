// Pure helpers for the AI route: no I/O, unit-tested in ai-pure.test.ts.
import { ACRE_TO_HA, type Season } from "./kcc.ts";

// interpretation: MP bigha = 12,000 sq ft = 0.1115 ha (indialandconverter.in/madhya-pradesh, 1acre.in); varies by district, officer confirms.
export const MP_BIGHA_TO_HA = 0.111484;
export type AreaUnit = "hectare" | "acre" | "bigha";

export function toHectare(value: number, unit: AreaUnit, bighaHa?: number | null): number {
  const f = unit === "acre" ? ACRE_TO_HA : unit === "bigha" ? (bighaHa && bighaHa > 0 ? bighaHa : MP_BIGHA_TO_HA) : 1;
  return Math.round(value * f * 10_000) / 10_000;
}

const DEV = "०१२३४५६७८९";
/** Devanagari digits to ASCII. */
export const asciiDigits = (s: string) => s.replace(/[०-९]/g, (d) => String(DEV.indexOf(d)));

/** Rupees with Indian grouping, rounded to the rupee. */
export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Masks every 12-digit (optionally 4-4-4 spaced) number to its last 4 digits. */
export const maskAadhaar = (s: string) =>
  s.replace(/(?<![0-9०-९])[0-9०-९]{4}[ -]?[0-9०-९]{4}[ -]?([0-9०-९]{4})(?![0-9०-९])/g, "XXXX XXXX $1");

/** Last 4 digits from whatever the model returned, else null. */
export function aadhaarLast4(v: unknown): string | null {
  const d = asciiDigits(String(v ?? "")).replace(/\D/g, "");
  return d.length === 4 || d.length === 12 ? d.slice(-4) : null;
}

/** Seasons whose claimed area exceeds land on record (same rule as engine para 29). */
export function seasonOverclaims(crops: { season: Season; areaHa: number }[], landHa: number) {
  const per = new Map<Season, number>();
  for (const c of crops) per.set(c.season, (per.get(c.season) ?? 0) + c.areaHa);
  return [...per].filter(([, a]) => a > landHa + 1e-9).map(([season, areaHa]) => ({ season, areaHa }));
}

export const overclaimQuestion = (o: { season: Season; areaHa: number }, landHa: number) =>
  `${o.season}: the farmer described ${+o.areaHa.toFixed(2)} ha but only ${+landHa.toFixed(2)} ha is on the land record. Which crops and areas are correct for ${o.season}?`;

const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
const CUR = String.raw`(?:₹|\brs\b\.?|\binr\b|रु\.?|रुपये|रुपए)`;
const MULT = String.raw`(?:\s*(lakh|lac|लाख|crore|करोड़))?`;
const FIGURE = new RegExp(
  String.raw`${CUR}\s*(${NUM})${MULT}|(${NUM})${MULT}\s*(?:rupees|रुपये|रुपए|/-)`,
  "giu",
);

/** Rupee amounts (₹1,72,000 / Rs 172000 / 1.72 lakh rupees) in a draft, as integers. */
export function rupeeFigures(text: string): number[] {
  const out: number[] = [];
  for (const m of asciiDigits(text).matchAll(FIGURE)) {
    const n = Number((m[1] ?? m[3]).replace(/,/g, ""));
    const mult = (m[2] ?? m[4] ?? "").toLowerCase();
    const k = /lakh|lac|लाख/.test(mult) ? 1e5 : /crore|करोड़/.test(mult) ? 1e7 : 1;
    out.push(Math.round(n * k));
  }
  return out;
}

/** Rupee amounts in a tool or engine result: numeric fields of ₹100+ and ₹-marked amounts in text (not survey or para numbers). */
export function resultNumbers(result: unknown): Set<number> {
  const s = new Set<number>();
  const walk = (v: unknown): void => {
    if (typeof v === "number" && Math.abs(v) >= 100) s.add(Math.round(v));
    else if (typeof v === "string") for (const n of rupeeFigures(v)) s.add(n);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(result);
  return s;
}

/** Rupee figures in `text` that do not appear in the engine result. */
export function unknownFigures(text: string, result: unknown): number[] {
  const ok = resultNumbers(result);
  return rupeeFigures(text).filter((n) => !ok.has(n));
}

/** Splits text into chunks of at most `max` chars, preferring sentence/line boundaries. */
export function chunkText(text: string, max: number): string[] {
  const parts = (text.match(/[^.!?।\n]*[.!?।\n]+\s*|[^.!?।\n]+$/g) ?? [text]).flatMap((p) =>
    p.length > max ? p.match(new RegExp(`[^]{1,${max}}`, "g"))! : [p],
  );
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (cur && (cur + p).length > max) {
      out.push(cur);
      cur = "";
    }
    cur += p;
  }
  if (cur) out.push(cur);
  return out;
}
