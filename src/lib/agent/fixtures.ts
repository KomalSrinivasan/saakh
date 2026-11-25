// Test fixture: a clean Sehore case.
import type { AgentRequest } from "./types.ts";

export const sehore = (): AgentRequest => ({
  evidence: {
    caseId: "c1",
    district: "Sehore",
    applicant: { name: "Ramesh Patel", village: "Ashta", surveyNos: ["112"] },
    landHa: 2,
    tenure: "owner",
    crops: [
      { crop: "soybean", season: "kharif", areaHa: 2 },
      { crop: "wheat", season: "rabi", areaHa: 2 },
    ],
    recoveryTieUp: false,
  },
  sof: {
    soybean: { current: 43_100, previous: 42_000, source: "proxy-pmfby", scope: "state", ref: "pmfby" },
    wheat: { current: 50_000, source: "official", scope: "district", ref: "DLTC 2026" },
  },
  portfolio: [],
  officerLang: "en-IN",
  farmerLang: "hi-IN",
});
