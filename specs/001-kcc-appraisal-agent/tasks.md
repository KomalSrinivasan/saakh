---

description: "Task list for Saakh KCC Appraisal Agent"
---

# Tasks: Saakh KCC Appraisal Agent

**Input**: Design documents from `/specs/001-kcc-appraisal-agent/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ai-api.md

**Tests**: Required by constitution I and VII for pure logic (`node:test`). No UI test framework.

**Organization**: Grouped by user story. Day tags map to the solo build window: D2 = 26 Nov, D3 = 27 Nov,
D4 = 28 Nov, D5 = 29 Nov, D6 = 30 Nov (submission + buffer).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 to US6 from spec.md

## Phase 1: Setup (D2)

- [x] T001 Scaffold Next.js 16 app with TypeScript, Tailwind, App Router, pnpm in `./`
- [x] T002 Add `test` script (`node --test src/**/*.test.ts`) in `package.json` and `allowImportingTsExtensions` in `tsconfig.json`
- [x] T003 Create `.env.example` with `SARVAM_API_KEY` and `ANTHROPIC_API_KEY`, allow it in `.gitignore`
- [x] T004 Add `@anthropic-ai/sdk` dependency (only new dep, justified in research R2) in `package.json`
- [x] T005 [P] Add em-dash check script `check:dash` (`git grep -n $'\xe2\x80\x94' -- src specs`) in `package.json`

---

## Phase 2: Foundational (D2)

**Purpose**: shared modules every story needs. Blocks all stories.

- [x] T006 Deterministic KCC engine per RBI Directions 2026 paras 6, 8, 10, 13, 23 to 25, 30 in `src/lib/kcc.ts`
- [x] T007 Engine tests (10 cases, paragraph-cited) in `src/lib/kcc.test.ts`
- [x] T008 [P] Language list (all Saaras/Mayura codes, display names) and `t(key, lang)` with en and hi dictionaries in `src/lib/i18n.ts` and `src/data/ui/en.json`, `src/data/ui/hi.json`
- [x] T009 [P] Case and OfficerProfile storage in localStorage (`saakh.cases`, `saakh.profile`), Case status transitions `draft -> computed -> approved | edited_approved | rejected`, `computed -> draft` on input edit, in `src/lib/store.ts`
- [x] T010 [P] Audit chain: `append(event)`, `verify()`, events `{seq, caseId, type, at, actor, data, prevHash, hash}`, `hash = SHA-256(prevHash + canonical JSON)` via `crypto.subtle`, genesis `GENESIS`, in `src/lib/audit.ts`
- [x] T011 [P] Audit tests: append, verify OK, detect altered `data`, detect removed event, in `src/lib/audit.test.ts`
- [x] T012 App shell: layout with officer profile picker (name "required, 2 to 60 chars") and UI language picker, nav to Cases / SoF / Validate, in `src/app/layout.tsx` and `src/app/page.tsx`

**Checkpoint**: engine, storage, audit and shell ready.

---

## Phase 3: User Story 1 - Compute a KCC limit (P1, D2) MVP

**Goal**: officer enters inputs manually and gets cited limits.
**Independent Test**: spec US1 scenario 1 gives year-1 ₹1,72,000 with test SoF; proxy labels shown with default SoF.

- [x] T013 [P] [US1] Proxy SoF dataset rows `{district, crop, aliases[], season, current, previous, source: "proxy-pmfby", scope, ref}` for Indore, Sehore, Ujjain, Dewas, Dhar x soybean, maize, cotton, wheat, gram, mustard, sugarcane, each with a citation `ref`, in `src/data/sof-mp.json`
- [x] T014 [P] [US1] SoF loader: default + uploaded table (uploaded overrides by district+crop+season), `toEngineSof(district)`, alias lookup (e.g. chana -> gram), in `src/lib/sof.ts`
- [x] T015 [P] [US1] SoF tests: alias mapping, override precedence, missing current uses previous, in `src/lib/sof.test.ts`
- [x] T016 [US1] Case page manual-entry form (district, landHa > 0, tenure, crop lines, insurance, term loan, recovery tie-up) and result panel showing steps with `para`, yearly limits, flags, SoF source labels and the para 2 applicability notice (FR-016), recompute on edit, in `src/app/case/[id]/page.tsx`
- [x] T017 [US1] Append `created`, `confirmed`, `computed` audit events with engine version and SoF snapshot in `src/app/case/[id]/page.tsx`

**Checkpoint**: US1 demoable end to end without AI.

---

## Phase 4: User Story 2 - Photo and voice capture (P1, D3)

**Goal**: land fields from photo, crop lines from speech in any language, follow-up questions.
**Independent Test**: spec US2 scenarios 1 to 4 with `public/samples/`.

- [x] T018 [US2] Server AI module: Sarvam STT (`saaras:v4`, transcribe + translate, crop keyterms), Sarvam Vision OCR with Claude-vision fallback after 20 s or unusable output, Claude structuring with JSON output, all returning `models[]`, 20 s timeout, in `src/lib/ai.ts`
- [x] T019 [US2] Route `land` and `crops` actions per `contracts/ai-api.md` (Aadhaar last 4 only, unit conversion to hectares, season over-claim -> followUps) in `src/app/api/ai/[action]/route.ts`
- [x] T020 [P] [US2] Create synthetic samples: 10 land-record images (SC-003 set) (Hindi khasra/B1 style), crop-plan recordings in hi, en, mr, gu, te, ta, in `public/samples/`
- [x] T021 [US2] Capture step on case page: camera/file input, mic record (MediaRecorder), show extracted fields beside image, follow-up questions, officer confirm/edit every field, manual-entry fallback on error, in `src/app/case/[id]/page.tsx`
- [x] T022 [US2] Audit `extracted` and `ai_call` events (model, purpose, no raw media) in `src/app/case/[id]/page.tsx`

**Checkpoint**: photo + voice to confirmed inputs to computed limit.

---

## Phase 5: User Story 3 - Note, decision, audit (P1, D4)

**Goal**: cited sanction note in two languages, TTS, officer decision, verifiable audit.
**Independent Test**: spec US3 scenarios 1 to 4.

- [x] T023 [US3] `note`, `tts`, `translate` actions: Claude drafts officer note from `case.result` only, route rejects drafts with any rupee figure not in result (retry once), Mayura/Sarvam-Translate to farmer language, Bulbul v3 TTS, in `src/lib/ai.ts` and `src/app/api/ai/[action]/route.ts`
- [x] T024 [US3] Note + decision step: show officer note and farmer summary, play audio, Approve / Edit limit (reason required when finalLimit differs) / Reject, lock case after decision, in `src/app/case/[id]/page.tsx`
- [x] T025 [US3] Audit panel: list events, "Verify chain" result, export case + audit JSON, in `src/app/case/[id]/page.tsx`

**Checkpoint**: full P1 flow complete.

---

## Phase 6: User Story 4 - SoF management (P2, D4)

**Independent Test**: spec US4 scenarios 1 to 3 with `public/samples/sof-sehore.csv`.

- [x] T026 [P] [US4] CSV parse/validate (`district,crop,season,current,previous,ref`, numeric checks, row-level errors) in `src/lib/sof.ts` with tests in `src/lib/sof.test.ts`
- [x] T027 [US4] SoF page: table by district/season with source labels, CSV upload, save to localStorage; existing cases keep their snapshot, in `src/app/sof/page.tsx`
- [x] T028 [P] [US4] Sample official-format CSV in `public/samples/sof-sehore.csv`

---

## Phase 7: User Story 5 - Validation pack (P2, D5)

**Independent Test**: spec US5 scenarios 1 and 2.

- [x] T029 [P] [US5] Validation set: engine cases with expected limits, land-image expected areas, parity transcripts of one crop plan in hi, en, mr, gu, te, ta, in `src/data/validation-set.json`
- [x] T030 [US5] Validation runner: calc (pure), extraction and parity (via API), open interpretations list (Annex I rounding order), in `src/lib/validation.ts` with pure-part tests in `src/lib/validation.test.ts`
- [x] T031 [US5] Validate page with run button, per-category pass/total, failures, open interpretations, in `src/app/validate/page.tsx`

---

## Phase 8: User Story 6 - Installable demo (P3, D5)

**Independent Test**: spec US6 scenarios 1 and 2 on an Android phone.

- [x] T032 [P] [US6] PWA manifest (name Saakh, standalone, theme, icons) in `src/app/manifest.ts` and icons in `public/icons/`
- [x] T033 [P] [US6] App-shell service worker with no-cache header for `sw.js` in `public/sw.js` and `next.config.ts`; register in `src/app/layout.tsx`
- [x] T034 [US6] Pre-loaded demo case (Sehore, soybean + wheat, Marathi-speaking farmer) and guided steps banner in `src/app/page.tsx`
- [x] T035 [US6] Deploy to Cloudflare Workers (OpenNext) with secrets, verify install on phone, record demo URL in `README.md`

---

## Phase 9: Polish and Submission (D5 to D6)

- [x] T036 [P] Generate UI dictionaries for mr, gu, te, ta, kn, bn, pa, ml, od via one-off Sarvam translate script `scripts/translate-ui.mjs` into `src/data/ui/`
- [x] T037 Run quickstart scenarios 1 to 6 from `specs/001-kcc-appraisal-agent/quickstart.md` and fix blockers
- [x] T038 Gates: `pnpm test`, `npx tsc --noEmit`, `pnpm build`, `pnpm check:dash` all clean
- [x] T039 [P] Architecture diagram and impact case in `docs/` (Excalidraw-style kit), README with demo link and screenshots
- [ ] T040 Record 2-minute demo video and submit on Hack2skill (D6, 30 Nov)

---

## Phase 10: Intelligence layer (amendment 2026-11-26, US7 and US8, already built)

**Goal**: second land reader, deterministic risk rules and what-ifs, and a verified appraisal agent.
**Independent Test**: `pnpm test` (86 pass); spec US7 and US8 scenarios on the deployed app.

- [x] T041 [US8] Dual-read land extraction: Sarvam Vision OCR + Claude structuring and Claude vision in parallel, per-field reconcile, disagreement follow-ups, `evidence` in the `land` response, in `src/lib/reconcile.ts`, `src/lib/ai.ts` (`extractLand`) and `src/app/api/ai/[action]/route.ts`; tests in `src/lib/reconcile.test.ts`
- [x] T042 [P] [US8] Cross-script name matching (Devanagari transliteration, Jaro-Winkler `nameSimilarity`) in `src/lib/names.ts`; tests in `src/lib/names.test.ts`
- [x] T043 [US8] Store `LandEvidence` on the case at capture and pass it to the agent, in `src/components/case/capture-land.tsx` and `src/lib/agent/client.ts` (`landEvidence`)
- [x] T044 [P] [US7] MP crop calendar and growing belts with sources, flags only, in `src/data/agronomy-mp.json`
- [x] T045 [US7] Deterministic risk rules (17 codes: land match, reader disagreement, overclaim, double financing, duplicate applicant, SoF missing/proxy, tenancy, crop plan) in `src/lib/risk.ts`; tests in `src/lib/risk.test.ts`
- [x] T046 [US7] What-if scenarios recomputed by the engine (tie-up, premium estimate, fit to land, drop no-SoF, under collateral ceiling, pump set) in `src/lib/whatif.ts`; tests in `src/lib/whatif.test.ts`
- [x] T047 [P] [US7] Agent contract types (`CaseEvidence`, `Risk`, `WhatIf`, `Check`, `Question`, `AgentReport`, `AgentRun`, `SaakhAgentUIMessage`) in `src/lib/agent/types.ts`
- [x] T048 [US7] Seven agent tools with deterministic executors, no numeric inputs, `finish` refused before required tools, at most 3 questions, in `src/lib/agent/tools.ts` with fixture `src/lib/agent/fixtures.ts`; tests in `src/lib/agent/tools.test.ts`
- [x] T049 [US7] Harness verifiers on the draft report (figures from tools, result is engine, no approve over errors or high risk, rule risks kept, decline needs reason, summary present) in `src/lib/harness.ts`; tests in `src/lib/harness.test.ts`
- [x] T050 [US7] Agent loop on `ToolLoopAgent` (`claude-sonnet-5-5` via `src/lib/agent/model.ts`): plan part, required-tool guard, one repair turn, downgrade with template summary, 75 s budget, figure-safe translation (`figures()`), in `src/lib/agent/run.ts`; tests in `src/lib/agent/run.test.ts`
- [x] T051 [US7] `POST /api/agent` with request validation (400), 503 when not configured, UI message stream with data and tool parts, per `contracts/agent-api.md`, in `src/app/api/agent/route.ts`
- [x] T052 [US7] Agent request builder from the stored case and the device portfolio in `src/lib/agent/client.ts`
- [x] T053 [US7] Agent UI: live trace, report with recommendation and checks, risks, what-ifs, questions with answers and farmer playback, rerun, skip to calculation, in `src/components/case/agent-panel.tsx`, `agent-trace.tsx`, `risk-card.tsx`, `whatif-card.tsx`, wired in `src/components/case/case-view.tsx`; strings in `src/data/ui/en.json` and `src/data/ui/hi.json`
- [x] T054 [US7] `agent_run` audit event and `Case.agent` storage, input edit clears the run, in `src/lib/audit.ts`, `src/lib/store.ts`, `src/components/case/agent-panel.tsx`, `src/components/case/case-view.tsx`, `src/components/case/audit-panel.tsx`
- [x] T055 [P] [US5] Parity set extended to 13 languages (text transcripts) in `src/data/validation-set.json` via `scripts/make-validation-set.mjs` (SC-012)
- [x] T056 [US6] Custom domain `saakh.komalvardhan.com` on the Cloudflare Worker in `wrangler.jsonc`, link in `README.md`

Gate check on 2026-11-26: `pnpm test` 86/86, `npx tsc --noEmit` clean, `pnpm -s check:dash` clean; `pnpm build`
not re-run for this amendment.

---

## Dependencies & Execution Order

- Setup -> Foundational -> US1 -> US2 -> US3 (P1 chain; US2 and US3 reuse the case page).
- US4 depends on T014 only; US5 depends on US1 and the AI routes from US2/US3; US6 independent after shell.
- Polish after all stories.

## Parallel Examples

- D2: T008, T009, T010, T011 together; then T013, T014, T015 together.
- D3: T020 samples while T018 is written.
- D4: T026 and T028 alongside T023.
- D5: T029, T032, T033, T036 in parallel.

## Implementation Strategy

MVP = Phase 1 to 3 (US1) on D2: a working cited calculator is already a usable product. Add US2 (AI capture)
on D3 and US3 on D4 for the full agent. US4 to US6 and polish on D5. D6 is submission plus buffer; if behind,
drop T036 (extra UI languages; runtime content stays multilingual) and T026 upload before anything in P1.

Task count by day: D2 = 17 (6 done), D3 = 5, D4 = 6, D5 = 10, D6 = 2. Total 40.

Amendment 2026-11-26: Phase 10 adds T041 to T056 (16, all done). Total 56, 55 done, T040 open.
