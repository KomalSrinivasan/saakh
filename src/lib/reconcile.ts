// Merges two independent land-record reads (Sarvam vision, Claude vision) into per-field agree/disagree evidence.
import type { LandEvidence, ReadField } from "./agent/types.ts";
import { asciiDigits } from "./ai-pure.ts";
import { nameSimilarity } from "./names.ts";

export interface RawLand {
  ownerName: string;
  village: string;
  surveyNos: string[];
  areaHa: number | null;
  aadhaarLast4: string | null;
  areaUnitSeen: "hectare" | "acre" | "bigha";
}

/** Survey number as a comparable key: ASCII digits, no spaces, lowercase. */
export const normSurvey = (s: string) => asciiDigits(s).replace(/\s+/g, "").toLowerCase();

const sameSet = (x: string[], y: string[]) => {
  const a = new Set(x.map(normSurvey));
  const b = new Set(y.map(normSurvey));
  return a.size === b.size && [...a].every((v) => b.has(v));
};

const AGREE = {
  ownerName: (x: string, y: string) => nameSimilarity(x, y) >= 0.85,
  village: (x: string, y: string) => nameSimilarity(x, y) >= 0.9,
  surveyNos: sameSet,
  areaHa: (x: number | null, y: number | null) => (x == null || y == null ? x === y : Math.abs(x - y) <= 0.02 * Math.max(x, y)),
  aadhaarLast4: (x: string | null, y: string | null) => x === y,
};

const EMPTY = { ownerName: "", village: "", surveyNos: [] as string[], areaHa: null, aadhaarLast4: null };
const missing = (v: unknown) => v == null || v === "" || (Array.isArray(v) && !v.length);

function field<K extends keyof typeof AGREE>(k: K, a: RawLand | null, b: RawLand | null): ReadField<RawLand[K]> {
  const reads = [
    ...(a ? [{ source: "sarvam-vision" as const, value: a[k] }] : []),
    ...(b ? [{ source: "claude-vision" as const, value: b[k] }] : []),
  ];
  const agree = !!a && !!b && (AGREE[k] as (x: RawLand[K], y: RawLand[K]) => boolean)(a[k], b[k]);
  // Prefer the Claude read (b) unless it is empty.
  let value = (b && !missing(b[k]) ? b[k] : a && !missing(a[k]) ? a[k] : (b ?? a)?.[k] ?? EMPTY[k]) as RawLand[K];
  if (k === "surveyNos") value = [...new Set((value as string[]).map(normSurvey))] as RawLand[K];
  return { value, agree, reads };
}

/** a = sarvam-vision read, b = claude-vision read; one missing means nothing agrees. */
export function reconcileLand(a: RawLand | null, b: RawLand | null): LandEvidence {
  return {
    ownerName: field("ownerName", a, b),
    village: field("village", a, b),
    surveyNos: field("surveyNos", a, b),
    areaHa: field("areaHa", a, b),
    aadhaarLast4: field("aadhaarLast4", a, b),
    areaUnitSeen: b?.areaUnitSeen ?? a?.areaUnitSeen ?? "hectare",
  };
}
