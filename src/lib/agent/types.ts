// Shared contract for the Saakh appraisal agent: evidence in, streamed trace events and a verified report out.
import type { InferUITools, UIMessage } from "ai";
import type { CropLine, KccInput, KccResult, SofEntry, Tenure } from "../kcc.ts";
import type { makeTools } from "./tools.ts";

export type Severity = "high" | "medium" | "low";

/** One land field as read by two independent readers. */
export interface ReadField<T> {
  value: T;
  agree: boolean; // both readers gave the same value (after normalising)
  reads: { source: "sarvam-vision" | "claude-vision"; value: T | null }[];
}

export interface LandEvidence {
  ownerName: ReadField<string>;
  village: ReadField<string>;
  surveyNos: ReadField<string[]>;
  areaHa: ReadField<number | null>;
  aadhaarLast4: ReadField<string | null>;
  areaUnitSeen: "hectare" | "acre" | "bigha";
}

export interface CaseEvidence {
  caseId: string;
  district: string;
  applicant: { name: string; village: string; surveyNos: string[]; aadhaarLast4?: string };
  landHa: number;
  tenure: Tenure;
  crops: CropLine[];
  insurancePremium?: number;
  termLoan?: number;
  recoveryTieUp: boolean;
  land?: LandEvidence; // from the dual-read land step, if a photo was captured
  transcript?: { text: string; lang: string }; // as spoken, in the farmer language
}

export type SofTable = Record<string, SofEntry & { source: "official" | "proxy-pmfby"; scope: "district" | "state"; ref?: string }>;

/** Other cases on this device, for double-financing checks. */
export interface PortfolioEntry {
  caseId: string;
  farmerName: string;
  village: string;
  district: string;
  surveyNos: string[];
  status: string;
  kccLimit?: number;
}

export interface Risk {
  code: string; // e.g. NAME_MISMATCH, DOUBLE_FINANCING, CROP_SEASON_IMPLAUSIBLE
  severity: Severity;
  title: string;
  detail: string;
  evidence: string[];
  para?: string;
  source: "rule" | "agent";
}

export interface WhatIf {
  id: string;
  label: string; // e.g. "Add a recovery tie-up with the dairy"
  change: Partial<KccInput>;
  kccLimit: number;
  delta: number; // kccLimit minus the base limit
  collateralFree: boolean;
  para?: string;
  note: string;
}

export interface Check {
  verifier: string; // e.g. figures_from_engine, no_approve_with_errors
  ok: boolean;
  detail: string;
}

export interface Question {
  id: string;
  text: string; // officer language
  why: string;
  askFarmer?: string; // same question in the farmer's language, if translated
}

export interface AgentRequest {
  evidence: CaseEvidence;
  sof: SofTable;
  portfolio: PortfolioEntry[];
  officerLang: string;
  farmerLang: string;
  answers?: { questionId: string; question: string; answer: string }[];
}

export interface AgentReport {
  recommendation: "approve" | "review" | "decline";
  confidence: "high" | "medium" | "low";
  summary: string; // officer language, every rupee figure from the engine
  result: KccResult; // from the compute_kcc tool, never from the model
  risks: Risk[];
  whatIfs: WhatIf[];
  questions: Question[];
  checks: Check[];
  models: string[];
  steps: number;
  ms: number;
}

export type { AgentTool } from "./tools.ts";

/** Stored on the case after a run (trace kept for the audit and the UI). */
export interface AgentRun {
  at: string;
  report: AgentReport;
  trace: SaakhAgentUIMessage["parts"]; // UI message parts from useChat
  toolMs?: Record<string, number>; // client-measured duration per toolCallId
}

// ---- AI SDK UI stream contract (POST /api/agent, consumed with useChat<SaakhAgentUIMessage>) ----

/** Custom data parts, streamed as `data-<name>` chunks. */
export type SaakhDataParts = {
  plan: { steps: string[] }; // data-plan, once, before the first tool call
  note: { text: string }; // data-note, harness notes (ran a skipped tool, repair turn, downgrade)
  question: Question; // data-question, each question queued by ask_officer
  check: Check; // data-check, each harness verifier result
  report: AgentReport; // data-report, last part: the verified report
};

/** Typed tool parts: `tool-<AgentTool>` with input/output per tool. */
export type SaakhTools = InferUITools<ReturnType<typeof makeTools>>;

export type SaakhAgentUIMessage = UIMessage<never, SaakhDataParts, SaakhTools>;
