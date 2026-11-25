// Builds the appraisal agent request from a Case (streaming is handled by useChat).
import { sofSnapshot } from "../sof.ts";
import { listCases, type Case } from "../store.ts";
import type { AgentRequest, LandEvidence } from "./types.ts";

export type Answer = NonNullable<AgentRequest["answers"]>[number];

const landEvidence = (c: Case): LandEvidence | undefined => (c.extracted.land as { evidence?: LandEvidence } | undefined)?.evidence;

export function buildRequest(c: Case, answers?: Answer[]): AgentRequest {
  const { name, village, surveyNos, aadhaarLast4 } = c.farmer;
  const portfolio = listCases()
    .filter((x) => x.id !== c.id && x.farmer.surveyNos.length > 0)
    .map((x) => ({ caseId: x.id, farmerName: x.farmer.name, village: x.farmer.village, district: x.district, surveyNos: x.farmer.surveyNos, status: x.status, kccLimit: x.result?.kccLimit }));
  return {
    evidence: {
      caseId: c.id,
      district: c.district,
      applicant: { name, village, surveyNos, aadhaarLast4 },
      landHa: c.landHa,
      tenure: c.tenure,
      crops: c.crops,
      insurancePremium: c.insurancePremium,
      termLoan: c.termLoan,
      recoveryTieUp: c.recoveryTieUp,
      land: landEvidence(c),
      transcript: c.extracted.transcript ? { text: c.extracted.transcript, lang: c.farmerLang } : undefined,
    },
    sof: c.sofSnapshot ?? sofSnapshot(c.district),
    portfolio,
    officerLang: c.officerLang,
    farmerLang: c.farmerLang,
    answers: answers?.length ? answers : undefined,
  };
}
