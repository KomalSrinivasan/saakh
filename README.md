# Saakh (साख)

Saakh means credit, or trust, in Hindi. It is an installable web app that helps a cooperative bank, RRB or PACS officer appraise a Kisan Credit Card loan under the RBI KCC Directions, 2026 (issued 19 Jun 2026, applying to loans sanctioned from 1 Jan 2027).

The officer photographs the farmer's land record and records the crop plan in the farmer's own language. AI reads both and turns them into fields the officer confirms. A deterministic rules engine on the phone then computes every rupee and tags each step with the RBI paragraph behind it. An appraisal agent checks the case for risks, tries what-if changes and writes a recommendation, and a harness of deterministic checks verifies that report before the officer sees it.

The officer gets a sanction note in their language, plays a spoken summary to the farmer in theirs, and approves, edits or rejects. Every step goes into a hash-chained audit log that anyone can verify.

Live demo: https://saakh.komalvardhan.com (the older https://saakh.loop-dev.workers.dev still works)

Built for BUILD 2036 (TiE Global Summit 2026 x Hack2skill).

## Screenshots

| Home and guided demo | Limit with RBI paragraphs | Officer decision | Audit chain verified | Validation pack |
|---|---|---|---|---|
| ![Home](docs/screenshots/01-home.png) | ![Result](docs/screenshots/02-result.png) | ![Decision](docs/screenshots/03-decision.png) | ![Audit](docs/screenshots/04-audit-verified.png) | ![Validate](docs/screenshots/05-validate.png) |

| Agent on a suspicious case | Agent report, 8/8 checks | Hindi run on an Android phone |
|---|---|---|
| ![Agent risks](docs/screenshots/06-agent-risks.png) | ![Agent report](docs/screenshots/07-agent-report.png) | ![Phone, Hindi](docs/screenshots/08-phone-hindi-trace.png) |

## What it does

| Feature | Detail |
|---|---|
| Land record reading | Photo of a khasra, B1, khatauni, 7-12, pahani or patta. Two readers run in parallel: Sarvam Vision OCR followed by Claude structuring, and Claude vision on the photo. Each field shows whether both readers agree. Acre and bigha convert to hectares. Aadhaar is cut to the last 4 digits. |
| Crop plan by voice | The farmer speaks in any of 22 Indian languages or English (Sarvam Saaras v4). Claude maps local crop names like chana or sarson to Scale of Finance crops and asks follow-ups when area or season is missing. |
| Cited limit | Year 1 to year 6 short-term limits, the KCC limit, collateral position, Flexi KCC and tenancy-proof checks. Each line shows its RBI paragraph. |
| Appraisal agent | Claude Sonnet 5.5 runs a tool loop over 7 deterministic tools and streams its trace to the screen. It recommends approve, review or decline, lists risks, and asks the officer questions when the evidence cannot settle something. The officer answers and re-runs it. |
| Risk checks | 17 deterministic rules, including name mismatch across Devanagari and Latin spellings, Aadhaar mismatch, the same survey number backing another case, cropped area over the holding, implausible crop for the season or district, proxy or missing Scale of Finance, and tenancy documents. |
| What-ifs | The engine re-runs with one change each: a recovery tie-up, the smallest cut that brings the limit under ₹2 lakh, a pump-set term loan, the PMFBY premium, or dropping crops with no Scale of Finance. |
| Harness | 8 checks run on every agent report: every rupee came from a tool, the result is the engine's output, no approve over an engine error or a high risk, no rule finding dropped, decline has a reason, summary present, required tools ran. One repair turn, then the report is downgraded to review. |
| Sanction note | Drafted in the officer's language and streamed, so text appears in about 1.5 s. Every rupee figure is checked against the engine output before the officer can copy or act on it. |
| Farmer summary | Translated into the farmer's language and read aloud with Sarvam Bulbul v3. |
| Officer decision | Approve, edit or reject. Edit and reject need a written reason. A decided case is locked. |
| Audit log | SHA-256 hash chain on the device. Every agent run is logged with its recommendation, checks passed, risk codes and models. "Verify chain" shows the first changed record. Export as JSON. |
| Scale of Finance | Bundled estimates for 5 MP districts, back-calculated from public PMFBY data and flagged "Estimate" everywhere. A bank uploads its official table as CSV. |
| Validation pack | `/validate` runs 19 hand-computed RBI cases, 10 land-record samples and one crop plan in 13 languages. |
| Demo and Real mode | Chosen at first run, switchable any time. Demo mode loads three sample farmers (a clean case, an approved case, and a suspicious one that triggers double financing and a name mismatch), sample land records and voice clips, and a six-step "How Saakh works" walkthrough. Real mode has nothing pre-filled and nothing sample. Switching never deletes cases. |
| Install as an app | "Install app" button on Android and desktop Chrome, an Add to Home Screen hint on iPhone. The service worker caches the app shell so it opens offline, and drafts stay on the device if the network drops. |

## Languages

| What | Coverage |
|---|---|
| Farmer speech in | 22 Indian languages and English (Saaras v4) |
| Text translation | 22 Indian languages (Mayura for 11, Sarvam-Translate for the rest) |
| Voice output and UI | 11 languages |

Right-to-left scripts (Urdu, Kashmiri, Sindhi) render per paragraph, so mixed Urdu and English text reads in the right direction.

## Architecture

![System architecture](docs/architecture-system.png)

The interactive version is [docs/architecture.html](docs/architecture.html). It is one offline file with four tabs (system architecture, officer flow, appraisal agent, trust guardrails) and a step-by-step walkthrough. Static images of each tab: [system](docs/architecture-system.png), [officer flow](docs/architecture-flow.png), [appraisal agent](docs/architecture-agent.png), [trust guardrails](docs/architecture-trust.png).

## How it works

1. The officer opens a case and photographs the land record. The phone sends the image to `/api/ai/land`. Two readers run in parallel: Sarvam Vision OCR with Claude structuring the text, and Claude vision on the photo. Saakh reconciles the two field by field. Where they disagree, the field is marked and the agent later raises a `READ_DISAGREE` risk.
2. The farmer speaks the crop plan. `/api/ai/crops` transcribes it with Saaras v4 and has Claude turn it into crop lines (crop, season, area). If a season claims more land than the record shows, Saakh asks instead of accepting it.
3. The officer confirms or edits every field. Nothing reaches the engine before this.
4. `src/lib/kcc.ts` computes the limits on the device. It is pure TypeScript with no network calls and no model calls.
5. `/api/agent` runs the appraisal agent (Vercel AI SDK v7 `ToolLoopAgent`, Claude Sonnet 5.5). Its tools are `lookup_sof`, `compute_kcc`, `run_risk_checks`, `check_crop_plan`, `what_if`, `ask_officer` and `finish`. The tools take the case evidence only, so the model cannot pass a number in. The trace streams to the screen as it runs.
6. The harness (`src/lib/harness.ts`) verifies the report. The result, the what-ifs and the rule risks in the report come from tool outputs, not from the model. If a check fails, the agent gets one repair turn. If it still fails, the recommendation becomes review and the summary is replaced with a template.
7. The agent writes in English. After the harness passes, Sarvam translates the summary, risks and what-ifs into the officer's language. A translation is kept only if it contains the same set of numbers as the English text. Otherwise the English is shown. Questions for the officer are also given in the farmer's language with read-aloud.
8. `/api/ai/note` drafts the sanction note from the engine result. Any rupee figure the engine did not produce triggers one redraft, then a refusal. The farmer summary is translated and spoken.
9. The officer decides. Every step, including each AI call, each agent run and the models that served them, is appended to the audit chain. Agent runs record the recommendation, checks passed, risk codes and models, not the raw evidence.

API keys live only on the server. Cases and the audit log live in the browser's local storage. There is no server database. The app runs on Cloudflare Workers through OpenNext.

### Example: a constructed fraud case

I built a case where the applicant's name differs from the owner on the land record and the survey number already backs an approved case on the device. The agent returns Review with two high risks, `NAME_MISMATCH` and `DOUBLE_FINANCING`, and the harness passes 8 of 8 checks. A run takes about 13 to 18 seconds on the live deployment.

## Quick start

Needs Node 26 and pnpm 10.

```bash
pnpm i
```

Create `.env.local` in the repo root:

```bash
SARVAM_API_KEY=your-sarvam-key
ANTHROPIC_API_KEY=your-anthropic-key
# optional, only for keys not scoped to a workspace
ANTHROPIC_WORKSPACE_ID=
```

Run it:

```bash
pnpm dev     # http://localhost:3000
pnpm test    # 93 unit tests: engine, SoF, audit, storage, validation, AI helpers, risk, harness, agent loop
```

Without keys the app still runs. The engine, risk rules, what-ifs, audit log, Scale of Finance page and calculation part of the validation pack work offline, and every AI step offers manual entry. The agent needs the Anthropic key.

Sample inputs are in `public/samples/`: `khasra-1.jpg` to `khasra-10.jpg`, `crop-plan-<hi|en|mr|gu|te|ta>.wav`, `crop-plans.json` and `sof-sehore.csv`. The full test walkthrough is in [specs/001-kcc-appraisal-agent/quickstart.md](specs/001-kcc-appraisal-agent/quickstart.md).

## Testing status

| Check | Result |
|---|---|
| Unit tests (`pnpm test`) | 93 / 93 pass |
| Calculation, 19 hand-computed RBI cases | 19 / 19 pass, on device |
| Land-record extraction, 10 synthetic records | 10 / 10 pass on the live deployment |
| Language parity, one crop plan in 13 languages | 13 / 13 pass on the live deployment |
| Real Android phone (Samsung, Chrome) | Demo and real mode, compute, agent on the suspicious case (8/8 checks), Hindi sanction note, decision and install as an app work end to end |

Parity covers Hindi, English, Marathi, Gujarati, Telugu, Tamil, Bengali, Kannada, Malayalam, Odia, Punjabi, Urdu and Assamese. The last seven transcripts were machine-translated with Sarvam from an English plan that writes areas as numerals. They are not from native speakers.

On the phone, install works: Android builds a real app from it and it opens full screen. I have not yet tested the camera and microphone on the device.

## Project structure

```text
src/
  app/
    page.tsx                 case list, new case, guided demo
    case/[id]/page.tsx       land -> crops -> confirm -> limit + agent -> note -> decision
    sof/page.tsx             Scale of Finance table and CSV upload
    validate/page.tsx        validation pack
    api/ai/[action]/route.ts land | crops | note | tts | translate (server, holds keys)
    api/agent/route.ts       appraisal agent, streams its trace
  components/case/           capture, result, agent, risk, what-if, note/decision and audit panels
  lib/
    kcc.ts                   RBI rules engine
    risk.ts                  17 deterministic risk rules
    names.ts                 transliteration + Jaro-Winkler name matching
    reconcile.ts             merges the two land-record reads
    whatif.ts                one-change engine re-runs
    harness.ts               verifiers for the agent report
    agent/                   tool loop, tools, model, client
    audit.ts                 hash-chained audit log
    ai.ts, ai-pure.ts        Sarvam + Claude calls, figure check, Aadhaar masking
    sof.ts                   Scale of Finance table, CSV parsing
    store.ts, i18n.ts        on-device storage, UI languages
    validation.ts            validation pack runner
  data/
    sof-mp.json              MP proxy Scale of Finance (labelled)
    agronomy-mp.json         indicative crop calendar and district belts
    validation-set.json      calc cases, extraction and parity sets, open interpretations
    ui/*.json                UI copy per language
public/
  sw.js                      app-shell service worker
  samples/                   synthetic land records, crop-plan audio, sample SoF CSV
specs/001-kcc-appraisal-agent/  spec, plan, research, data model, API contract, tasks
docs/                        architecture diagram, impact case, screenshots
```

## RBI paragraphs implemented

All references are to the RBI KCC Directions, 2026 (FIDD.CO.FSD.BC.No.04/05.05.010/2026-27).

| Para | Rule in the engine |
|---|---|
| 6(5) | Land of 1 ha or less marks a marginal farmer |
| 8 | Six-year KCC tenure |
| 10 | KCC limit = year-6 short-term limit + long-term limit |
| 13(1)(i) | Scale of Finance x area, per crop |
| 13(1)(ii) | +10% for post-harvest and household consumption |
| 13(1)(iii) | +20% for repairs, maintenance and tech services |
| 13(1)(iv) | + crop insurance premium |
| 13(3) | SoF not yet notified: previous SoF + 10% |
| 13(4) | Crop with no SoF is outside KCC, flagged |
| 13(5) | Round to the nearest ₹1,000 |
| 13(6) | +10% each year for six years |
| 13(7) | Flexi KCC of ₹10,000 to ₹50,000 for marginal farmers |
| 19 | Long-term (investment) limit |
| 23, 24 | Collateral-free up to ₹2,00,000, above that per bank policy |
| 25 | Collateral-free up to ₹3,00,000 with a recovery tie-up |
| 29 | Area per season cannot exceed land on record |
| 30 | Tenant proof: self-affidavit up to ₹50,000, local administration or panchayat certificate above |

Three readings of the text are not settled yet and are listed in the validation pack: the rounding order in the Annex I illustrations, whether thresholds are compared after rounding, and whether the para 30 cap applies to the full limit including the term loan.

## Data honesty

The Scale of Finance values bundled for Indore, Sehore, Ujjain, Dewas and Dhar are not official. Official MP 2026-27 tables were not available in machine-readable form, so I used PMFBY sum insured per hectare as a proxy. 28 of the 35 rows are state-level estimates because no district figure was found. Every row carries its source and the app labels it "proxy" on every screen. A bank should upload its official table before relying on any figure. `public/samples/sof-sehore.csv` is sample data for testing the upload, not a real DLTC table.

The crop calendar and district belts behind the plausibility rules are indicative. Only cotton, garlic, summer moong and soybean were checked against district sources. A plausibility flag asks the officer to look again. It never changes a limit.

All land records, voices and farmers in the samples are synthetic.

## License

MIT
