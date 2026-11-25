import { test } from "node:test";
import assert from "node:assert/strict";
import { computeKcc, type KccInput } from "./kcc.ts";
import { premiumEstimate, whatIfs } from "./whatif.ts";

const sof = { soybean: { current: 30_000 }, wheat: { current: 35_000 } };
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
const ids = (ws: { id: string }[]) => ws.map((w) => w.id);

test("just above ₹2,00,000: tie-up and trim come first, both collateral-free", () => {
  const input = { ...base, crops: base.crops.map((c) => ({ ...c, areaHa: 1.5 })), landHa: 1.5 };
  assert.equal(computeKcc(input).kccLimit, 208_000);
  const ws = whatIfs(input);
  assert.deepEqual(ids(ws).slice(0, 2), ["recovery_tieup", "under_threshold"]);
  assert.ok(ws[0].collateralFree && ws[0].delta === 0 && ws[0].para === "25");
  assert.ok(ws[1].kccLimit <= 200_000 && ws[1].collateralFree);
  assert.ok(ws.length <= 5);
  for (const w of ws) assert.equal(w.kccLimit - w.delta, 208_000);
});

test("term loan over the cap is cut before crop area", () => {
  const ws = whatIfs({ ...base, crops: [{ crop: "Soybean", season: "kharif", areaHa: 1 }], insurancePremium: 0, termLoan: 150_000 });
  const t = ws.find((w) => w.id === "under_threshold")!;
  assert.ok(t.change.termLoan! < 150_000 && t.kccLimit <= 200_000);
});

test("overclaim, missing SoF and missing insurance each get a what-if", () => {
  const input: KccInput = { ...base, insurancePremium: 0, crops: [...base.crops, { crop: "Garlic", season: "rabi", areaHa: 1 }] };
  const ws = whatIfs(input);
  const fit = ws.find((w) => w.id === "fit_area_to_land")!;
  assert.equal(computeKcc({ ...input, ...fit.change }).flags.some((f) => f.code === "AREA_EXCEEDS_LAND"), false);
  assert.equal(fit.para, "29");
  assert.equal(ws.find((w) => w.id === "drop_no_sof")?.delta, 0);
  assert.equal(premiumEstimate(input), 2_250); // 60,000 x 2% + 70,000 x 1.5%
  assert.ok(ids(ws).includes("add_insurance"));
});

test("pump-set term loan adds ₹50,000 and is skipped when a term loan exists", () => {
  assert.equal(whatIfs({ ...base, landHa: 1, crops: [{ crop: "Soybean", season: "kharif", areaHa: 1 }] }).find((w) => w.id === "term_loan_pump")?.delta, 50_000);
  assert.ok(!ids(whatIfs({ ...base, termLoan: 10_000 })).includes("term_loan_pump"));
});
