import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeKcc } from "./kcc.ts";
import {
  DEFAULT_SOF,
  UPLOAD_KEY,
  listCrops,
  listDistricts,
  lookupCrop,
  parseSofCsv,
  saveUploaded,
  sofSnapshot,
  toEngineSof,
  type SofRow,
  type SofStore,
} from "./sof.ts";

const memStore = (): SofStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};
const official = (r: Partial<SofRow>): SofRow => ({
  district: "Sehore",
  crop: "soybean",
  season: "kharif",
  source: "official",
  scope: "district",
  ref: "test circular",
  ...r,
});

test("default table: 5 districts x 7 crops, every row cited and labelled proxy", () => {
  assert.equal(DEFAULT_SOF.length, 35);
  assert.deepEqual(listDistricts(memStore()), ["Indore", "Sehore", "Ujjain", "Dewas", "Dhar"]);
  assert.equal(listCrops("sehore", memStore()).length, 7);
  for (const r of DEFAULT_SOF) {
    assert.equal(r.source, "proxy-pmfby");
    assert.match(r.ref, /^https:\/\//);
  }
});

test("alias mapping: Hindi and romanized names, case and diacritic insensitive", () => {
  assert.equal(lookupCrop("chana"), "gram");
  assert.equal(lookupCrop("चना"), "gram");
  assert.equal(lookupCrop(" Gehu "), "wheat");
  assert.equal(lookupCrop("गेहूं"), "wheat");
  assert.equal(lookupCrop("गेहूँ"), "wheat");
  assert.equal(lookupCrop("सोयाबीन"), "soybean");
  assert.equal(lookupCrop("SARSON"), "mustard");
  assert.equal(lookupCrop("सरसों"), "mustard");
  assert.equal(lookupCrop("makká"), "maize");
  assert.equal(lookupCrop("kapas"), "cotton");
  assert.equal(lookupCrop("ganna"), "sugarcane");
  assert.equal(lookupCrop("Wheat"), "wheat");
  assert.equal(lookupCrop("tomato"), undefined);
});

test("uploaded row overrides default by district+crop+season", () => {
  const store = memStore();
  saveUploaded([official({ current: 52_000, previous: 48_000 })], store);
  const snap = sofSnapshot("Sehore", store);
  assert.deepEqual(snap.soybean, { current: 52_000, previous: 48_000, source: "official", scope: "district", ref: "test circular" });
  assert.equal(snap.wheat.source, "proxy-pmfby"); // untouched rows stay proxy
  assert.equal(sofSnapshot("Indore", store).soybean.source, "proxy-pmfby"); // other districts untouched
});

test("upload for a different season does not replace the default row", () => {
  const store = memStore();
  saveUploaded([official({ season: "rabi", current: 1 })], store);
  assert.equal(listCrops("Sehore", store).length, 7);
  assert.ok(DEFAULT_SOF.some((r) => r.district === "Sehore" && r.crop === "soybean" && r.season === "kharif"));
});

test("corrupt or absent storage falls back to defaults", () => {
  const store = memStore();
  store.setItem(UPLOAD_KEY, "{not json");
  assert.equal(sofSnapshot("Dhar", store).soybean.source, "proxy-pmfby");
  assert.equal(listDistricts(undefined).length, 5); // SSR: no localStorage
});

test("toEngineSof returns plain SofEntry and computeKcc consumes it", () => {
  const store = memStore();
  saveUploaded([official({ current: 30_000 }), official({ crop: "wheat", season: "rabi", current: 35_000 })], store);
  const sof = toEngineSof("sehore", store);
  assert.deepEqual(sof.soybean, { current: 30_000 });
  const r = computeKcc({
    landHa: 2,
    tenure: "owner",
    crops: [
      { crop: "Soybean", season: "kharif", areaHa: 2 },
      { crop: "Wheat", season: "rabi", areaHa: 2 },
    ],
    sof,
    insurancePremium: 2_600,
  });
  assert.equal(r.yearlyLimits[0], 172_000); // spec US1 scenario 1
});

test("missing current uses previous +10% (13(3))", () => {
  const store = memStore();
  saveUploaded([official({ crop: "gram", season: "rabi", previous: 25_000 })], store);
  const sof = toEngineSof("Sehore", store);
  assert.deepEqual(sof.gram, { previous: 25_000 });
  const r = computeKcc({ landHa: 1, tenure: "owner", crops: [{ crop: "gram", season: "rabi", areaHa: 1 }], sof });
  assert.equal(r.yearlyLimits[0], 36_000); // 27,500 x 1.3 = 35,750
  assert.ok(r.flags.some((f) => f.code === "SOF_NOTIONAL_HIKE"));
});

test("crop with no SoF in default table is excluded by the engine (13(4))", () => {
  const sof = toEngineSof("Dhar", memStore());
  assert.deepEqual(sof.sugarcane, {});
  const r = computeKcc({ landHa: 1, tenure: "owner", crops: [{ crop: "sugarcane", season: "annual", areaHa: 1 }], sof });
  assert.ok(r.flags.some((f) => f.code === "CROP_NOT_IN_SOF"));
});

test("CSV good rows: aliases mapped, quotes and CRLF handled, marked official", () => {
  const csv = 'district,crop,season,current,previous,ref\r\nSehore,chana,Rabi,42000,,"DCCB circular 12/2026, p.3"\r\n\r\nSehore,wheat,rabi,,48000,\r\n';
  const { rows, errors } = parseSofCsv(csv);
  assert.deepEqual(errors, []);
  assert.deepEqual(rows, [
    { district: "Sehore", crop: "gram", season: "rabi", current: 42_000, source: "official", scope: "district", ref: "DCCB circular 12/2026, p.3" },
    { district: "Sehore", crop: "wheat", season: "rabi", previous: 48_000, source: "official", scope: "district", ref: "Bank SoF upload" },
  ]);
});

test("CSV row errors carry line numbers and keep valid rows", () => {
  const csv = [
    "district,crop,season,current,previous,ref",
    "Sehore,soybean,kharif,45000,42000,ok",
    ",soybean,kharif,45000,,x",
    "Sehore,,kharif,45000,,x",
    "Sehore,wheat,summer,45000,,x",
    "Sehore,wheat,rabi,abc,,x",
    "Sehore,wheat,rabi,-5,,x",
    "Sehore,wheat,rabi,,,x",
  ].join("\n");
  const { rows, errors } = parseSofCsv(csv);
  assert.equal(rows.length, 1);
  assert.deepEqual(
    errors.map((e) => e.line),
    [3, 4, 5, 6, 7, 8],
  );
  assert.match(errors[0].message, /district is required/);
  assert.match(errors[1].message, /crop is required/);
  assert.match(errors[2].message, /unknown season "summer"/);
  assert.match(errors[3].message, /current must be a positive number/);
  assert.match(errors[4].message, /current must be a positive number/);
  assert.match(errors[5].message, /current or previous SoF is required/);
});

test("CSV with wrong header is rejected", () => {
  const { rows, errors } = parseSofCsv("district,crop,rate\nSehore,wheat,40000");
  assert.equal(rows.length, 0);
  assert.equal(errors[0].line, 1);
});

test("sample public/samples/sof-sehore.csv parses cleanly", () => {
  const { rows, errors } = parseSofCsv(readFileSync(new URL("../../public/samples/sof-sehore.csv", import.meta.url), "utf8"));
  assert.deepEqual(errors, []);
  assert.ok(rows.length >= 7 && rows.every((r) => r.district === "Sehore"));
});
