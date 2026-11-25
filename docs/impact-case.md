# Saakh impact case

Saakh helps a rural loan officer appraise a Kisan Credit Card loan under the new RBI rules in one sitting with the farmer. It produces a limit that is cited, risk-checked, explained in two languages and auditable. The officer makes every decision.

Live: https://saakh.komalvardhan.com

## The problem

From 1 January 2027, every fresh KCC sanction at commercial banks, small finance banks, RRBs and rural cooperative banks falls under the RBI KCC Directions, 2026, issued on 19 June 2026 ([RBI notification](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13522&Mode=0), [RBI Master Direction](https://rbi.org.in/ScriptS/BS_ViewMasDirections.aspx?id=13524)). Loans sanctioned earlier move to the new rules at renewal. The method for computing a limit is spelled out paragraph by paragraph: Scale of Finance times area per crop, fixed loadings for post-harvest needs and maintenance, insurance, rounding to ₹1,000, a 10% step-up each year across a six-year tenure, and separate rules for collateral, Flexi KCC and tenant farmers.

The people who apply these rules are PACS secretaries, DCCB and RRB branch officers, and cooperative bank loan officers. They work from land records in Hindi or the local script, crop plans the farmer describes out loud, and Scale of Finance tables that are often on paper. Four things go wrong.

**Workload.** The officer has to read the record, convert bigha or acre to hectares, look up the right Scale of Finance row for each crop and season, apply the loadings and the yearly step-up, then write a note. Every case repeats this by hand.

**Language.** The farmer explains the crop plan in Hindi, Marathi or another local language, and the officer writes the note in English or Hindi. Nothing in the process explains the final limit back to the farmer in the farmer's language.

**Consistency.** Two officers given the same file can arrive at different limits. They may use a different SoF row, round at a different step or count a long-duration crop twice. Without a cited calculation nobody can see where they diverged.

**Audit.** An inspector or NABARD reviewer needs to know which inputs were used, which rule produced each figure, who approved and whether the record changed afterwards. A paper file or a spreadsheet does not answer the last question.

I started with Madhya Pradesh, the summit's host state, and five districts in the soybean, wheat and gram belt: Indore, Sehore, Ujjain, Dewas and Dhar.

Wider context. These figures are reported, not verified by me:

| Figure | Source |
|---|---|
| About 351 DCCBs and StCBs and 43 RRBs are being linked to e-KCC and the PTPFC / ULI rails | [Inc42](https://inc42.com/?p=454075) |
| The NABARD-backed e-KCC portal has onboarded 300,000+ KCC applications | [FinDev Gateway](https://www.findevgateway.org/news/nabard-backed-agri-fintech-onboards-over-300000-kisan-credit-cards) |
| Agristack crossed 11 crore Farmer IDs in October 2026 | [Elets](https://egov.eletsonline.com/2026/10/farmer-id-11-crore-agristack-digital-agriculture-mission-target-ahead-of-schedule/) |
| Bankers name weak land records and slow adoption as the bottleneck for ULI scale-up | [Business Standard](https://www.business-standard.com/industry/news/big-banks-slow-adoption-weak-land-records-stall-uli-scale-up-bankers-125082700907_1.html) |

I did not find a sourced figure for total KCC accounts or the MP KCC portfolio, so this case does not claim a market size. I have not timed manual appraisals either, so I don't claim a before-and-after time saving.

## Who benefits

**Loan officers** get the arithmetic, unit conversion and SoF lookup done for them, with a paragraph citation next to every number they sign. An agent flags risks such as a name that does not match the land record or a survey number already financed, and shows what the limit would be with one change. The note arrives as a draft, and they approve, edit or reject it.

**Farmers** hear their limit explained in their own language, including how it grows each year and what documents to bring. They get the same limit for the same land and crops no matter which officer they meet.

**Banks** get consistent limits across branches, a structured case record and a tamper-evident log for each decision. They can load their own official Scale of Finance as a CSV.

**NABARD and regulators** get a record that shows inputs, engine version, rule reference, SoF source, every AI call and the officer's decision, chained so that any later edit is detectable.

## How Saakh solves it

The design rule: AI handles words, a deterministic engine handles numbers, and the officer decides. The agent follows the same rule. It plans and explains, but every figure and every risk it reports comes from a deterministic tool.

1. **Land record.** The officer photographs the record. Two readers run in parallel: Sarvam Vision OCR followed by Claude structuring, and Claude vision on the photo. Saakh reconciles owner, village, survey numbers, area and Aadhaar last 4 field by field, and each field shows whether both readers agree. A disagreement becomes a `READ_DISAGREE` risk.
2. **Crop plan.** The farmer speaks. Sarvam Saaras v4 transcribes the speech. Claude maps local crop names to SoF crops, assigns seasons and areas, and asks the officer a follow-up when something is missing or exceeds the land on record.
3. **Confirm.** The officer checks and edits every field. Nothing reaches the engine before this step.
4. **Compute.** `src/lib/kcc.ts` runs on the phone and implements paras 6, 8, 10, 13, 19, 23 to 25, 29 and 30. Every step carries its paragraph.
5. **Appraise.** An agent built on the Vercel AI SDK v7 (`ToolLoopAgent`) with Claude Sonnet 5.5 works through the case with 7 tools: `lookup_sof`, `compute_kcc`, `run_risk_checks`, `check_crop_plan`, `what_if`, `ask_officer` and `finish`. The tools take the case evidence only, so the model cannot pass a number in. Its trace streams to the screen.
   - **Risk rules.** 17 deterministic rules. They cover name mismatch across Devanagari and Latin spellings (transliteration plus Jaro-Winkler), Aadhaar, village and survey mismatch, double financing (the same survey number in the same village backing another case), cropped area over the holding, crop, season and district plausibility from an agronomy table, proxy or missing SoF, and tenancy documents (para 30).
   - **What-ifs.** Each one re-runs the engine with one change: a recovery tie-up (collateral-free to ₹3 lakh under para 25), the smallest cut that brings the limit under ₹2 lakh, a pump-set term loan (para 19), the PMFBY premium, and dropping crops that have no SoF.
   - **Questions.** When the evidence cannot settle something, the agent asks the officer. Each question is also shown in the farmer's language with read-aloud. The officer answers and re-runs the agent.
6. **Verify.** A harness runs 8 deterministic checks on every report: rupee figures come from tools, the result is the engine's output, no approve over an engine error, no approve over a high rule risk, every rule risk is kept, a decline has a high risk or engine error behind it, the summary is present, and the required tools ran. The report's result, what-ifs and rule risks are taken from tool outputs, not from the model. A failed check gets one repair turn. If it still fails, the recommendation is downgraded to review and the summary is replaced with a template.
7. **Officer's language.** The agent writes in English and the harness checks the figures. Sarvam then translates the summary, risks and what-ifs. A translation is kept only if its set of numbers equals the English one. Otherwise the officer sees the English.
8. **Explain.** Claude drafts the sanction note in the officer's language. Before the officer sees it, every rupee figure in the draft is matched against the engine output. One redraft is allowed, then the draft is refused. The farmer summary is translated with Sarvam Mayura or Sarvam-Translate and spoken with Bulbul v3.
9. **Decide and audit.** The officer approves, edits or rejects, and edits and rejections need a reason. Every step is appended to a SHA-256 hash chain on the device, including each agent run as an `agent_run` event with its recommendation, checks passed, risk codes and models. "Verify chain" shows the first changed record, and the whole case exports as JSON.

One example I ran on the live deployment: a constructed fraud case where the applicant's name differs from the record owner and the survey number already backs an approved case. The agent returned Review with `NAME_MISMATCH` and `DOUBLE_FINANCING` as high risks, the harness passed 8 of 8 checks, and runs took about 13 to 18 seconds.

Privacy is handled by keeping less data. Aadhaar is masked to the last 4 digits, photos and audio are not stored after extraction, API keys stay on the server, and cases stay on the officer's device. The audit log records what the agent concluded, not the raw evidence it read. The app runs on Cloudflare Workers through OpenNext.

The architecture diagram is in [architecture.html](architecture.html).

## Evidence of accuracy

The validation pack runs at `/validate` in the app, and anyone can rerun it.

| Check | Set | Result |
|---|---|---|
| Calculation accuracy | 19 hand-computed cases covering every implemented paragraph, thresholds, rounding edges, tenants, sugarcane, acre records and over-claimed area | **19 / 19 pass**, on device, no network |
| Land-record extraction | 10 synthetic land records (`public/samples/khasra-1..10.jpg`). Pass: area within 2%, owner name close match, survey numbers and Aadhaar last 4 exact. Target 9 of 10 | **10 / 10 pass** on the live deployment, 26 Nov 2026 |
| Language parity | One crop plan in Hindi, English, Marathi, Gujarati, Telugu, Tamil, Bengali, Kannada, Malayalam, Odia, Punjabi, Urdu and Assamese. Pass: same crops and seasons, each area within 0.05 ha. Run on the written transcripts; the spoken Marathi recording was checked separately through speech-to-text. The last seven transcripts were machine-translated with Sarvam from an English plan that writes areas as numerals | **13 / 13 pass** on the live deployment, 26 Nov 2026 |
| Unit tests | `pnpm test` over engine, SoF parsing, audit chain, storage, validation runner, AI helpers, name matching, read reconciliation, risk rules, what-ifs, harness and the agent loop | **94 / 94 pass** |
| Real device | Samsung Android phone, Chrome: profile, demo case, compute, agent, Hindi sanction note and decision, end to end | Works. Camera, microphone and install-to-home-screen not yet tested on the device |

The audit tests also confirm that verification fails when an event is altered, removed, reordered, or altered and then rehashed.

## Scale path

**Every KCC lender.** The Directions cover commercial banks, small finance banks, RRBs and rural cooperative banks, so the same engine applies to all of them. The realistic route to small lenders is through the platform vendors that already serve them, such as the e-KCC portal.

**Every state.** Rules are national. Scale of Finance is the only district-specific input, and a bank loads its own table as a CSV (district, crop, season, current, previous, ref). No code change is needed to cover a new state.

**Every language.** Speech input already covers 22 Indian languages plus English. Text translation covers all 22, with Mayura for 11 and Sarvam-Translate for the rest. Voice output and the UI cover 11 languages today. Right-to-left scripts (Urdu, Kashmiri, Sindhi) render per paragraph.

**Next steps after a pilot agreement:** connect to land-record and Farmer ID APIs instead of photos, add a branch renewal sweep that flags existing accounts moving to the new rules, and move the audit log to bank-controlled storage.

## Where Saakh fits

KCC lending is already being digitised. Saakh does not compete with that plumbing. It adds the step the plumbing leaves to the officer: appraising the case under the new rules.

| What exists | What it does | Where Saakh fits |
|---|---|---|
| NABARD e-KCC portal (built by 24x7 Moneyworks; over 3 lakh KCC applications onboarded at cooperative banks and RRBs) | Digital loan origination: application, documents, workflow, disbursal | Saakh computes and checks the limit inside that workflow, cited to the 2026 Directions, and hands back the figures and the audit trail |
| e-PACS ERP (about 61,000 PACS computerised by Feb 2026) | Accounts, membership, deposits, loan ledger for PACS | The PACS secretary is Saakh's main user. Saakh runs on the same phone or PC and exports the case as JSON for the ERP. |
| RBIH Public Tech Platform for Frictionless Credit / ULI, state land-record APIs | Fetches land records and other data by consent | Replaces Saakh's photo step once a bank has access. The engine, risk rules and audit log stay the same. |
| Satellite and alternative-data underwriters (e.g. SatSure, Samunnati, Jai Kisan) | Scores the farm or the farmer from imagery and history | Different question. They estimate risk; Saakh computes the regulated limit and checks the file. A bank can use both. |

Nothing I found computes a KCC limit to the paragraphs of the RBI KCC Directions, 2026, explains it to the farmer in their language, and leaves a record an inspector can verify. Every lender has to change its limit calculation by 1 January 2027, and that is the gap Saakh fills.

## Business model

These are working assumptions, not validated with a bank yet.

- **Who pays:** the lender, not the farmer. A DCCB or state cooperative bank buys Saakh for its PACS and branches. RRBs and small finance banks buy it per branch.
- **How:** an annual licence per PACS or branch, sold through the channels that already reach them: state cooperative banks, NABARD's digitisation programmes and the e-KCC and ERP vendors.
- **Size of the first market:** about 61,000 computerised PACS plus the branches of 28 RRBs and about 350 DCCBs. At an illustrative ₹6,000 per PACS per year, PACS alone would be about ₹37 crore a year.
- **Costs:** the engine runs on the device. Model and speech calls cost a few rupees per case at current Claude and Sarvam prices, and a bank can choose its own model providers.
- **Why now:** the Directions apply to every fresh sanction from 1 January 2027, and every renewal after that moves to the new method. Lenders need the change done before then.

## 2036 vision

By 2036 I want every KCC sanction in India to come with a machine-checkable trail. That means the inputs, the rule paragraph behind each rupee, the model calls that read the documents and the officer who signed. The farmer should hear the explanation in their own language before signing. Lenders and regulators should be able to rerun any decision and get the same number. If AI agents become a normal part of credit, something has to hold them to account. I think that is a deterministic engine with cited rules and a human sign-off, and that is what Saakh builds.

## Honest limitations

- **Proxy Scale of Finance.** The bundled MP values are PMFBY sum-insured proxies, not official DLTC tables, and 28 of 35 rows are state-level estimates. The app labels them "Estimate" on every screen. Real use requires the bank's official table.
- **Prototype.** It has been tested only on synthetic data, with no bank pilot yet. On a real Android phone I have tested the flow end to end, but not the camera, the microphone or install-to-home-screen.
- **Indicative risk rules.** The risk rules and the agronomy belts behind the crop plausibility checks are indicative. Only cotton, garlic, summer moong and soybean belts were checked against district sources. A flag asks the officer to look again and never changes a limit.
- **Agent recommendation varies.** The same case can come back approve on one run and review on the next. The harness bounds this, since it blocks approve over a high risk or engine error and keeps every rule finding, but it does not make the recommendation repeatable. The limit itself comes from the engine and does not vary.
- **Machine-made parity transcripts.** Seven of the 13 parity transcripts (Bengali, Kannada, Malayalam, Odia, Punjabi, Urdu, Assamese) were machine-translated from English with numeral areas, so they are cleaner than real farmer speech.
- **On-device storage.** Cases and the audit log live in one browser's local storage. Clearing the browser clears them. There is no multi-device sync or server backup, and retention policy is still open.
- **Open RBI interpretations.** These are listed in `src/data/validation-set.json` until confirmed against the RBI Annex I illustrations:
  1. Annex I rounding order: unrounded compounding, rounded per year (C01, C02).
  2. Collateral-free and affidavit thresholds compared after rounding to nearest 1,000 (C07, C09).
  3. Para 30 affidavit cap compared against full CMPL incl. term loan, not year-1 limit.
- **Area units.** Bigha converts at the MP figure of 0.1115 ha. Local bigha sizes vary, so Saakh asks the officer to confirm.
- **AI availability.** Extraction, the agent and drafting depend on Sarvam and Anthropic APIs. When they fail, every step falls back to manual entry and the engine still computes the limit, but the officer loses the speed-up and the agent's risk review.
