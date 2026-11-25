// Validation pack: pure scorers (unit-tested) plus browser runners that call /api/ai.
import { computeKcc, type CropLine, type KccInput, type Season } from "./kcc.ts";
import { asciiDigits } from "./ai-pure.ts";

export interface Failure {
  id: string;
  detail: string;
  expected?: string;
  actual?: string;
}

/** status: done = scored; unavailable = AI 503 or offline (reason says which); idle = never run. */
export interface CategoryResult {
  pass: number;
  total: number;
  failures: Failure[];
  status: "done" | "unavailable" | "idle";
  reason?: "ai" | "offline";
}

export interface ValidationRun {
  ranAt: string;
  calc: CategoryResult;
  extraction: CategoryResult;
  parity: CategoryResult;
  openInterpretations: string[];
}

export interface CalcCase {
  id: string;
  desc: string;
  input: Omit<KccInput, "crops"> & { crops: { crop: string; season: string; areaHa: number }[] };
  expected: {
    yearlyLimits: number[];
    shortTermYear6: number;
    termLoan: number;
    kccLimit: number;
    marginal: boolean;
    flexiEligible: boolean;
    collateralFree: boolean;
    flags: string[];
  };
}

export interface LandExpected {
  file: string;
  ownerName: string;
  surveyNos: string[];
  areaHa: number;
  aadhaarLast4: string | null;
}

export interface ValidationSet {
  calc: CalcCase[];
  extraction: { items: LandExpected[] };
  parity: { calcCase: string; expectedCrops: CropLine[]; transcripts: { lang: string; text: string }[] };
  openInterpretations: string[];
}

export interface LandResponse {
  fields?: { ownerName?: string | null; surveyNos?: string[] | null; areaHa?: number | null; aadhaarLast4?: string | null };
}
export interface CropsResponse {
  crops?: { crop: string; season: string; areaHa: number }[];
}

export const LAST_RUN_KEY = "saakh.validation.lastRun";
export const AREA_TOLERANCE = 0.02; // relative, extraction
export const CROP_AREA_TOLERANCE_HA = 0.05; // absolute, parity
const OWNER_SIMILARITY = 0.8;

export const idle = (total: number): CategoryResult => ({ pass: 0, total, failures: [], status: "idle" });
const fmt = (v: unknown) => (Array.isArray(v) ? v.join(", ") || "(none)" : v == null ? "(none)" : String(v));
const sameSet = (a: string[], b: string[]) => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
};

/** Runs every calc case through computeKcc and compares limits, eligibility and flags. */
export function runCalc(set: Pick<ValidationSet, "calc">): CategoryResult {
  const failures: Failure[] = [];
  let pass = 0;
  for (const c of set.calc) {
    const before = failures.length;
    try {
      const r = computeKcc({ ...c.input, crops: c.input.crops.map((x) => ({ ...x, season: x.season as Season })) });
      const flags = r.flags.map((f) => (f.code === "TENANCY_PROOF" ? `${f.code}:${f.level}` : f.code));
      const e = c.expected;
      const checks: [string, unknown, unknown][] = [
        ["yearlyLimits", e.yearlyLimits.join(","), r.yearlyLimits.join(",")],
        ["shortTermYear6", e.shortTermYear6, r.shortTermYear6],
        ["termLoan", e.termLoan, r.termLoan],
        ["kccLimit", e.kccLimit, r.kccLimit],
        ["marginal", e.marginal, r.marginal],
        ["flexiEligible", e.flexiEligible, r.flexiEligible],
        ["collateralFree", e.collateralFree, r.collateralFree],
      ];
      for (const [k, exp, got] of checks) if (exp !== got) failures.push({ id: c.id, detail: k, expected: fmt(exp), actual: fmt(got) });
      if (!sameSet(e.flags, flags)) failures.push({ id: c.id, detail: "flags", expected: fmt(e.flags), actual: fmt(flags) });
    } catch (err) {
      failures.push({ id: c.id, detail: `engine threw: ${(err as Error).message}` });
    }
    if (failures.length === before) pass++;
  }
  return { pass, total: set.calc.length, failures, status: "done" };
}

const squash = (s: string) => asciiDigits(s).normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** 1 - Levenshtein distance / longer length, on letters and digits only. */
export function similarity(a: string, b: string): number {
  const x = [...squash(a)];
  const y = [...squash(b)];
  if (!x.length && !y.length) return 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

const survey = (s: string) => asciiDigits(s).replace(/\s+/g, "");

/** Problems with one land extraction; empty array means pass. */
export function scoreLand(exp: LandExpected, res: LandResponse): Failure[] {
  const f = res.fields ?? {};
  const out: Failure[] = [];
  const id = exp.file.split("/").pop() ?? exp.file;
  const area = typeof f.areaHa === "number" ? f.areaHa : null;
  if (area == null || Math.abs(area - exp.areaHa) > exp.areaHa * AREA_TOLERANCE)
    out.push({ id, detail: "areaHa", expected: String(exp.areaHa), actual: fmt(area) });
  if (similarity(exp.ownerName, f.ownerName ?? "") < OWNER_SIMILARITY) out.push({ id, detail: "ownerName", expected: exp.ownerName, actual: fmt(f.ownerName) });
  const got = [...new Set((f.surveyNos ?? []).map(survey))];
  if (!sameSet(exp.surveyNos.map(survey), got)) out.push({ id, detail: "surveyNos", expected: fmt(exp.surveyNos), actual: fmt(f.surveyNos) });
  if ((exp.aadhaarLast4 ?? null) !== (f.aadhaarLast4 ?? null)) out.push({ id, detail: "aadhaarLast4", expected: fmt(exp.aadhaarLast4), actual: fmt(f.aadhaarLast4) });
  return out;
}

/** Problems with one language's crop plan: same crop+season set, each area within 0.05 ha. */
export function scoreCrops(id: string, expected: CropLine[], res: CropsResponse): Failure[] {
  const key = (c: { crop: string; season: string }) => `${c.crop.toLowerCase()}/${c.season}`;
  const got = new Map<string, number>();
  for (const c of res.crops ?? []) got.set(key(c), (got.get(key(c)) ?? 0) + c.areaHa);
  const want = new Map(expected.map((c) => [key(c), c.areaHa]));
  const line = (m: Map<string, number>) => [...m].map(([k, a]) => `${k} ${a} ha`).join(", ") || "(none)";
  const keysOk = sameSet([...want.keys()], [...got.keys()]);
  const areasOk = keysOk && [...want].every(([k, a]) => Math.abs((got.get(k) ?? 0) - a) <= CROP_AREA_TOLERANCE_HA + 1e-9);
  return areasOk ? [] : [{ id, detail: keysOk ? "areaHa" : "crops", expected: line(want), actual: line(got) }];
}

// ---- browser runners ----

export type Progress = (done: number, total: number) => void;
interface RunOpts {
  fetch?: typeof fetch;
  onProgress?: Progress;
  district?: string;
  officerLang?: string;
}

class Unavailable extends Error {}

async function post(fetcher: typeof fetch, action: string, body: FormData) {
  const res = await fetcher(`/api/ai/${action}`, { method: "POST", body });
  if (res.status === 503) throw new Unavailable();
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}

/** Runs jobs 3 at a time; any 503 marks the whole category unavailable. */
async function runJobs(jobs: { id: string; run: () => Promise<Failure[]> }[], onProgress?: Progress): Promise<CategoryResult> {
  const total = jobs.length;
  const failures: Failure[] = [];
  let pass = 0;
  let done = 0;
  let unavailable = false;
  let next = 0;
  onProgress?.(0, total);
  const worker = async () => {
    while (next < total && !unavailable) {
      const job = jobs[next++];
      try {
        // One retry for transient provider errors; a wrong answer is never retried.
        const f = await job.run().catch((e) => {
          if (e instanceof Unavailable) throw e;
          return job.run();
        });
        if (f.length) failures.push(...f);
        else pass++;
      } catch (e) {
        if (e instanceof Unavailable) unavailable = true;
        else failures.push({ id: job.id, detail: `request failed: ${(e as Error).message}` });
      }
      onProgress?.(++done, total);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (unavailable) return { ...idle(total), status: "unavailable", reason: "ai" };
  failures.sort((a, b) => a.id.localeCompare(b.id));
  return { pass, total, failures, status: "done" };
}

/** Posts each sample khasra image to /api/ai/land and scores the fields. */
export function runExtraction(set: Pick<ValidationSet, "extraction">, o: RunOpts = {}): Promise<CategoryResult> {
  const fetcher = o.fetch ?? globalThis.fetch.bind(globalThis);
  return runJobs(
    set.extraction.items.map((exp) => ({
      id: exp.file.split("/").pop() ?? exp.file,
      run: async () => {
        const img = await fetcher(exp.file);
        if (!img.ok) throw new Error(`sample ${exp.file} HTTP ${img.status}`);
        const form = new FormData();
        form.append("image", new File([await img.blob()], exp.file.split("/").pop() ?? "khasra.jpg", { type: "image/jpeg" }));
        form.append("district", o.district ?? "Sehore");
        form.append("officerLang", o.officerLang ?? "en-IN");
        return scoreLand(exp, await post(fetcher, "land", form));
      },
    })),
    o.onProgress,
  );
}

/** Posts each language transcript to /api/ai/crops and checks the same crop plan comes back. */
export function runParity(set: Pick<ValidationSet, "parity" | "calc">, o: RunOpts = {}): Promise<CategoryResult> {
  const fetcher = o.fetch ?? globalThis.fetch.bind(globalThis);
  const base = set.calc.find((c) => c.id === set.parity.calcCase)?.input;
  return runJobs(
    set.parity.transcripts.map((tr) => ({
      id: tr.lang,
      run: async () => {
        const form = new FormData();
        form.append("text", tr.text);
        form.append("farmerLang", tr.lang);
        form.append("officerLang", o.officerLang ?? "en-IN");
        form.append("district", o.district ?? "Sehore");
        form.append("landHa", String(base?.landHa ?? 1.5));
        form.append("crops", JSON.stringify(Object.keys(base?.sof ?? {})));
        return scoreCrops(tr.lang, set.parity.expectedCrops, await post(fetcher, "crops", form));
      },
    })),
    o.onProgress,
  );
}
