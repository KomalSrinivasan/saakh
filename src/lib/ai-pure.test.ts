import { test } from "node:test";
import assert from "node:assert/strict";
import { computeKcc } from "./kcc.ts";
import {
  aadhaarLast4,
  chunkText,
  maskAadhaar,
  pickEnglish,
  resultNumbers,
  MP_BIGHA_TO_HA,
  rupeeFigures,
  seasonOverclaims,
  toHectare,
  unknownFigures,
} from "./ai-pure.ts";

const result = computeKcc({
  landHa: 2,
  tenure: "owner",
  crops: [
    { crop: "soybean", season: "kharif", areaHa: 2 },
    { crop: "wheat", season: "rabi", areaHa: 2 },
  ],
  sof: { soybean: { current: 30_000 }, wheat: { current: 35_000 } },
  insurancePremium: 2_600,
});

test("unit conversion to hectares", () => {
  assert.equal(toHectare(2, "hectare"), 2);
  assert.equal(toHectare(5, "acre"), 2.0234);
  assert.equal(toHectare(10, "bigha"), Math.round(10 * MP_BIGHA_TO_HA * 10_000) / 10_000);
});

test("Aadhaar masked to last 4 in raw text, ASCII and Devanagari", () => {
  assert.equal(maskAadhaar("UID 1234 5678 9012 ok"), "UID XXXX XXXX 9012 ok");
  assert.equal(maskAadhaar("आधार १२३४५६७८९०१२"), "आधार XXXX XXXX ९०१२");
  assert.equal(maskAadhaar("khasra 123 phone 98765432101234"), "khasra 123 phone 98765432101234");
  assert.equal(aadhaarLast4("1234-5678-9012"), "9012");
  assert.equal(aadhaarLast4("9012"), "9012");
  assert.equal(aadhaarLast4("12345"), null);
  assert.equal(aadhaarLast4(null), null);
});

test("season over-claim per season (para 29)", () => {
  const crops = [
    { season: "kharif" as const, areaHa: 1.5 },
    { season: "kharif" as const, areaHa: 1 },
    { season: "rabi" as const, areaHa: 2 },
  ];
  assert.deepEqual(seasonOverclaims(crops, 2), [{ season: "kharif", areaHa: 2.5 }]);
});

test("rupee figures: Indian grouping, plain, lakh, Devanagari, suffix", () => {
  assert.deepEqual(rupeeFigures("Limit ₹1,72,000 (para 13(5)) and Rs. 172000"), [172_000, 172_000]);
  assert.deepEqual(rupeeFigures("सीमा ₹२,७६,००० है, 1.72 lakh rupees, 3,76,000/-"), [276_000, 172_000, 376_000]);
  assert.deepEqual(rupeeFigures("6 years, 10%, para 13(1)(i), 2 ha"), []);
});

test("figure verification accepts only engine values", () => {
  assert.deepEqual(unknownFigures(`KCC limit ₹${result.kccLimit.toLocaleString("en-IN")} (para 10), year-1 ₹1,72,000 (para 13(5))`, result), []);
  assert.deepEqual(unknownFigures("KCC limit ₹2,80,000 (para 10)", result), [280_000]);
  assert.deepEqual(unknownFigures("Soybean at ₹30,000/ha", result), []);
});

test("chunkText keeps chunks under limit and loses nothing", () => {
  const t = "पहला वाक्य। Second sentence. " + "x".repeat(25) + " Third?";
  const c = chunkText(t, 20);
  assert.ok(c.every((s) => s.length <= 20));
  assert.equal(c.join(""), t);
  assert.deepEqual(chunkText("short", 100), ["short"]);
});

test("bigha uses factor printed on record when given", () => {
  assert.equal(toHectare(6, "bigha", 0.25), 1.5);
  assert.equal(toHectare(6, "bigha", null), Math.round(6 * MP_BIGHA_TO_HA * 10_000) / 10_000);
});

test("resultNumbers keeps rupee amounts, not survey or para numbers", () => {
  const s = resultNumbers({ kccLimit: 287000, areaHa: 1.5, evidence: ["Survey no: 112/3", "para 13(3)", "Limit ₹2,91,000"] });
  assert.ok(s.has(287000) && s.has(291000));
  assert.ok(!s.has(112) && !s.has(13) && !s.has(2));
});

test("pickEnglish drops a translation whose numbers drift from the transcript", () => {
  const said = "मग रब्बीत 1.2 हेक्टरवर गहू आणि उरलेल्या 0.3 हेक्टरवर हरभरा";
  assert.equal(pickEnglish("Wheat on 1.25 ha and gram on 0.35 ha", "Wheat on 1.2 ha, gram on 0.3 ha", said), "Wheat on 1.2 ha, gram on 0.3 ha");
  assert.equal(pickEnglish("Wheat on 1.2 hectares and gram on 0.3", "x", said), "Wheat on 1.2 hectares and gram on 0.3");
  assert.equal(pickEnglish("", "mapped", said), "mapped");
});
