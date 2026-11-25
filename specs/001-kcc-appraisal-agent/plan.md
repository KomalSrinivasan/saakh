# Implementation Plan: Saakh KCC Appraisal Agent

**Branch**: `001-kcc-appraisal-agent` | **Date**: 2026-11-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-kcc-appraisal-agent/spec.md`

## Summary

An installable PWA for KCC loan officers. The officer captures a land-record photo and the farmer's spoken
crop plan in any Indian language; AI (Sarvam for speech, vision, translation, TTS; Claude for structuring,
follow-up questions and drafting) turns them into confirmed inputs. The existing deterministic engine
`src/lib/kcc.ts` computes limits per RBI KCC Directions, 2026 with paragraph citations. The officer approves,
edits or rejects; every step lands in a hash-chained, on-device audit log. A validation page proves
calculation accuracy, extraction accuracy and language parity.

## Technical Context

**Language/Version**: TypeScript 5.9, Node 26 (runtime type stripping for tests)

**Primary Dependencies**: Next.js 16.4 (App Router), React 19, Tailwind 4 (already installed);
`@anthropic-ai/sdk` (only new dependency, for agent reasoning). Sarvam called via `fetch` (no SDK).

**Storage**: Browser `localStorage` for cases, officer profile, uploaded SoF and audit chain; JSON export.
No server database (see research R4).

**Testing**: `node:test` + `node:assert` (`pnpm test`); engine and validation logic are pure and tested.

**Target Platform**: Modern Chrome/Safari/Edge on Android phones and desktop; deployed to Vercel.

**Project Type**: Web application (single Next.js project with route handlers).

**Performance Goals**: limit calculation under 1 s (client-side, pure); photo/voice extraction under 20 s.

**Constraints**: API keys server-side only; no raw audio/images persisted; offline-tolerant drafts; no em
dashes; one-line comments.

**Scale/Scope**: Prototype, ~6 screens, 5 MP districts x 7 crops of SoF, 1 officer per device.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Plan compliance | Status |
|---|---|---|
| I. Deterministic numbers | All limits from `kcc.ts` on the client; AI routes return only extracted fields and text | PASS |
| II. Citations | Engine steps carry `para`; note drafting receives steps and must quote them; proxy SoF labelled | PASS |
| III. Human approves | Decision buttons only for officer; no auto-approve path; edit requires reason | PASS |
| IV. Audit trail | `src/lib/audit.ts` hash chain with SHA-256 (Web Crypto), append-only API | PASS |
| V. Multilingual | Saaras v4 STT any language, Mayura/Sarvam-Translate, Bulbul v3 TTS; UI dictionaries per language | PASS |
| VI. Privacy | Aadhaar masked at capture; images/audio sent to AI then discarded; keys in env | PASS |
| VII. Minimalism | One new dep (Anthropic SDK, justified: tool-use + vision reliability); fetch for Sarvam; localStorage; node:test | PASS |

Post-design re-check: PASS (no new violations introduced by data model or contracts).

## Project Structure

### Documentation (this feature)

```text
specs/001-kcc-appraisal-agent/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ai-api.md
├── checklists/
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── layout.tsx            # shell, language + officer pickers, SW registration
│   ├── manifest.ts           # PWA manifest
│   ├── page.tsx              # case list + new case + demo case
│   ├── case/[id]/page.tsx    # capture -> confirm -> compute -> note -> decision -> audit
│   ├── sof/page.tsx          # SoF table view + CSV upload
│   ├── validate/page.tsx     # validation pack
│   └── api/ai/[action]/route.ts  # land | crops | note | tts | translate (server, holds keys)
├── lib/
│   ├── kcc.ts                # DONE: deterministic engine
│   ├── kcc.test.ts           # DONE: 10 tests
│   ├── sof.ts                # load default + uploaded SoF, CSV parse/validate
│   ├── audit.ts              # hash-chained audit events
│   ├── store.ts              # localStorage cases/profile
│   ├── ai.ts                 # server: Sarvam + Claude calls
│   ├── i18n.ts               # UI dictionaries + language list
│   ├── validation.ts         # validation pack runner (pure parts)
│   └── *.test.ts             # tests for sof, audit, validation
└── data/
    ├── sof-mp.json           # proxy SoF, labelled
    ├── ui/*.json             # UI strings per language (generated once)
    └── validation-set.json   # engine cases, extraction samples, parity transcripts
public/
├── sw.js                     # app-shell cache
├── icons/                    # 192/512 icons
└── samples/                  # synthetic land-record images, crop-plan audio
```

**Structure Decision**: Single Next.js project. Pure logic in `src/lib` (tested with node:test), UI in
`src/app`, one dynamic API route holding all server-side AI calls to keep keys off the client.

## Complexity Tracking

No violations. The single new dependency is justified in research R2.

## Amendment 2026-11-26: intelligence layer and deployment

Covers spec US7, US8, FR-017 to FR-025, SC-009 to SC-012. Text above is kept as written; where it differs,
this section describes what is built.

### Technical context changes

- **Dependencies** (replace `@anthropic-ai/sdk`, which is not installed):
  - `ai` v7: one tool-loop agent (`ToolLoopAgent`), structured output and UI message streaming, instead of a
    hand-written loop and stream protocol.
  - `@ai-sdk/anthropic`: Claude provider for `ai` (extraction, note drafting, agent).
  - `@ai-sdk/react`: `useChat` consumes the agent stream with typed tool and data parts.
  - `zod`: schemas for tool inputs and structured extraction output, required by `ai`.
  - dev: `@opennextjs/cloudflare` and `wrangler` to build and deploy to Cloudflare Workers.
- **Deployment**: Cloudflare Workers through OpenNext (`wrangler.jsonc`), custom domain
  `https://saakh.komalvardhan.com`. This conflicts with the constitution's "deployed on Vercel"; see analysis
  finding D2.
- **Routes**: `POST /api/ai/[action]` (unchanged actions) and `POST /api/agent` (`contracts/agent-api.md`).
- **Performance**: agent run budget 75 s (route `maxDuration` 90 s); land readers 45 s each, Claude calls 35 s,
  Sarvam calls 20 s. SC-008's 20 s target is not met by the land step in the worst case.

### Design notes

- **Dual-read land** (`src/lib/ai.ts` `extractLand`, `src/lib/reconcile.ts`): reader A is Sarvam Vision OCR
  with Claude structuring; reader B is Claude vision on the photo. Both run in parallel; `reconcileLand`
  compares fields with `nameSimilarity` (`src/lib/names.ts`: Devanagari to Latin transliteration with schwa
  deletion, honorific stripping, Jaro-Winkler). This replaces the "Sarvam first, Claude fallback after 20 s"
  design in research R3.
- **Agent** (`src/lib/agent/run.ts`, `tools.ts`, `model.ts`): `ToolLoopAgent` on `claude-sonnet-5-5`, at most
  10 steps, stops on `finish`. Seven tools; `compute_kcc`, `run_risk_checks`, `check_crop_plan` and `what_if`
  take no input, so the model cannot pass numbers to the engine. `finish` is offered only after `compute_kcc`
  and `run_risk_checks` have run (`prepareStep`); if the agent stops without them the harness runs them and
  streams them as `harness-<n>` tool parts.
- **Harness** (`src/lib/harness.ts`): seven verifiers on the draft report (spec FR-020). One repair turn limited
  to `finish`; if still failing, recommendation `review`, confidence `low`, summary from `templateSummary`
  (engine and rules only). The allowed-figure set is every number in any tool output; see analysis A1.
- **Risk rules** (`src/lib/risk.ts`, `src/data/agronomy-mp.json`): 17 codes, pure functions of evidence,
  portfolio (other cases on the device) and SoF. Double financing requires same district, a shared normalised
  survey number, a financed status and the same village (similarity >= 0.85).
- **What-ifs** (`src/lib/whatif.ts`): up to 5 scenarios, each a `computeKcc` call on a changed input. The PMFBY
  premium estimate (2% kharif, 1.5% rabi, 5% annual of SoF x area) and the term-loan cut are computed here,
  outside `kcc.ts`; see analysis D4.
- **Figure-safe translation** (`figures()` in `run.ts`): summary, risk and what-if text are verified in English,
  then translated; a translation whose digit set (any Indian script, grouping ignored) differs is discarded.
- **Client** (`src/lib/agent/client.ts`, `src/components/case/agent-panel.tsx`, `agent-trace.tsx`,
  `risk-card.tsx`, `whatif-card.tsx`): request built from the stored case and the device's other cases;
  stream rendered live; the run is saved on the case and logged as `agent_run`.

### Source structure additions

```text
src/
├── app/api/agent/route.ts        # POST /api/agent, UI message stream
├── components/case/
│   ├── agent-panel.tsx           # run, report, questions, rerun with answers
│   ├── agent-trace.tsx           # plan, tool steps, notes, checks
│   ├── risk-card.tsx
│   └── whatif-card.tsx
├── lib/
│   ├── agent/{types,tools,run,model,client,fixtures}.ts
│   ├── agent/{tools,run}.test.ts
│   ├── harness.ts, risk.ts, whatif.ts, reconcile.ts, names.ts
│   └── {harness,risk,whatif,reconcile,names}.test.ts
└── data/agronomy-mp.json
wrangler.jsonc                    # Cloudflare Workers, custom domain
```

### Constitution re-check (2026-11-26)

| Principle | Status | Note |
|---|---|---|
| I. Deterministic numbers | PASS for limits; open letter conflict | Agent tools take no numeric input; report result must equal engine output. What-if premium estimate and term-loan cut are computed in `whatif.ts`, not `kcc.ts` (D4). |
| II. Citations | FAIL | No interpretation-marker comments in code for the 3 open interpretations (D1); agent summary citations not verified (D5). |
| III. Human approves | PASS | Agent report never changes status or decision. |
| IV. Audit | PASS | `agent_run` event; failed runs as `ai_call`. |
| V. Multilingual | PARTIAL | 9 UI dictionaries miss 299 of 620 keys, including all agent strings (D6). |
| VI. Privacy | PASS with note | Double-financing evidence sent to the model names the other farmer (D7). |
| VII. Minimalism | PASS | Dependencies justified above. |
| Platform constraint | FAIL | Cloudflare Workers, not Vercel (D2). |

### Complexity tracking (amendment)

| Item | Why | Simpler option rejected |
|---|---|---|
| Second land reader | Misread area or name flows straight into the limit | Single reader with fallback: no cross-check |
| Agent harness with repair and downgrade | Model text must never carry an unverified figure | Show model output as is: violates Principle I in spirit |
| Cloudflare deployment | Live demo runs there today; needs a constitution amendment | Vercel: named by the constitution, not in use |
