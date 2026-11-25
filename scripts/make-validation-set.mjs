// Builds src/data/validation-set.json: runs src/lib/kcc.ts on each case and fails if the engine
// disagrees with the hand-computed figures below (hand = RBI para 13 arithmetic done by hand).
// Usage: node scripts/make-validation-set.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { computeKcc } from "../src/lib/kcc.ts";

const root = resolve(import.meta.dirname, "..");
const SOF = {
  soybean: { current: 30_000 },
  wheat: { current: 35_000 },
  gram: { previous: 25_000 }, // not notified: 13(3) notional 27,500
  maize: { current: 28_000 },
  mustard: { current: 26_000 },
  cotton: { current: 45_000 },
  sugarcane: { current: 120_000 },
};
const soy = (a) => ({ crop: "Soybean", season: "kharif", areaHa: a });
const wheat = (a) => ({ crop: "Wheat", season: "rabi", areaHa: a });
const gram = (a) => ({ crop: "Gram", season: "rabi", areaHa: a });
const owner2 = { landHa: 2, tenure: "owner", crops: [soy(2), wheat(2)], insurancePremium: 2_600 };
const sehore = { landHa: 1.5, tenure: "owner", crops: [soy(1.5), wheat(1.2), gram(0.3)] };

// hand: { y1, y6, cmpl, free, flags } ; y1raw/y6raw kept in comments for review
const cases = [
  { id: "C01-baseline", desc: "Owner 2 ha soybean + wheat, insurance 2,600 (spec quickstart)", input: owner2,
    hand: { y1: 172_000, y6: 276_000, cmpl: 276_000, free: false, flags: ["COLLATERAL_ABOVE_LIMIT"] } }, // 171,600 ; 276,363.5
  { id: "C02-term-loan", desc: "C01 + term loan 1,00,000 (para 19, 10)", input: { ...owner2, termLoan: 100_000 },
    hand: { y1: 172_000, y6: 276_000, cmpl: 376_000, free: false, flags: ["COLLATERAL_ABOVE_LIMIT"] } },
  { id: "C03-tieup", desc: "C01 with recovery tie-up: collateral-free up to 3,00,000 (para 25)", input: { ...owner2, recoveryTieUp: true },
    hand: { y1: 172_000, y6: 276_000, cmpl: 276_000, free: true, flags: [] } },
  { id: "C04-tieup-over", desc: "Tie-up + term loan 30,000 pushes CMPL past 3,00,000", input: { ...owner2, recoveryTieUp: true, termLoan: 30_000 },
    hand: { y1: 172_000, y6: 276_000, cmpl: 306_000, free: false, flags: ["COLLATERAL_ABOVE_LIMIT"] } }, // 306,363.5
  { id: "C05-sehore-plan", desc: "Sehore crop plan (parity case): soybean 1.5, wheat 1.2, gram 0.3 notional SoF; just under 2,00,000", input: sehore,
    hand: { y1: 124_000, y6: 199_000, cmpl: 199_000, free: true, flags: ["SOF_NOTIONAL_HIKE"] } }, // 95,250 x1.3 = 123,825 ; 199,421.4
  { id: "C06-near-threshold-over", desc: "C05 + insurance 1,500: CMPL just over 2,00,000", input: { ...sehore, insurancePremium: 1_500 },
    hand: { y1: 125_000, y6: 202_000, cmpl: 202_000, free: false, flags: ["SOF_NOTIONAL_HIKE", "COLLATERAL_ABOVE_LIMIT"] } }, // 125,325 ; 201,837.2
  { id: "C07-threshold-rounding", desc: "Raw CMPL 2,00,025 rounds to 2,00,000 and is treated as collateral-free (open interpretation)", input: { ...sehore, insurancePremium: 375 },
    hand: { y1: 124_000, y6: 200_000, cmpl: 200_000, free: true, flags: ["SOF_NOTIONAL_HIKE"] } }, // 124,200 ; 200,025.3
  { id: "C08-sharecropper-small", desc: "Sharecropper 0.2 ha soybean: affidavit OK, marginal, Flexi KCC (paras 30, 6(5), 13(7))",
    input: { landHa: 0.2, tenure: "sharecropper", crops: [soy(0.2)] },
    hand: { y1: 8_000, y6: 13_000, cmpl: 13_000, free: true, flags: ["FLEXI_KCC", "TENANCY_PROOF:info"] } }, // 7,800 ; 12,562
  { id: "C09-affidavit-rounding", desc: "Sharecropper 0.80 ha: raw CMPL 50,248 rounds to 50,000, affidavit still accepted (open interpretation)",
    input: { landHa: 0.8, tenure: "sharecropper", crops: [soy(0.8)] },
    hand: { y1: 31_000, y6: 50_000, cmpl: 50_000, free: true, flags: ["FLEXI_KCC", "TENANCY_PROOF:info"] } }, // 31,200 ; 50,247.9
  { id: "C10-affidavit-over", desc: "Sharecropper 0.81 ha: CMPL 51,000 needs panchayat certificate (para 30)",
    input: { landHa: 0.81, tenure: "sharecropper", crops: [soy(0.81)] },
    hand: { y1: 32_000, y6: 51_000, cmpl: 51_000, free: true, flags: ["FLEXI_KCC", "TENANCY_PROOF:warn"] } }, // 31,590 ; 50,876.0
  { id: "C11-oral-lessee", desc: "Oral lessee 1.5 ha soybean (para 30 warn)",
    input: { landHa: 1.5, tenure: "oral_lessee", crops: [soy(1.5)] },
    hand: { y1: 59_000, y6: 94_000, cmpl: 94_000, free: true, flags: ["TENANCY_PROOF:warn"] } }, // 58,500 ; 94,214.8
  { id: "C12-tenant-written", desc: "Tenant with written lease, 1.2 ha wheat: no tenancy-proof flag",
    input: { landHa: 1.2, tenure: "tenant", crops: [wheat(1.2)] },
    hand: { y1: 55_000, y6: 88_000, cmpl: 88_000, free: true, flags: [] } }, // 54,600 ; 87,933.8
  { id: "C13-sugarcane", desc: "Sugarcane (annual, 12-18 months) 1 ha + soybean 1 ha + wheat 1 ha on 2 ha, insurance 6,000; long-duration crop counted once",
    input: { landHa: 2, tenure: "owner", crops: [{ crop: "Sugarcane", season: "annual", areaHa: 1 }, soy(1), wheat(1)], insurancePremium: 6_000 },
    hand: { y1: 247_000, y6: 397_000, cmpl: 397_000, free: false, flags: ["COLLATERAL_ABOVE_LIMIT"] } }, // 246,500 ; 396,990.7
  { id: "C14-sugarcane-overlap", desc: "Sugarcane 1.5 ha annual + soybean 1.5 ha kharif on 2 ha: 3 ha in kharif, flagged AREA_EXCEEDS_LAND",
    input: { landHa: 2, tenure: "owner", crops: [{ crop: "Sugarcane", season: "annual", areaHa: 1.5 }, soy(1.5)] },
    hand: { y1: 293_000, y6: 471_000, cmpl: 471_000, free: false, flags: ["AREA_EXCEEDS_LAND", "COLLATERAL_ABOVE_LIMIT"] }, // 292,500 ; 471,074.2
  },
  { id: "C15-insurance-term-nosof", desc: "C01 + dragon fruit 0.5 ha (no SoF, excluded 13(4)) + term loan 2,50,000",
    input: { ...owner2, crops: [...owner2.crops, { crop: "Dragon fruit", season: "annual", areaHa: 0.5 }], termLoan: 250_000 },
    hand: { y1: 172_000, y6: 276_000, cmpl: 526_000, free: false, flags: ["CROP_NOT_IN_SOF", "COLLATERAL_ABOVE_LIMIT"] } }, // 526,363.5
  { id: "C16-marginal-1ha", desc: "Exactly 1.00 ha maize + mustard: marginal (para 6(5) <= 1 ha)",
    input: { landHa: 1, tenure: "owner", crops: [{ crop: "Maize", season: "kharif", areaHa: 1 }, { crop: "Mustard", season: "rabi", areaHa: 1 }] },
    hand: { y1: 70_000, y6: 113_000, cmpl: 113_000, free: true, flags: ["FLEXI_KCC"] } }, // 70,200 ; 113,057.8
  { id: "C17-small-1.01ha", desc: "1.01 ha maize + mustard: not marginal",
    input: { landHa: 1.01, tenure: "owner", crops: [{ crop: "Maize", season: "kharif", areaHa: 1.01 }, { crop: "Mustard", season: "rabi", areaHa: 1.01 }] },
    hand: { y1: 71_000, y6: 114_000, cmpl: 114_000, free: true, flags: [] } }, // 70,902 ; 114,188.4
  { id: "C18-acre-record", desc: "Land from khasra-4 (4.5 acre = 1.8211 ha): cotton kharif + gram rabi",
    input: { landHa: 1.8211, tenure: "owner", crops: [{ crop: "Cotton", season: "kharif", areaHa: 1.8211 }, gram(1.8211)] },
    hand: { y1: 172_000, y6: 276_000, cmpl: 276_000, free: false, flags: ["SOF_NOTIONAL_HIKE", "COLLATERAL_ABOVE_LIMIT"] } }, // 171,638.7 ; 276,423.3
  { id: "C19-area-exceeds", desc: "Soybean 3 ha claimed on 2 ha land: error flag (figures still computed, UI must block)",
    input: { ...owner2, crops: [soy(3)] },
    hand: { y1: 120_000, y6: 193_000, cmpl: 193_000, free: true, flags: ["AREA_EXCEEDS_LAND"] } }, // 119,600 ; 192,617
];

const failures = [];
const calc = cases.map(({ id, desc, input, hand, reviewNote }) => {
  const full = { ...input, sof: SOF };
  const r = computeKcc(full);
  const got = r.flags.map((f) => (f.code === "TENANCY_PROOF" ? `${f.code}:${f.level}` : f.code));
  const check = (k, a, b) => a !== b && failures.push(`${id} ${k}: engine ${a} vs hand ${b}`);
  check("year1", r.yearlyLimits[0], hand.y1);
  check("year6", r.shortTermYear6, hand.y6);
  check("cmpl", r.kccLimit, hand.cmpl);
  check("collateralFree", r.collateralFree, hand.free);
  for (const f of hand.flags) if (!got.includes(f)) failures.push(`${id} missing flag ${f} (engine: ${got.join(",")})`);
  return {
    id, desc, input: full,
    expected: {
      year1Limit: r.yearlyLimits[0], yearlyLimits: r.yearlyLimits, shortTermYear6: r.shortTermYear6, termLoan: r.termLoan,
      kccLimit: r.kccLimit, marginal: r.marginal, flexiEligible: r.flexiEligible, collateralFree: r.collateralFree, flags: got,
    },
    ...(reviewNote && { reviewNote }),
  };
});
if (failures.length) {
  console.error("Engine disagrees with hand calculation:\n" + failures.join("\n"));
  process.exit(1);
}

const land = JSON.parse(readFileSync(resolve(root, "public/samples/land-expected.json"), "utf8"));
const plans = JSON.parse(readFileSync(resolve(root, "public/samples/crop-plans.json"), "utf8"));
const set = {
  version: "2026-11-25",
  rule: "RBI KCC Directions, 2026; SoF values here are fixed test values, not the district dataset",
  calc,
  extraction: {
    source: "/samples/land-expected.json",
    passRule: "areaHa within 0.01 ha and surveyNos set-equal (SC-003: >= 9 of 10)",
    items: land.records.map((r) => ({ file: r.file, ownerName: r.ownerName, village: r.village, surveyNos: r.surveyNos, areaHa: r.areaHa, areaUnitSeen: r.areaUnitSeen, aadhaarLast4: r.aadhaarLast4 })),
  },
  parity: {
    source: "/samples/crop-plans.json",
    calcCase: "C05-sehore-plan",
    passRule: "every language yields expectedCrops (crop key, season, areaHa within 0.01) and the C05 limit",
    expectedCrops: plans.expectedCrops,
    transcripts: plans.plans.map(({ lang, text, audio }) => ({ lang, text, audio })),
  },
  openInterpretations: [
    "Annex I rounding order: unrounded compounding, rounded per year (C01, C02).",
    "Collateral-free and affidavit thresholds compared after rounding to nearest 1,000 (C07, C09).",
    "Para 30 affidavit cap compared against full CMPL incl. term loan, not year-1 limit.",
  ],
};
mkdirSync(resolve(root, "src/data"), { recursive: true });
writeFileSync(resolve(root, "src/data/validation-set.json"), JSON.stringify(set, null, 2) + "\n");
console.log(`ok ${calc.length} calc, ${set.extraction.items.length} extraction, ${set.parity.transcripts.length} parity`);
