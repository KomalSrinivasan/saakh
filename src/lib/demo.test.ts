import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoCases } from "./demo.ts";
import { runRiskChecks } from "./risk.ts";
import type { CaseEvidence, LandEvidence, PortfolioEntry } from "./agent/types.ts";
import type { Case } from "./store.ts";

// Mirrors buildRequest in agent/client.ts so the demo cases exercise the real rules.
const evidence = (c: Case): CaseEvidence => ({
  caseId: c.id,
  district: c.district,
  applicant: { name: c.farmer.name, village: c.farmer.village, surveyNos: c.farmer.surveyNos, aadhaarLast4: c.farmer.aadhaarLast4 },
  landHa: c.landHa,
  tenure: c.tenure,
  crops: c.crops,
  recoveryTieUp: c.recoveryTieUp,
  land: (c.extracted.land as { evidence?: LandEvidence }).evidence,
});
const portfolio = (cs: Case[]): PortfolioEntry[] => cs.map((x) => ({ caseId: x.id, farmerName: x.farmer.name, village: x.farmer.village, district: x.district, surveyNos: x.farmer.surveyNos, status: x.status, kccLimit: x.result?.kccLimit }));

test("demo cases: suspicious fires NAME_MISMATCH and DOUBLE_FINANCING, walkthrough stays clean", () => {
  const d = buildDemoCases("en-IN");
  const all = [d.walkthrough, d.suspicious, d.approved];
  assert.ok(all.every((c) => c.demo));
  assert.equal(d.approved.status, "approved");
  const sof = d.approved.sofSnapshot!;
  const codes = (c: Case) => runRiskChecks(evidence(c), portfolio(all.filter((x) => x.id !== c.id)), sof).map((r) => r.code);
  const sus = codes(d.suspicious);
  assert.ok(sus.includes("NAME_MISMATCH"), sus.join());
  assert.ok(sus.includes("DOUBLE_FINANCING"), sus.join());
  const clean = codes(d.walkthrough);
  for (const bad of ["NAME_MISMATCH", "DOUBLE_FINANCING", "VILLAGE_MISMATCH", "SURVEY_MISMATCH", "AREA_MISMATCH", "AREA_OVERCLAIM"]) assert.ok(!clean.includes(bad), clean.join());
});
