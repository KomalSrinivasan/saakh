import type { AgentRun } from "./agent/types.ts";
import type { CropLine, KccResult, SofEntry, Tenure } from "./kcc.ts";
import type { LangCode } from "./i18n.ts";

export interface OfficerProfile {
  name: string;
  institution: string;
  uiLang: LangCode;
}

export type CaseStatus = "draft" | "computed" | "approved" | "edited_approved" | "rejected";
export type Decision = {
  action: "approved" | "edited_approved" | "rejected";
  finalLimit: number;
  reason?: string;
  by: string;
  at: string;
};

export interface Case {
  id: string;
  createdAt: string;
  status: CaseStatus;
  district: string;
  farmer: { name: string; aadhaarLast4?: string; village: string; surveyNos: string[] };
  farmerLang: LangCode;
  officerLang: LangCode;
  landHa: number;
  tenure: Tenure;
  crops: CropLine[];
  insurancePremium?: number;
  termLoan?: number;
  recoveryTieUp: boolean;
  extracted: { land?: unknown; crops?: unknown; transcript?: string };
  sofSnapshot?: Record<string, SofEntry & { source: "official" | "proxy-pmfby"; scope: "district" | "state" }>;
  result?: KccResult;
  decision?: Decision;
  note?: { officer: string; farmer: string };
  agent?: AgentRun;
  demo?: boolean; // sample case, only listed in demo mode
}

export type AppMode = "demo" | "real";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const CASES_KEY = "saakh.cases";
export const PROFILE_KEY = "saakh.profile";
export const MODE_KEY = "saakh.mode";
export const LEGACY_DEMO_KEY = "saakh.demoCaseId";
const LOCKED: CaseStatus[] = ["approved", "edited_approved", "rejected"];
const NEXT: Record<CaseStatus, CaseStatus[]> = {
  draft: ["computed"],
  computed: ["draft", "approved", "edited_approved", "rejected"],
  approved: [],
  edited_approved: [],
  rejected: [],
};

export const isLocked = (c: Pick<Case, "status">) => LOCKED.includes(c.status);

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return NEXT[from].includes(to);
}

/** Returns a copy with the new status; throws on an illegal transition. */
export function transition(c: Case, to: CaseStatus): Case {
  if (!canTransition(c.status, to)) throw new Error(`Illegal case transition ${c.status} -> ${to}`);
  return to === "draft" ? { ...c, status: to, result: undefined, sofSnapshot: undefined, note: undefined } : { ...c, status: to };
}

/** Applies an input edit; a computed case drops back to draft, a locked case throws. */
export function editInputs(c: Case, patch: Partial<Omit<Case, "id" | "createdAt" | "status" | "result" | "decision">>): Case {
  if (isLocked(c)) throw new Error(`Case ${c.id} is locked`);
  const base = c.status === "computed" ? transition(c, "draft") : c;
  return { ...base, ...patch };
}

/** Records the officer decision on a computed case; reason required when the limit changes. */
export function decide(c: Case, d: Omit<Decision, "at"> & { at?: string }): Case {
  if (!c.result) throw new Error("Case has no result");
  if (d.action !== "approved" && !d.reason?.trim()) throw new Error("Reason required");
  if (d.action === "approved" && d.finalLimit !== c.result.kccLimit) throw new Error("Use edited_approved to change the limit");
  return { ...transition(c, d.action), decision: { ...d, at: d.at ?? new Date().toISOString() } };
}

/** Keeps only the last 4 digits of an Aadhaar number; throws if not 4 or 12 digits. */
export function maskAadhaar(input: string): string {
  const digits = input.replace(/\s/g, "");
  if (!/^(\d{4}|\d{12})$/.test(digits)) throw new Error("Aadhaar must be 12 digits or last 4");
  return digits.slice(-4);
}

export function newCase(init: Pick<Case, "district" | "farmerLang" | "officerLang"> & { farmer?: Partial<Case["farmer"]> }): Case {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "draft",
    district: init.district,
    farmer: { name: "", village: "", surveyNos: [], ...init.farmer },
    farmerLang: init.farmerLang,
    officerLang: init.officerLang,
    landHa: 0,
    tenure: "owner",
    crops: [],
    recoveryTieUp: false,
    extracted: {},
  };
}

export function createStore(storage: StorageLike) {
  const read = (): Case[] => JSON.parse(storage.getItem(CASES_KEY) ?? "[]");
  const write = (cases: Case[]) => storage.setItem(CASES_KEY, JSON.stringify(cases));

  return {
    listCases: (): Case[] => read().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    getCase: (id: string): Case | undefined => read().find((c) => c.id === id),
    saveCase(c: Case): Case {
      const a4 = c.farmer.aadhaarLast4;
      if (a4 !== undefined && !/^\d{4}$/.test(a4)) throw new Error("aadhaarLast4 must be exactly 4 digits");
      const cases = read();
      const i = cases.findIndex((x) => x.id === c.id);
      if (i >= 0 && isLocked(cases[i])) throw new Error(`Case ${c.id} is locked`);
      if (i >= 0) cases[i] = c;
      else cases.push(c);
      write(cases);
      return c;
    },
    deleteCase(id: string): void {
      write(read().filter((c) => c.id !== id));
    },
    /** Pre-flag demo cases are recognised by the legacy demo id key. */
    isDemo: (c: Case) => !!c.demo || c.id === storage.getItem(LEGACY_DEMO_KEY),
    getMode: (): AppMode | null => {
      const m = storage.getItem(MODE_KEY);
      return m === "demo" || m === "real" ? m : null;
    },
    saveMode: (m: AppMode) => storage.setItem(MODE_KEY, m),
    getProfile: (): OfficerProfile | null => JSON.parse(storage.getItem(PROFILE_KEY) ?? "null"),
    saveProfile(p: OfficerProfile): OfficerProfile {
      const n = p.name.trim().length;
      if (n < 2 || n > 60) throw new Error("Officer name must be 2 to 60 characters");
      storage.setItem(PROFILE_KEY, JSON.stringify(p));
      return p;
    },
  };
}

const noStorage: StorageLike = { getItem: () => null, setItem: () => {} };
/** localStorage in the browser, a no-op store during SSR. */
export const browserStorage = (): StorageLike => (typeof window === "undefined" ? noStorage : window.localStorage);
const store = () => createStore(browserStorage());

/** Cases of the current mode only: demo cases in demo mode, the officer's own cases otherwise. */
export function listCases(): Case[] {
  const s = store();
  const demo = s.getMode() === "demo";
  return s.listCases().filter((c) => s.isDemo(c) === demo);
}
export const isDemoCase = (c: Case) => store().isDemo(c);
export const getMode = () => store().getMode();
export const saveMode = (m: AppMode) => store().saveMode(m);
export const getCase = (id: string) => store().getCase(id);
export const saveCase = (c: Case) => store().saveCase(c);
export const deleteCase = (id: string) => store().deleteCase(id);
export const getProfile = () => store().getProfile();
export const saveProfile = (p: OfficerProfile) => store().saveProfile(p);
