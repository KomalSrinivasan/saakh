import { test } from "node:test";
import assert from "node:assert/strict";
import { computeKcc, round1000, type KccInput } from "./kcc.ts";

const sof = { soybean: { current: 30_000 }, wheat: { current: 35_000 }, gram: { previous: 25_000 } };
const base: KccInput = {
  landHa: 2,
  tenure: "owner",
  crops: [
    { crop: "Soybean", season: "kharif", areaHa: 2 },
    { crop: "Wheat", season: "rabi", areaHa: 2 },
  ],
  sof,
  insurancePremium: 2_600,
};
const codes = (r: ReturnType<typeof computeKcc>) => r.flags.map((f) => f.code);

test("rounds to nearest ₹1,000 (13(5))", () => {
  assert.equal(round1000(171_499), 171_000);
  assert.equal(round1000(171_500), 172_000);
});

test("year-1 = SoF×area +10% +20% + insurance (13(1))", () => {
  // 60,000 + 70,000 = 130,000; +13,000 +26,000 +2,600 = 171,600
  assert.equal(computeKcc(base).yearlyLimits[0], 172_000);
});

test("+10% per year for 6 years, CMPL = year-6 + term loan (13(6), 10)", () => {
  const r = computeKcc({ ...base, termLoan: 100_000 });
  assert.deepEqual(r.yearlyLimits, [172_000, 189_000, 208_000, 228_000, 251_000, 276_000]);
  assert.equal(r.kccLimit, 376_000); // 276,363.5 + 100,000
});

test("SoF not notified: previous +10% (13(3))", () => {
  const r = computeKcc({ ...base, crops: [{ crop: "Gram", season: "rabi", areaHa: 1 }], insurancePremium: 0 });
  // 27,500 ×1.3 = 35,750 → 36,000
  assert.equal(r.yearlyLimits[0], 36_000);
  assert.ok(codes(r).includes("SOF_NOTIONAL_HIKE"));
});

test("crop without SoF is excluded and flagged (13(4))", () => {
  const r = computeKcc({ ...base, crops: [...base.crops, { crop: "Dragon fruit", season: "annual", areaHa: 0.5 }] });
  assert.equal(r.yearlyLimits[0], 172_000);
  assert.ok(codes(r).includes("CROP_NOT_IN_SOF"));
});

test("area claimed beyond land is an error", () => {
  const r = computeKcc({ ...base, crops: [{ crop: "Soybean", season: "kharif", areaHa: 3 }] });
  assert.ok(codes(r).includes("AREA_EXCEEDS_LAND"));
});

test("same land in kharif and rabi is fine", () => {
  assert.ok(!codes(computeKcc(base)).includes("AREA_EXCEEDS_LAND"));
});

test("marginal farmer gets Flexi KCC flag (6(5), 13(7))", () => {
  const r = computeKcc({ ...base, landHa: 0.8, crops: [{ crop: "Soybean", season: "kharif", areaHa: 0.8 }] });
  assert.equal(r.marginal, true);
  assert.ok(codes(r).includes("FLEXI_KCC"));
  assert.equal(computeKcc(base).flexiEligible, false);
});

test("collateral-free ₹2L, ₹3L with recovery tie-up (23-25)", () => {
  const r = computeKcc(base); // 276,000
  assert.equal(r.collateralFree, false);
  assert.equal(computeKcc({ ...base, recoveryTieUp: true }).collateralFree, true);
});

test("sharecropper affidavit only up to ₹50,000 (30)", () => {
  // 1.5 ha soybean: 58,500 year-1 → 94,000 CMPL, needs panchayat certificate
  const big = computeKcc({ ...base, tenure: "sharecropper", landHa: 1.5, crops: [{ crop: "Soybean", season: "kharif", areaHa: 1.5 }], insurancePremium: 0 });
  assert.equal(big.flags.find((f) => f.code === "TENANCY_PROOF")?.level, "warn");
  const tiny = computeKcc({ ...base, tenure: "sharecropper", landHa: 0.2, crops: [{ crop: "Soybean", season: "kharif", areaHa: 0.2 }], insurancePremium: 0 });
  assert.equal(tiny.flags.find((f) => f.code === "TENANCY_PROOF")?.level, "info");
});

test("annual crop counts against kharif land (29)", () => {
  const r = computeKcc({ ...base, crops: [{ crop: "Soybean", season: "kharif", areaHa: 1.5 }, { crop: "Sugarcane", season: "annual", areaHa: 1.5 }] });
  assert.ok(r.flags.some((f) => f.code === "AREA_EXCEEDS_LAND"));
});
