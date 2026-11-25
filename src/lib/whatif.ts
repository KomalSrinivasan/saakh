// Deterministic counterfactuals: re-run the engine with one input changed and report the new limit.
import type { WhatIf } from "./agent/types.ts";
import { inr } from "./ai-pure.ts";
import { COLLATERAL_FREE, COLLATERAL_FREE_TIEUP, computeKcc, type CropLine, type KccInput, type KccResult } from "./kcc.ts";
import { seasonAreas } from "./risk.ts";

const floor2 = (n: number) => Math.floor(n * 100 + 1e-9) / 100;
const sumArea = (cs: CropLine[]) => cs.reduce((s, c) => s + c.areaHa, 0);
const key = (s: string) => s.trim().toLowerCase();
export const PUMP_SET = 50_000;

const rateOf = (input: KccInput, crop: string) => {
  const e = Object.entries(input.sof).find(([k]) => key(k) === key(crop))?.[1];
  return e?.current ?? (e?.previous != null ? e.previous * 1.1 : undefined);
};

/** PMFBY farmer share: 2% kharif, 1.5% rabi, 5% annual/commercial (estimate). */
export const premiumEstimate = (input: KccInput) =>
  Math.round(input.crops.reduce((s, c) => s + (rateOf(input, c.crop) ?? 0) * c.areaHa * (c.season === "kharif" ? 0.02 : c.season === "rabi" ? 0.015 : 0.05), 0));

/** Crops scaled so no season exceeds land held; annual crops take the tightest season factor. */
function fitToLand(crops: CropLine[], landHa: number): CropLine[] {
  const f = new Map([...seasonAreas(crops)].map(([s, a]) => [s, Math.min(1, landHa / a)]));
  const annual = Math.min(...f.values());
  return crops.map((c) => ({ ...c, areaHa: floor2(c.areaHa * (c.season === "annual" ? annual : f.get(c.season)!)) }));
}

/** Smallest cut (term loan first, then all crop areas pro rata) that brings the limit under `cap`. */
function underCap(input: KccInput, cap: number): { change: Partial<KccInput>; label: string } | null {
  const tl = input.termLoan ?? 0;
  if (tl && computeKcc({ ...input, termLoan: 0 }).kccLimit <= cap) {
    let lo = 0;
    let hi = tl; // largest term loan in [lo, hi] that fits, to ₹1,000
    while (hi - lo > 1000) {
      const mid = Math.round((lo + hi) / 2000) * 1000;
      if (computeKcc({ ...input, termLoan: mid }).kccLimit <= cap) lo = mid;
      else hi = mid;
    }
    return { change: { termLoan: lo }, label: `Cut the term loan by ${inr(tl - lo)} to stay collateral-free` };
  }
  const total = sumArea(input.crops);
  if (!total) return null;
  for (let cut = 0.01; cut < total; cut = Math.round((cut + 0.01) * 100) / 100) {
    const crops = input.crops.map((c) => ({ ...c, areaHa: floor2(c.areaHa * (1 - cut / total)) }));
    if (computeKcc({ ...input, crops }).kccLimit <= cap) return { change: { crops }, label: `Reduce crop area by ${+(total - sumArea(crops)).toFixed(2)} ha to stay collateral-free` };
  }
  return null;
}

/** Up to 5 what-ifs that change the outcome, threshold crossings first. */
export function whatIfs(input: KccInput): WhatIf[] {
  const base = computeKcc(input);
  const errors = (r: KccResult) => r.flags.filter((f) => f.level === "error").length;
  const out: WhatIf[] = [];
  const rank = new Map<WhatIf, number>();
  const add = (id: string, label: string, change: Partial<KccInput>, para: string, note: (r: KccResult) => string) => {
    const r = computeKcc({ ...input, ...change });
    const changed = r.kccLimit !== base.kccLimit || r.collateralFree !== base.collateralFree || r.flags.length !== base.flags.length;
    if (!changed) return;
    const w = { id, label, change, kccLimit: r.kccLimit, delta: r.kccLimit - base.kccLimit, collateralFree: r.collateralFree, para, note: note(r) };
    out.push(w);
    rank.set(w, !base.collateralFree && r.collateralFree ? 0 : errors(r) < errors(base) ? 1 : base.collateralFree && !r.collateralFree ? 2 : 3);
  };

  if (!input.recoveryTieUp)
    add("recovery_tieup", "Add a recovery tie-up (dairy / sugar mill / FPO)", { recoveryTieUp: true }, "25", (r) =>
      r.collateralFree ? `Limit stays ${inr(r.kccLimit)} but becomes collateral-free (cap rises to ${inr(COLLATERAL_FREE_TIEUP)}).` : `Collateral-free cap rises to ${inr(COLLATERAL_FREE_TIEUP)}.`,
    );

  if (!input.insurancePremium) {
    const p = premiumEstimate(input);
    if (p > 0)
      add("add_insurance", `Add PMFBY premium (estimate ${inr(p)})`, { insurancePremium: p }, "13(1)(iv)", (r) =>
        `Estimated at 2% kharif / 1.5% rabi / 5% annual of SoF x area; use the actual premium. Limit becomes ${inr(r.kccLimit)}.`,
      );
  }

  if (input.landHa > 0 && base.flags.some((f) => f.code === "AREA_EXCEEDS_LAND")) {
    const crops = fitToLand(input.crops, input.landHa);
    add("fit_area_to_land", `Reduce crop area to the ${+input.landHa.toFixed(2)} ha held`, { crops }, "29", (r) =>
      `Crop area scaled down season by season so no season exceeds land on record. Limit becomes ${inr(r.kccLimit)}.`,
    );
  }

  const noSof = [...new Set(input.crops.filter((c) => rateOf(input, c.crop) == null).map((c) => c.crop))];
  if (noSof.length) {
    const crops = input.crops.filter((c) => !noSof.includes(c.crop));
    add("drop_no_sof", `Drop crops without SoF (${noSof.join(", ")})`, { crops }, "13(4)", () =>
      "These crops earn nothing under KCC already; finance them outside KCC. Removes the SoF warning without changing the limit.",
    );
  }

  const cap = input.recoveryTieUp ? COLLATERAL_FREE_TIEUP : COLLATERAL_FREE;
  if (!base.collateralFree && base.kccLimit <= cap * 1.25) {
    const fix = underCap(input, cap);
    if (fix) add("under_threshold", fix.label, fix.change, "23", (r) => `Limit ${inr(r.kccLimit)} is within the ${inr(cap)} collateral-free ceiling.`);
  }

  if (!input.termLoan)
    add("term_loan_pump", `Add a term loan for a pump set (${inr(PUMP_SET)})`, { termLoan: PUMP_SET }, "19", (r) =>
      `Investment credit is added on top of the year-6 short-term limit. Limit becomes ${inr(r.kccLimit)}${!r.collateralFree && base.collateralFree ? ", which needs collateral" : ""}.`,
    );

  return out.sort((a, b) => rank.get(a)! - rank.get(b)!).slice(0, 5);
}
