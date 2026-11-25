// Deterministic risk rules for a KCC case: land-record match, double financing, SoF provenance, crop plan.
import type { CaseEvidence, PortfolioEntry, Risk, Severity, SofTable } from "./agent/types.ts";
import { AFFIDAVIT_MAX, computeKcc, type CropLine, type Season } from "./kcc.ts";
import { inr } from "./ai-pure.ts";
import { lookupCrop } from "./sof.ts";
import { nameSimilarity } from "./names.ts";
import { normSurvey } from "./reconcile.ts";
import agronomy from "../data/agronomy-mp.json" with { type: "json" };

interface CropAgro {
  aliases?: string[];
  seasons: string[];
  rare: string[];
  districts: string[] | "*";
  ref: string;
  note?: string;
}
const AGRO = agronomy.crops as Record<string, CropAgro>;
const SOURCES = agronomy._sources as Record<string, string>;
const DISTRICT_ALIAS = agronomy.districtAliases as Record<string, string>;

const norm = (s: string) => s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
const normDistrict = (d: string) => DISTRICT_ALIAS[norm(d)] ?? norm(d);
const fmt = (n: number) => `${+n.toFixed(2)} ha`;
const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const FINANCED = new Set(["computed", "approved", "edited_approved"]);

const AGRO_ALIAS = new Map<string, string>();
for (const [k, v] of Object.entries(AGRO)) for (const a of [k, ...(v.aliases ?? [])]) AGRO_ALIAS.set(norm(a), k);

/** Canonical crop key from any spelling (SoF aliases first, then agronomy aliases). */
const cropKey = (crop: string) => lookupCrop(crop) ?? AGRO_ALIAS.get(norm(crop)) ?? norm(crop);

const risk = (code: string, severity: Severity, title: string, detail: string, evidence: string[], para?: string): Risk => ({
  code,
  severity,
  title,
  detail,
  evidence,
  ...(para ? { para } : {}),
  source: "rule",
});

/** Season and district plausibility of each crop line against MP agronomy data. */
export function checkCropPlan(district: string, crops: CropLine[]): Risk[] {
  const out: Risk[] = [];
  const d = normDistrict(district);
  for (const c of crops) {
    const key = cropKey(c.crop);
    const a = AGRO[key];
    if (!a) {
      out.push(risk("UNKNOWN_CROP", "medium", `${c.crop}: crop not in MP agronomy table`, "Season and district fit could not be checked; confirm the crop name with the farmer.", [`Crop: ${c.crop}`, `Season: ${c.season}`]));
      continue;
    }
    const src = SOURCES[a.ref] ?? a.ref;
    if (!a.seasons.includes(c.season)) {
      const rare = a.rare.includes(c.season);
      out.push(
        risk(
          "CROP_SEASON_IMPLAUSIBLE",
          rare ? "medium" : "high",
          `${c.crop} in ${c.season}: ${rare ? "uncommon" : "not grown"} in MP`,
          `${key} is normally a ${a.seasons.join(" / ")} crop in Madhya Pradesh.${a.note ? ` ${a.note}.` : ""} Confirm the season with the farmer.`,
          [`Crop: ${c.crop} (${c.areaHa} ha)`, `Declared season: ${c.season}`, `Normal season: ${a.seasons.join(", ")}`, `Source: ${src}`],
        ),
      );
    }
    if (a.districts !== "*" && !a.districts.includes(d))
      out.push(
        risk(
          "CROP_DISTRICT_UNUSUAL",
          "low",
          `${c.crop} is unusual in ${district}`,
          `${key} is mainly grown in ${a.districts.slice(0, 5).join(", ")}${a.districts.length > 5 ? " and nearby districts" : ""}. Not wrong, but worth a field check.`,
          [`District: ${district}`, `Crop: ${c.crop} (${c.areaHa} ha)`, `Source: ${src}`],
        ),
      );
  }
  return out;
}

/** Area per season with annual crops counted in every other declared season (same rule as computeKcc, para 29). */
export function seasonAreas(crops: CropLine[]): Map<Season, number> {
  const per = new Map<Season, number>();
  for (const c of crops) per.set(c.season, (per.get(c.season) ?? 0) + c.areaHa);
  const annual = per.get("annual") ?? 0;
  if (annual) for (const s of ["kharif", "rabi", "zaid"] as const) if (per.has(s)) per.set(s, per.get(s)! + annual);
  return per;
}

/** Sof key for a crop line, or undefined when the district table has no usable rate. */
export function sofKeyFor(crop: string, sof: SofTable): string | undefined {
  const want = [norm(crop), norm(cropKey(crop))];
  const k = Object.keys(sof).find((k) => want.includes(norm(k)));
  return k && (sof[k].current != null || sof[k].previous != null) ? k : undefined;
}

export function runRiskChecks(ev: CaseEvidence, portfolio: PortfolioEntry[], sof: SofTable): Risk[] {
  const out: Risk[] = [];
  const land = ev.land;
  const app = ev.applicant;

  if (!land) out.push(risk("LAND_NOT_VERIFIED", "medium", "Land record not verified", "No land record photo; area taken from applicant.", [`Applicant land: ${fmt(ev.landHa)}`]));
  else {
    const owner = land.ownerName.value;
    if (owner) {
      const sim = nameSimilarity(app.name, owner);
      if (sim < 0.85)
        out.push(
          risk("NAME_MISMATCH", sim < 0.75 ? "high" : "medium", "Applicant name does not match land owner", "The name on the land record differs from the applicant. Confirm identity or co-ownership before sanction.", [
            `Record: ${owner}`,
            `Applicant: ${app.name}`,
            `similarity ${sim.toFixed(2)}`,
          ]),
        );
    }
    const village = land.village.value;
    if (village && app.village && nameSimilarity(app.village, village) < 0.85)
      out.push(risk("VILLAGE_MISMATCH", "low", "Village differs from land record", "Applicant's village is not the village on the land record. Common for land held in a neighbouring village; confirm.", [`Record: ${village}`, `Applicant: ${app.village}`]));

    const rec = new Set(land.surveyNos.value.map(normSurvey));
    const notOn = app.surveyNos.filter((s) => !rec.has(normSurvey(s)));
    if (rec.size && notOn.length)
      out.push(risk("SURVEY_MISMATCH", "medium", "Survey number not on land record", "Applicant quoted survey numbers that are not on the photographed record.", [`Not on record: ${notOn.join(", ")}`, `Record: ${[...rec].join(", ")}`]));

    const area = land.areaHa.value;
    if (area != null && area > 0) {
      const gap = Math.abs(ev.landHa - area) / area;
      if (gap > 0.05)
        out.push(
          risk("AREA_MISMATCH", gap > 0.2 ? "high" : "medium", "Land area differs from record", "Cultivated area used for the limit differs from the area on the land record.", [
            `Record: ${fmt(area)}`,
            `Applicant: ${fmt(ev.landHa)}`,
            `difference ${Math.round(gap * 100)}%`,
          ]),
        );
    }

    const rAadhaar = land.aadhaarLast4.value;
    if (app.aadhaarLast4 && rAadhaar && app.aadhaarLast4 !== rAadhaar)
      out.push(risk("AADHAAR_MISMATCH", "high", "Aadhaar does not match land record", "Last 4 Aadhaar digits on the record differ from the applicant's.", [`Record: XXXX ${rAadhaar}`, `Applicant: XXXX ${app.aadhaarLast4}`]));

    const fields = [
      ["ownerName", "owner name", "high"],
      ["village", "village", "medium"],
      ["surveyNos", "survey numbers", "medium"],
      ["areaHa", "area", "high"],
      ["aadhaarLast4", "Aadhaar last 4", "medium"],
    ] as const;
    for (const [k, label, sev] of fields) {
      const f = land[k];
      if (f.agree || f.reads.length < 2) continue;
      out.push(risk("READ_DISAGREE", sev, `Two readers disagree on ${label}`, `The two independent reads of the land record give different ${label}. Check the original document.`, f.reads.map((r) => `${r.source}: ${JSON.stringify(r.value)}`)));
    }
    if (land.ownerName.reads.length === 1)
      out.push(risk("LAND_SINGLE_READ", "medium", "Land record read only once", "Only one reader returned the land record, so the fields could not be cross-checked.", [`Reader: ${land.ownerName.reads[0].source}`]));
  }

  for (const [season, a] of seasonAreas(ev.crops))
    if (a > ev.landHa + 1e-9)
      out.push(risk("AREA_OVERCLAIM", "high", `${season}: crop area exceeds land held`, "Crop area declared in a season cannot exceed land under cultivation.", [`${season} crops: ${fmt(a)}`, `Land: ${fmt(ev.landHa)}`], "29"));

  // Other farmers are named only by case reference: this evidence is sent to the model.
  const ref = (id: string) => id.slice(0, 8).toUpperCase();
  // Double financing: same survey number already financed in another case in the same district and village.
  const mine = new Set([...app.surveyNos, ...(land?.surveyNos.value ?? [])].map(normSurvey).filter(Boolean));
  const villages = [app.village, land?.village.value].filter(Boolean) as string[];
  const sameVillage = (v: string) => !v || !villages.length || villages.some((x) => nameSimilarity(x, v) >= 0.85);
  for (const p of portfolio) {
    if (p.caseId === ev.caseId || normDistrict(p.district) !== normDistrict(ev.district)) continue;
    const shared = p.surveyNos.filter((s) => mine.has(normSurvey(s)));
    if (FINANCED.has(p.status) && shared.length && sameVillage(p.village))
      out.push(
        risk("DOUBLE_FINANCING", "high", "Same land already financed in another case", "These survey numbers back another KCC case on this device. One parcel cannot carry two crop loans.", [
          `Survey no: ${shared.join(", ")}`,
          `Other case: ${ref(p.caseId)} (${p.village}, ${p.status}${p.kccLimit ? `, limit ${inr(p.kccLimit)}` : ""})`,
          `This case: ${app.name}, ${app.village}`,
        ]),
      );
    if (p.status !== "rejected") {
      const sim = nameSimilarity(app.name, p.farmerName);
      if (sim >= 0.9 && app.village && p.village && nameSimilarity(app.village, p.village) >= 0.85)
        out.push(risk("DUPLICATE_APPLICANT", "medium", "Applicant may already have a case", "A case for a farmer with the same name and village already exists. Check whether this is a renewal or a duplicate.", [`Other case: ${ref(p.caseId)} (${p.village}, ${p.status})`, `similarity ${sim.toFixed(2)}`]));
    }
  }

  const proxy: string[] = [];
  for (const c of ev.crops) {
    const k = sofKeyFor(c.crop, sof);
    if (!k) out.push(risk("SOF_MISSING", "medium", `${c.crop}: no Scale of Finance`, "No SoF notified for this crop in the district. Loan for this crop falls outside KCC.", [`Crop: ${c.crop} (${c.areaHa} ha)`, `District: ${ev.district}`], "13(4)"));
    else if (sof[k].source === "proxy-pmfby") proxy.push(`${k}: ${sof[k].scope} proxy${sof[k].ref ? `, ${sof[k].ref.split(" | ")[0]}` : ""}`);
  }
  if (proxy.length) out.push(risk("SOF_PROXY", "low", "SoF rate is a PMFBY-derived estimate", "Rate is back-calculated from PMFBY premium, not the DLTC-notified SoF. Replace with the bank's official SoF before sanction.", proxy));

  if (ev.tenure !== "owner") {
    const limit = computeKcc({ landHa: ev.landHa, tenure: ev.tenure, crops: ev.crops, sof, insurancePremium: ev.insurancePremium, termLoan: ev.termLoan, recoveryTieUp: ev.recoveryTieUp }).kccLimit;
    const small = limit <= AFFIDAVIT_MAX;
    const doc =
      ev.tenure === "tenant"
        ? "Lease or tenancy agreement, or tenancy entry in the land record."
        : small
          ? "Self-affidavit of land tilled is acceptable (loan up to ₹50,000)."
          : "Needs certificate from local administration / panchayat (loan above ₹50,000).";
    out.push(risk("TENANCY_DOCS", small ? "low" : "medium", `${ev.tenure.replace("_", " ")}: proof of cultivation needed`, doc, [`Tenure: ${ev.tenure}`, `KCC limit: ${inr(limit)}`], "30"));
  }

  out.push(...checkCropPlan(ev.district, ev.crops));
  return out.sort((x, y) => RANK[x.severity] - RANK[y.severity]);
}
