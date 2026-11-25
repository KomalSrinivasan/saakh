// KCC limit engine per RBI KCC Directions, 2026 (19 Jun 2026, effective 1 Jan 2027).
// Deterministic by design: the AI extracts inputs, this code decides the numbers.

export const RBI_DIRECTION = "RBI KCC Directions, 2026 (FIDD.CO.FSD.BC.No.04/05.05.010/2026-27)";
export const EFFECTIVE_FROM = "2027-01-01";
export const TENURE_YEARS = 6; // para 8
export const COLLATERAL_FREE = 200_000; // para 23
export const COLLATERAL_FREE_TIEUP = 300_000; // para 25
export const AFFIDAVIT_MAX = 50_000; // para 30
export const ACRE_TO_HA = 0.404686;

export type Season = "kharif" | "rabi" | "zaid" | "annual";
export type Tenure = "owner" | "tenant" | "oral_lessee" | "sharecropper";

export interface CropLine {
  crop: string;
  season: Season;
  areaHa: number;
}

/** SoF in ₹ per hectare. `current` missing = not yet notified for this season. */
export interface SofEntry {
  current?: number;
  previous?: number;
}

export interface KccInput {
  landHa: number; // owned + leased land under cultivation
  tenure: Tenure;
  crops: CropLine[];
  sof: Record<string, SofEntry>;
  insurancePremium?: number; // annual, para 13(1)(iv)
  termLoan?: number; // investment credit over the tenure, para 19
  recoveryTieUp?: boolean; // para 25
}

export interface Step {
  label: string;
  amount: number;
  para: string;
}

export interface Flag {
  level: "error" | "warn" | "info";
  code: string;
  message: string;
  para?: string;
}

export interface KccResult {
  steps: Step[];
  yearlyLimits: number[]; // short-term limit, years 1..6, rounded
  shortTermYear6: number;
  termLoan: number;
  kccLimit: number; // CMPL, para 10
  marginal: boolean;
  flexiEligible: boolean;
  collateralFree: boolean;
  flags: Flag[];
}

/** Nearest ₹1,000, para 13(5). */
export const round1000 = (n: number) => Math.round(n / 1000) * 1000;

const norm = (s: string) => s.trim().toLowerCase();

export function computeKcc(input: KccInput): KccResult {
  const flags: Flag[] = [];
  const steps: Step[] = [];
  const sof = Object.fromEntries(Object.entries(input.sof).map(([k, v]) => [norm(k), v]));

  if (input.landHa <= 0) flags.push({ level: "error", code: "NO_LAND", message: "Cultivated area must be greater than zero." });

  // Area claimed per season cannot exceed land under cultivation.
  const perSeason = new Map<Season, number>();
  for (const c of input.crops) perSeason.set(c.season, (perSeason.get(c.season) ?? 0) + c.areaHa);
  // Annual crops hold land all year, so they count against every other season too.
  const annual = perSeason.get("annual") ?? 0;
  if (annual) for (const s of ["kharif", "rabi", "zaid"] as const) if (perSeason.has(s)) perSeason.set(s, perSeason.get(s)! + annual);
  for (const [season, area] of perSeason) {
    if (area > input.landHa + 1e-9)
      flags.push({
        level: "error",
        code: "AREA_EXCEEDS_LAND",
        message: `${season}: ${area.toFixed(2)} ha claimed but only ${input.landHa.toFixed(2)} ha of land on record.`,
        para: "29",
      });
  }

  // 13(1)(i): SoF x area, with 13(3) notional hike and 13(4) exclusion.
  let base = 0;
  for (const c of input.crops) {
    const entry = sof[norm(c.crop)];
    if (!entry || (entry.current == null && entry.previous == null)) {
      flags.push({
        level: "warn",
        code: "CROP_NOT_IN_SOF",
        message: `${c.crop}: no Scale of Finance notified. Loan for this crop falls outside KCC.`,
        para: "13(4)",
      });
      continue;
    }
    let rate = entry.current;
    let para = "13(1)(i)";
    if (rate == null) {
      rate = entry.previous! * 1.1;
      para = "13(3)";
      flags.push({
        level: "info",
        code: "SOF_NOTIONAL_HIKE",
        message: `${c.crop}: current SoF not notified, used previous ₹${entry.previous!.toLocaleString("en-IN")}/ha + 10%.`,
        para: "13(3)",
      });
    }
    const amount = rate * c.areaHa;
    base += amount;
    steps.push({ label: `${c.crop} (${c.season}): ₹${Math.round(rate).toLocaleString("en-IN")}/ha × ${c.areaHa} ha`, amount, para });
  }

  const postHarvest = base * 0.1;
  const maintenance = base * 0.2;
  const insurance = input.insurancePremium ?? 0;
  steps.push({ label: "Post-harvest & household consumption (10%)", amount: postHarvest, para: "13(1)(ii)" });
  steps.push({ label: "Repairs, maintenance & tech services (20%)", amount: maintenance, para: "13(1)(iii)" });
  if (insurance) steps.push({ label: "Insurance premium", amount: insurance, para: "13(1)(iv)" });

  // interpretation: Annex I order assumed, compound unrounded and round each year (C01, C02); confirm against RBI illustrations.
  const year1 = base + postHarvest + maintenance + insurance;
  const yearlyRaw = Array.from({ length: TENURE_YEARS }, (_, i) => year1 * 1.1 ** i); // 13(6)
  const yearlyLimits = yearlyRaw.map(round1000);
  const shortTermYear6 = yearlyLimits[TENURE_YEARS - 1];
  const termLoan = input.termLoan ?? 0;
  const kccLimit = round1000(yearlyRaw[TENURE_YEARS - 1] + termLoan); // para 10

  steps.push({ label: "Year-1 short-term limit (rounded)", amount: yearlyLimits[0], para: "13(5)" });
  steps.push({ label: "Year-6 short-term limit (+10% per year)", amount: shortTermYear6, para: "13(6)" });
  if (termLoan) steps.push({ label: "Long-term (investment) limit", amount: termLoan, para: "19" });
  steps.push({ label: "KCC limit (CMPL)", amount: kccLimit, para: "10" });

  const marginal = input.landHa <= 1; // para 6(5)
  const flexiEligible = marginal;
  if (flexiEligible)
    flags.push({
      level: "info",
      code: "FLEXI_KCC",
      message: "Marginal farmer (≤1 ha): eligible for Flexi KCC of ₹10,000-₹50,000 without linking to land value.",
      para: "13(7)",
    });

  const cap = input.recoveryTieUp ? COLLATERAL_FREE_TIEUP : COLLATERAL_FREE;
  // interpretation: thresholds compared after rounding to the nearest ₹1,000 (C07, C09).
  const collateralFree = kccLimit <= cap;
  if (!collateralFree)
    flags.push({
      level: "info",
      code: "COLLATERAL_ABOVE_LIMIT",
      message: `Limit above ₹${cap.toLocaleString("en-IN")}: collateral and margin as per bank credit policy.`,
      para: input.recoveryTieUp ? "25" : "24",
    });

  // interpretation: para 30 affidavit cap compared with the full KCC limit incl. term loan, not the year-1 limit.
  if (input.tenure === "sharecropper" || input.tenure === "oral_lessee")
    flags.push({
      level: kccLimit <= AFFIDAVIT_MAX ? "info" : "warn",
      code: "TENANCY_PROOF",
      message:
        kccLimit <= AFFIDAVIT_MAX
          ? "Self-affidavit of land tilled is acceptable (loan up to ₹50,000)."
          : "Needs certificate from local administration / panchayat (loan above ₹50,000).",
      para: "30",
    });

  return { steps, yearlyLimits, shortTermYear6, termLoan, kccLimit, marginal, flexiEligible, collateralFree, flags };
}
