import { test } from "node:test";
import assert from "node:assert/strict";
import type { CaseEvidence, PortfolioEntry, SofTable } from "./agent/types.ts";
import { checkCropPlan, runRiskChecks } from "./risk.ts";
import { reconcileLand, type RawLand } from "./reconcile.ts";

const sof: SofTable = {
  soybean: { current: 43_100, source: "proxy-pmfby", scope: "state", ref: "PMFBY proxy" },
  wheat: { current: 45_000, source: "official", scope: "district" },
};
const rec: RawLand = { ownerName: "रामप्रसाद पटेल", village: "सांवेर", surveyNos: ["४५"], areaHa: 2, aadhaarLast4: "4821", areaUnitSeen: "hectare" };
const ev: CaseEvidence = {
  caseId: "c2",
  district: "Indore",
  applicant: { name: "Ramprasad Patel", village: "Sanwer", surveyNos: ["45"], aadhaarLast4: "4821" },
  landHa: 2,
  tenure: "owner",
  crops: [
    { crop: "Soybean", season: "kharif", areaHa: 2 },
    { crop: "Wheat", season: "rabi", areaHa: 2 },
  ],
  recoveryTieUp: false,
  land: reconcileLand(rec, { ...rec, ownerName: "Ramprasad Patel", village: "Sanwer", surveyNos: ["45"] }),
};
const codes = (rs: { code: string }[]) => rs.map((r) => r.code);

test("clean case: only the SoF proxy note", () => {
  assert.deepEqual(codes(runRiskChecks(ev, [], sof)), ["SOF_PROXY"]);
});

test("double financing: same survey no already financed in the same village", () => {
  const portfolio: PortfolioEntry[] = [
    { caseId: "c1", farmerName: "Suresh Meena", village: "सांवेर", district: "Indore", surveyNos: ["45"], status: "approved", kccLimit: 180_000 },
    { caseId: "c3", farmerName: "Other", village: "Sanwer", district: "Dewas", surveyNos: ["45"], status: "approved" },
    { caseId: "c4", farmerName: "Other", village: "Sanwer", district: "Indore", surveyNos: ["45"], status: "draft" },
  ];
  const rs = runRiskChecks(ev, portfolio, sof);
  const df = rs.filter((r) => r.code === "DOUBLE_FINANCING");
  assert.equal(df.length, 1);
  assert.equal(df[0].severity, "high");
  assert.ok(df[0].evidence.some((e) => e.includes("C1") && e.includes("₹1,80,000")));
  assert.ok(df[0].evidence.every((e) => !e.includes(portfolio[0].farmerName)), "other farmer must not be named");
  assert.equal(rs[0].severity, "high");
});

test("impostor applicant: name, aadhaar, area and survey mismatches", () => {
  const rs = runRiskChecks({ ...ev, applicant: { name: "Ramesh Patidar", village: "Sanwer", surveyNos: ["46"], aadhaarLast4: "1111" }, landHa: 3 }, [], sof);
  const by = Object.fromEntries(rs.map((r) => [r.code, r]));
  assert.equal(by.NAME_MISMATCH.severity, "high");
  assert.ok(by.NAME_MISMATCH.evidence.includes("Record: Ramprasad Patel"));
  assert.equal(by.AADHAAR_MISMATCH.severity, "high");
  assert.equal(by.AREA_MISMATCH.severity, "high");
  assert.equal(by.SURVEY_MISMATCH.severity, "medium");
});

test("reader disagreement, overclaim, missing SoF, tenancy, duplicate applicant", () => {
  const land = reconcileLand(rec, { ...rec, ownerName: "Ramprasad Patel", areaHa: 2.6 });
  const rs = runRiskChecks(
    { ...ev, land, tenure: "oral_lessee", crops: [...ev.crops, { crop: "Garlic", season: "rabi", areaHa: 0.5 }] },
    [{ caseId: "c9", farmerName: "Ram Prasad Patel", village: "Sanwer", district: "Indore", surveyNos: ["99"], status: "draft" }],
    sof,
  );
  const rd = rs.filter((r) => r.code === "READ_DISAGREE");
  assert.deepEqual(rd.map((r) => r.severity), ["high"]);
  assert.equal(rs.find((r) => r.code === "AREA_OVERCLAIM")?.para, "29");
  assert.ok(codes(rs).includes("SOF_MISSING"));
  assert.equal(rs.find((r) => r.code === "TENANCY_DOCS")?.para, "30");
  assert.ok(codes(rs).includes("DUPLICATE_APPLICANT"));
});

test("no land photo: LAND_NOT_VERIFIED", () => {
  assert.ok(codes(runRiskChecks({ ...ev, land: undefined }, [], sof)).includes("LAND_NOT_VERIFIED"));
});

test("crop plan: season and district plausibility", () => {
  const rs = checkCropPlan("Sehore", [
    { crop: "Soybean", season: "rabi", areaHa: 1 },
    { crop: "मक्का", season: "rabi", areaHa: 1 },
    { crop: "Kapas", season: "kharif", areaHa: 1 },
    { crop: "Dragonfruit", season: "kharif", areaHa: 1 },
    { crop: "Arhar", season: "kharif", areaHa: 1 },
  ]);
  assert.deepEqual(rs.map((r) => `${r.code}:${r.severity}`), ["CROP_SEASON_IMPLAUSIBLE:high", "CROP_SEASON_IMPLAUSIBLE:medium", "CROP_DISTRICT_UNUSUAL:low", "UNKNOWN_CROP:medium"]);
  assert.deepEqual(checkCropPlan("Dhar", [{ crop: "cotton", season: "kharif", areaHa: 1 }]), []);
});
