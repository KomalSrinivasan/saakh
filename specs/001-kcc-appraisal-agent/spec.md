# Feature Specification: Saakh KCC Appraisal Agent

**Feature Branch**: `001-kcc-appraisal-agent`

**Created**: 2026-11-25

**Status**: Draft

**Input**: User description: "Full Saakh KCC appraisal agent for cooperative bank, RRB and PACS officers: land-record photo extraction, farmer voice crop plan in any language, Scale of Finance table (PMFBY sum-insured proxy for MP districts, labelled, bank can upload real table), deterministic limit via the existing KCC rules engine, agent follow-up questions for missing data, sanction note in officer and farmer language with text-to-speech, officer approve/edit, audit log, validation-pack page (calculation accuracy, extraction accuracy, language parity), deployed installable app with a public demo link for BUILD 2036 (due 30 Nov 2026). Existing work: rules engine with 10 passing tests."

## Clarifications

### Session 2026-11-25

- Q: Where are cases and audit records stored in the prototype? → A: On the officer's device (local storage with hash-chained audit), exportable as a JSON file; no central database in v1.
- Q: Which districts and crops does the default SoF dataset cover? → A: Indore, Sehore, Ujjain, Dewas and Dhar (MP); soybean, maize, cotton (kharif), wheat, gram, mustard (rabi), sugarcane (long duration); PMFBY sum insured per hectare labelled as proxy.
- Q: How does an officer identify themselves? → A: Named officer profile selected on the device, no password; profile name recorded on every audit event.
- Q: How fast must AI steps respond? → A: Photo or voice extraction returns within 20 seconds; limit calculation is instant (under 1 second).
- Q: Which languages are verified for parity beyond Hindi and English? → A: Marathi, Gujarati, Telugu and Tamil; other supported languages work but are not part of the parity test set.

### Amendment 2026-11-26

- Added US7 (appraisal agent) and US8 (land record read twice), FR-017 to FR-025, SC-009 to SC-012, new key
  entities and edge cases to match the built intelligence layer. Parity scope extended to 13 languages
  (SC-012). Earlier sections are unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compute a KCC limit under the 2027 rules (Priority: P1)

A loan officer at a cooperative bank, RRB or PACS enters (or confirms) a farmer's district, land under
cultivation, tenure type and crop plan by season. Saakh shows the year-wise short-term limits for the six-year
tenure, the composite KCC limit, Flexi KCC eligibility, collateral status and tenancy-proof needs, with every
figure linked to the RBI KCC Directions, 2026 paragraph that produced it.

**Why this priority**: This is the core value. Every bank must re-do limit fixation for loans sanctioned from
1 Jan 2027, and an officer can use this screen alone even with no AI features.

**Independent Test**: Enter a known case (2 ha, soybean kharif + wheat rabi, district SoF, insurance premium)
and confirm the year-1 limit of ₹1,72,000 and KCC limit of ₹2,76,000 with paragraph citations.

**Acceptance Scenarios**:

1. **Given** a farmer with 2 ha, soybean in kharif and wheat in rabi with notified SoF, **When** the officer
   computes, **Then** Saakh shows six yearly limits rounded to the nearest ₹1,000, the KCC limit, and a
   citation for each step.
2. **Given** a crop whose SoF is not notified this season but was notified last season, **When** computing,
   **Then** Saakh applies last season's SoF plus 10% and shows a notice citing para 13(3).
3. **Given** a crop absent from the district SoF table, **When** computing, **Then** that crop is excluded and
   flagged as outside KCC (para 13(4)).
4. **Given** crop areas in one season that exceed the land on record, **When** computing, **Then** Saakh blocks
   the recommendation and shows an error.
5. **Given** land of 1 ha or less, **When** computing, **Then** Saakh marks the farmer as marginal and eligible
   for Flexi KCC of ₹10,000 to ₹50,000 (para 13(7)).

---

### User Story 2 - Capture inputs from a land-record photo and the farmer's voice (Priority: P1)

The officer photographs the farmer's land record (for example an MP khasra / B1 extract, often in Hindi). Saakh
extracts owner name, survey numbers, area and village. The farmer then describes the crop plan aloud in their
own language; Saakh turns it into structured crop lines (crop, season, area). If anything needed for the
calculation is missing or inconsistent, Saakh asks the officer a short follow-up question in the officer's
language. The officer confirms or corrects every extracted field before calculation.

**Why this priority**: Removes manual data entry and language barriers, which is the main reason the
appraisal is slow and error-prone today. It is the "agent" in the product.

**Independent Test**: Upload a sample Hindi land record image and a recorded crop-plan clip in Marathi; confirm
fields are pre-filled, a follow-up question appears for a missing season, and the officer can edit any field.

**Acceptance Scenarios**:

1. **Given** a clear land-record photo, **When** uploaded, **Then** area and survey numbers are pre-filled and
   shown alongside the image for confirmation.
2. **Given** a crop-plan recording in any supported language, **When** processed, **Then** crop lines appear
   with crop names mapped to the district SoF table.
3. **Given** the farmer states total area larger than the land record, **When** processed, **Then** Saakh asks a
   follow-up question instead of silently accepting it.
4. **Given** an unreadable photo or recording, **When** processed, **Then** Saakh asks for a re-capture and allows
   manual entry.

---

### User Story 3 - Sanction note, officer decision and audit trail (Priority: P1)

After calculation, Saakh drafts a sanction recommendation note in the officer's language and a short summary in
the farmer's language, which can be played aloud. The officer approves, edits (with a reason) or rejects. Every
case keeps a tamper-evident record of inputs, sources, model calls and the officer's action.

**Why this priority**: Human approval and an audit trail make the output usable by a regulated lender and are
core to the jury's trust and explainability criteria.

**Independent Test**: Complete a case, edit the recommended limit with a reason, approve, then open the audit
view and confirm all events are listed and the chain verifies.

**Acceptance Scenarios**:

1. **Given** a computed case, **When** the officer opens the note, **Then** it lists each figure with its
   paragraph citation and the SoF source (official or proxy).
2. **Given** the farmer's language differs from the officer's, **When** the officer taps "play for farmer",
   **Then** the farmer summary is spoken in the farmer's language.
3. **Given** the officer changes the recommended limit, **When** saving, **Then** a reason is required and both
   values are recorded.
4. **Given** a stored case, **When** any past record is altered, **Then** audit verification reports a break.

---

### User Story 4 - Scale of Finance management (Priority: P2)

A bank administrator can view the SoF table in use for each district and season, see whether each value is
official or a labelled proxy, and upload the bank's own official table to replace proxy values.

**Why this priority**: Limits are only as good as the SoF; banks must be able to use their DLTC tables. Demo
works with proxy data, so this is P2.

**Independent Test**: Upload a CSV for one district; confirm subsequent calculations use it and are labelled
"official".

**Acceptance Scenarios**:

1. **Given** the default dataset, **When** viewing a district, **Then** every value shows its source and label.
2. **Given** a valid uploaded table, **When** saved, **Then** new cases use it; existing cases keep the SoF they
   were computed with.
3. **Given** an invalid upload (missing columns, non-numeric values), **When** saved, **Then** it is rejected with
   row-level errors.

---

### User Story 5 - Validation pack (Priority: P2)

A risk or compliance reviewer opens a validation page that runs a fixed test set and reports calculation
accuracy against expected results, extraction accuracy on sample land records and recordings, and language
parity (the same case described in different languages yields the same limit). It also lists any rule
interpretations awaiting confirmation.

**Why this priority**: Proves reliability to bank risk teams (RBI model-risk expectations) and to the jury.

**Independent Test**: Open the page and run; confirm it shows pass counts per category and lists open
interpretations.

**Acceptance Scenarios**:

1. **Given** the test set, **When** run, **Then** calculation accuracy is shown as passed/total with failures
   listed.
2. **Given** the same crop plan in Hindi, English and at least two other languages, **When** run, **Then**
   parity reports whether all produce identical limits.

---

### User Story 6 - Installable app with a public demo (Priority: P3)

Judges and officers open a public link, install the app to a phone home screen, and run a pre-loaded demo case
in under three minutes without creating an account.

**Why this priority**: Required for BUILD 2036 submission; low effort once other stories exist.

**Independent Test**: Open the link on an Android phone, install, and complete the demo case.

**Acceptance Scenarios**:

1. **Given** the public link, **When** opened on a phone browser, **Then** the app can be installed and opens
   full-screen.
2. **Given** the demo case, **When** a judge follows the guided steps, **Then** they reach an approved note with
   audit record.

---

### User Story 7 - Appraisal agent second opinion (Priority: P2) *(added 2026-11-26)*

After the limit is computed, the officer can run an appraisal agent on the case. The agent writes a short plan,
then runs deterministic checks: the limit calculation, risk rules (identity against the land record, double
financing against other cases on the device, Scale of Finance provenance, over-claimed area, tenancy proof,
crop and season plausibility), Scale of Finance lookups and what-if scenarios. It may queue up to three
questions for the officer, some meant for the farmer. It returns a recommendation (approve, review or
decline), a confidence level, a short summary in the officer's language, the risks with evidence, the what-ifs
and the result of every verification check. The officer watches each step live and can open the full trace
later. The recommendation is advice only; the officer still decides in the decision step.

**Why this priority**: Turns a correct calculation into an appraisal that catches identity, land and
double-financing problems a busy officer can miss, without letting the model touch any figure.

**Independent Test**: Run the agent on the demo case and on a case whose survey number is already financed in
another case; confirm the first gets a report whose limit equals the computed limit with all checks passing,
and the second shows a high double-financing risk with evidence and a recommendation other than approve.

**Acceptance Scenarios**:

1. **Given** a computed case, **When** the officer runs the agent, **Then** the report's limit equals the
   engine's limit and every verification check is listed with pass or fail.
2. **Given** the agent's summary states a rupee figure that no deterministic step produced, **When** the
   report is verified, **Then** the agent gets one repair attempt; if it still fails, the recommendation becomes
   review, the summary is replaced by a deterministic summary and the failed check is shown.
3. **Given** the agent stops without running the limit calculation or the risk rules, **When** the run ends,
   **Then** the system runs them itself before building the report and says so in the trace.
4. **Given** the agent queued questions, **When** the officer answers one or more and re-runs, **Then** the
   agent receives the answers with the case and is instructed not to ask them again; a question meant for the farmer is shown in the
   farmer's language and can be played aloud.
5. **Given** any recommendation, **When** the report is shown, **Then** the case status and decision are
   unchanged until the officer acts in the decision step.
6. **Given** the agent service is not configured, offline or failing, **When** the officer runs it, **Then** an
   error is shown with a retry (except when not configured) and the officer can skip to the full calculation.
7. **Given** a stored agent run, **When** the officer edits any input, **Then** the stored run is cleared.

---

### User Story 8 - Land record read twice (Priority: P2) *(added 2026-11-26)*

When the officer uploads a land-record photo, Saakh reads it with two independent readers and compares owner
name, village, survey numbers, area and Aadhaar last 4 field by field. Names are compared across scripts
(Devanagari and Latin). Where the readers disagree, the officer gets a follow-up question listing both values,
and the disagreement becomes a risk for the agent.

**Why this priority**: A single misread area or name flows straight into the limit; a second independent read
makes misreads visible before the officer confirms.

**Independent Test**: Upload a sample land record; confirm per-field agreement is stored with the case, and a
record where the readers differ on area produces a follow-up question naming both readings.

**Acceptance Scenarios**:

1. **Given** both readers return the same values (after normalising script, digits and order), **When**
   reconciled, **Then** every field is marked as agreed.
2. **Given** the readers disagree on a field, **When** reconciled, **Then** both readings are kept and a
   follow-up question lists them.
3. **Given** one reader fails, **When** extraction finishes, **Then** the other reader's result is returned and
   the record is marked as read once.

### Edge Cases

- Long-duration crops (12 to 18 months, e.g. sugarcane) mixed with seasonal crops.
- Tenant, oral lessee or sharecropper without land record: affidavit allowed only up to ₹50,000 (para 30).
- Recording mixes two languages (code-mixed Hindi-English).
- Crop names spoken in local terms (e.g. "chana" for gram) must map to SoF entries.
- Loans first sanctioned before 1 Jan 2027 at renewal: show that the 2027 rules apply from next renewal.
- Network drops in the field: entered data must not be lost.
- Officer edits a field after calculation: limit must recompute and audit must record the change.
- Recovery tie-up present: collateral-free threshold rises to ₹3,00,000 (para 25).
- *(added 2026-11-26)* Applicant name differs from the land-record owner because of an heir, joint owner or
  family member: flagged, and the agent asks what would clear it rather than declining.
- *(added 2026-11-26)* Same survey number already financed in another case on the device in the same district
  and village: high risk; in another village it is not flagged.
- *(added 2026-11-26)* Translation of the agent summary changes or drops a digit: the English text is shown
  instead.
- *(added 2026-11-26)* Agent runs out of its time budget or the provider fails after at least one step: the
  report is built from the deterministic steps and marked for review. A failure before any step is shown as an
  error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST compute drawing limits, six yearly short-term limits and the composite KCC limit
  exactly per RBI KCC Directions, 2026 paras 8, 10 and 13, using only deterministic rules.
- **FR-002**: System MUST show, for every computed figure, the paragraph reference and the input values used.
- **FR-003**: System MUST flag: crops outside SoF (13(4)), notional SoF hike (13(3)), area exceeding land,
  marginal farmer and Flexi KCC eligibility (6(5), 13(7)), collateral status (23 to 25), tenancy proof (30).
- **FR-004**: System MUST extract area, survey numbers, owner name and village from a land-record photo and
  present them for officer confirmation before use.
- **FR-005**: System MUST convert a spoken crop plan in any supported Indian language into crop lines (crop,
  season, area) mapped to SoF crop names.
- **FR-006**: System MUST ask the officer a follow-up question when required inputs are missing or
  inconsistent, and MUST NOT compute until required inputs are confirmed.
- **FR-007**: System MUST support all languages offered by the speech and translation services used, with Hindi
  and English as fully verified core languages; the officer and farmer languages are chosen independently.
- **FR-008**: System MUST draft a sanction note in the officer's language and a farmer summary in the farmer's
  language, and MUST play the farmer summary aloud on request.
- **FR-009**: System MUST NOT sanction or reject automatically; only a named officer can approve, edit (reason
  required) or reject.
- **FR-010**: System MUST keep an append-only, tamper-evident (hash-chained) audit record per case covering inputs
  (extracted and confirmed), SoF source, rule version, model calls (model and purpose), officer profile name,
  officer actions and timestamps, stored on the device and exportable as a JSON file.
- **FR-011**: System MUST mask Aadhaar numbers to the last 4 digits and MUST NOT retain raw audio or images after
  extraction unless the officer attaches them to the case.
- **FR-012**: System MUST ship a default SoF dataset for Indore, Sehore, Ujjain, Dewas and Dhar covering soybean,
  maize, cotton, wheat, gram, mustard and sugarcane, label proxy values as proxy, and let an administrator upload
  an official table with validation.
- **FR-013**: System MUST provide a validation page reporting calculation accuracy, extraction accuracy and
  language parity on a fixed test set, plus open rule interpretations.
- **FR-014**: System MUST be installable on phones and desktops from a public link and keep in-progress case data
  on the device if the connection drops.
- **FR-015**: System MUST include a pre-loaded demo case completable without sign-up.
- **FR-016**: System MUST state on every result that the 2026 Directions apply to sanctions from 1 Jan 2027 and
  that loans sanctioned earlier move to these rules at their next renewal (para 2).

*Added 2026-11-26 (intelligence layer, US7 and US8):*

- **FR-017**: System MUST read a land-record photo with two independent readers, compare owner name, village,
  survey numbers, area and Aadhaar last 4 field by field (names across scripts), keep both readings, and raise
  a follow-up question for each disagreement; if one reader fails, it MUST return the other and mark the record
  as read once.
- **FR-018**: System MUST offer, on a computed case, an appraisal agent that returns a recommendation (approve,
  review or decline), a confidence level, a summary in the officer's language, risks with evidence, what-if
  scenarios, at most 3 questions and the result of every verification check. The recommendation MUST NOT change
  the case status or decision (FR-009 still applies).
- **FR-019**: Every rupee figure in agent output MUST come from deterministic steps (limit engine, risk rules,
  what-ifs, SoF lookup); the agent MUST NOT be able to supply numbers to any calculation, and the report's
  limit MUST equal the engine output.
- **FR-020**: System MUST verify the agent's report before showing it: figures only from deterministic steps,
  result identical to the engine, no approve over an engine error or a high rule risk, every rule risk kept,
  decline backed by a high risk or engine error, non-empty summary. On failure it MUST allow one repair attempt,
  then set the recommendation to review and replace the summary with a deterministic one. (Citation of each
  figure in the summary is requested of the agent but not yet verified.)
- **FR-021**: System MUST run deterministic risk rules covering: land not verified, name, village, survey
  number, area and Aadhaar mismatch against the land record, reader disagreement, single read, season area over
  land held (para 29), double financing and possible duplicate applicant against other cases on the device, SoF
  missing (para 13(4)) or proxy, tenancy proof (para 30), unknown crop, implausible season and unusual district
  for the crop. Each risk MUST carry a severity (high, medium, low), evidence and a para where a rule applies.
- **FR-022**: System MUST offer up to 5 what-if scenarios, each recomputed by the engine with one input changed
  (recovery tie-up, insurance premium estimate labelled as an estimate, crop area fitted to land held, crops
  without SoF dropped, staying under the collateral-free ceiling, a pump-set term loan), showing the new limit,
  the change, collateral status and para.
- **FR-023**: System MUST show agent summary, risk and what-if text in the officer's language only when every
  figure survives translation; otherwise it MUST show the English text.
- **FR-024**: System MUST record each completed agent run in the audit trail (recommendation, confidence,
  checks passed of total, risk codes, question and answer counts, limit, models) and each run that ends in a
  transport or provider error as a failed AI call; editing any input MUST clear the stored run.
- **FR-025**: System MUST show the agent's plan, each step with its input, output and duration, harness notes
  and checks live while it runs, and keep the trace with the case.

### Key Entities

- **Case**: one farmer appraisal; farmer details (masked), land, tenure, crop lines, SoF snapshot, result,
  officer decision, languages.
- **Crop Line**: crop, season, area in hectares, mapped SoF entry.
- **SoF Entry**: district, crop, season, amount per hectare, source (official / proxy), notified flag, previous
  season amount.
- **Engine Result**: steps with paragraph citations, yearly limits, KCC limit, flags.
- **Audit Event**: case id, type, payload summary, timestamp, actor, hash of previous event.
- **Validation Run**: test set version, per-category pass/total, failures, open interpretations.
- *(added 2026-11-26)* **Land Evidence**: per land field, the value used, whether both readers agree, and each
  reader's value.
- *(added 2026-11-26)* **Risk**: code, severity, title, detail, evidence, optional para, source (rule or agent).
- *(added 2026-11-26)* **What-if**: label, input change, resulting limit, change from base, collateral status,
  para, note.
- *(added 2026-11-26)* **Check**: verifier name, pass or fail, detail.
- *(added 2026-11-26)* **Question**: text in the officer's language, why it matters, optional farmer-language
  version.
- *(added 2026-11-26)* **Agent Report**: recommendation, confidence, summary, engine result, risks, what-ifs,
  questions, checks, models, step count, duration.
- *(added 2026-11-26)* **Agent Run**: time, report, trace, per-step durations; stored on the case.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the engine test set matches expected limits (including RBI Annex I illustrations once
  obtained).
- **SC-002**: An officer completes a new appraisal from photo and voice to approved note in under 5 minutes in
  the demo.
- **SC-003**: Land-record area extraction is correct on at least 9 of the 10 images in the sample set before
  officer correction.
- **SC-004**: The same crop plan spoken in Hindi, English, Marathi, Gujarati, Telugu and Tamil yields identical
  limits in at least 95% of parity tests.
- **SC-008**: Photo or voice extraction returns a result within 20 seconds and limit calculation appears in
  under 1 second.
- **SC-005**: Every figure in every sanction note carries a paragraph citation (0 uncited figures in review).
- **SC-006**: A first-time judge completes the guided demo case on a phone in under 3 minutes.
- **SC-007**: Audit verification detects 100% of deliberately altered records in the test set.

*Added 2026-11-26:*

- **SC-009**: 0 agent reports reach the officer with a rupee figure that no deterministic step produced (forged
  figures are repaired or the summary is replaced).
- **SC-010**: An agent run ends with a verified or downgraded report within a 75 second budget.
- **SC-011**: 100% of rule risks found for a case appear in the final agent report.
- **SC-012**: The language parity set covers 13 languages as text transcripts (Hindi, English, Marathi,
  Gujarati, Telugu, Tamil, Bengali, Kannada, Malayalam, Odia, Punjabi, Urdu, Assamese) with the SC-004
  threshold; audio samples remain for the original six. This extends the parity scope in Clarifications.

## Assumptions

- Users are officers at cooperative banks, RRBs and PACS; farmers do not log in.
- Official MP 2026-27 SoF tables are not publicly available in machine-readable form; PMFBY sum insured per
  hectare is used as a labelled proxy for the demo.
- No live access to land-record, ULI or core banking systems for the prototype; inputs come from photos, voice
  and manual entry, with synthetic demo data.
- Investment (term-loan) limit is entered by the officer as a figure; detailed investment appraisal is out of
  scope.
- Allied-activity (dairy, fisheries) limits are out of scope for v1; crops only.
- Officer identity for the prototype is a named profile chosen on the device, without password; full bank
  authentication is out of scope.
- Long-duration crops (e.g. sugarcane) use the 18-month crop season (para 6(4)) and are included once in the
  year-1 base.
- Yearly limits compound from the unrounded year-1 figure and round each year for display, pending confirmation
  against RBI Annex I.
