// Demo-mode sample cases: a clean walkthrough, an approved case, and a suspicious case that reuses its land.
import { append } from "./audit.ts";
import type { LangCode } from "./i18n.ts";
import { computeKcc } from "./kcc.ts";
import { reconcileLand, type RawLand } from "./reconcile.ts";
import { sofSnapshot, toEngineSof } from "./sof.ts";
import { browserStorage, createStore, decide, newCase, transition, type Case } from "./store.ts";

export type DemoKind = "walkthrough" | "suspicious" | "approved";
export const DEMO_IDS_KEY = "saakh.demoCases";
const DISTRICT = "Sehore";

// Same values as public/samples/land-expected.json records 1 and 2 (fictional).
const KHASRA_1: RawLand = { ownerName: "रामप्रसाद पटेल", village: "खजूरिया कलां", surveyNos: ["214/1"], areaHa: 2, aadhaarLast4: "4821", areaUnitSeen: "hectare" };
const KHASRA_2: RawLand = { ownerName: "सुनीता बाई कुशवाहा", village: "देवपुरा", surveyNos: ["112/3"], areaHa: 1.5, aadhaarLast4: "7390", areaUnitSeen: "hectare" };

const landFrom = (r: RawLand) => ({ ...r, evidence: reconcileLand(r, r) });
// Real timestamps (minutes apart) so case dates match the audit log written when the demo loads.
const minsAgo = (m: number, now: number) => new Date(now - m * 60_000).toISOString();

/** Pure builders; the approved case is computed by the real engine and decided by a named sample officer. */
export function buildDemoCases(officerLang: LangCode, now = Date.now()): Record<DemoKind, Case> {
  const base = (farmerLang: LangCode, farmer: Partial<Case["farmer"]>) => ({ ...newCase({ district: DISTRICT, farmerLang, officerLang, farmer }), demo: true });

  const walkthrough: Case = {
    ...base("hi-IN", { name: "Ramprasad Patel", village: "Khajuriya Kalan", surveyNos: ["214/1"], aadhaarLast4: "4821" }),
    createdAt: minsAgo(0, now),
    landHa: 2,
    crops: [
      { crop: "soybean", season: "kharif", areaHa: 1.5 },
      { crop: "wheat", season: "rabi", areaHa: 1.2 },
      { crop: "gram", season: "rabi", areaHa: 0.3 },
    ],
    extracted: { land: landFrom(KHASRA_1) },
  };

  const crops2 = [
    { crop: "soybean", season: "kharif" as const, areaHa: 1.5 },
    { crop: "wheat", season: "rabi" as const, areaHa: 1.5 },
  ];
  const draft2: Case = {
    ...base("hi-IN", { name: "Sunita Bai Kushwaha", village: "Devpura", surveyNos: ["112/3"], aadhaarLast4: "7390" }),
    createdAt: minsAgo(3, now),
    landHa: 1.5,
    crops: crops2,
    extracted: { land: landFrom(KHASRA_2) },
  };
  const result = computeKcc({ landHa: 1.5, tenure: "owner", crops: crops2, sof: toEngineSof(DISTRICT), recoveryTieUp: false });
  const computed = transition({ ...draft2, sofSnapshot: sofSnapshot(DISTRICT), result }, "computed");
  const approved = decide(computed, { action: "approved", finalLimit: result.kccLimit, by: "Sample officer", at: minsAgo(2, now) });

  // Applicant is not the record owner, and survey 112/3 already backs the approved case.
  const suspicious: Case = {
    ...base("hi-IN", { name: "Mahesh Yadav", village: "Devpura", surveyNos: ["112/3"] }),
    createdAt: minsAgo(1, now),
    landHa: 1.5,
    crops: crops2,
    extracted: { land: landFrom(KHASRA_2) },
  };

  return { walkthrough, suspicious, approved };
}

const ls = () => browserStorage();
const readIds = (): Partial<Record<DemoKind, string>> => {
  try {
    return JSON.parse(ls().getItem(DEMO_IDS_KEY) ?? "{}");
  } catch {
    return {};
  }
};

/** Saves any missing demo case (with its audit trail) and returns all demo ids. */
export async function ensureDemo(officerLang: LangCode, actor: string): Promise<Record<DemoKind, string>> {
  const store = createStore(ls());
  const ids = readIds();
  const built = buildDemoCases(officerLang);
  for (const kind of ["approved", "walkthrough", "suspicious"] as const) {
    if (ids[kind] && store.getCase(ids[kind])) continue;
    const c = store.saveCase(built[kind]);
    ids[kind] = c.id;
    await append({ caseId: c.id, type: "created", actor, data: { district: c.district, demo: true } });
    if (kind === "approved" && c.result && c.decision) {
      const by = c.decision.by;
      await append({ caseId: c.id, type: "computed", actor: by, data: { demo: true, summary: { kccLimit: c.result.kccLimit, yearlyLimits: c.result.yearlyLimits } } });
      await append({ caseId: c.id, type: "decision", actor: by, data: { action: "approved", finalLimit: c.decision.finalLimit, recommended: c.result.kccLimit, demo: true } });
    }
  }
  ls().setItem(DEMO_IDS_KEY, JSON.stringify(ids));
  return ids as Record<DemoKind, string>;
}

/** Deletes demo cases only; the officer's own cases are never touched. */
export function clearDemo(): void {
  const store = createStore(ls());
  for (const c of store.listCases()) if (store.isDemo(c)) store.deleteCase(c.id);
  ls().setItem(DEMO_IDS_KEY, "{}");
}

export const demoIds = readIds;
