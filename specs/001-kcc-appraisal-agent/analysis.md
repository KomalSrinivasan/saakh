# Specification Analysis Report: Saakh KCC Appraisal Agent

**Date**: 2026-11-26 | **Feature**: `specs/001-kcc-appraisal-agent/` | **Constitution**: v1.0.0

**Scope**: consistency and coverage of spec.md, plan.md, tasks.md, data-model.md and contracts/ against the constitution and the current code in src/. Extension hooks: .specify/extensions.yml not present, none run.

**Baseline**: pnpm test 86/86, npx tsc --noEmit clean, pnpm -s check:dash clean. pnpm build not re-run.

Status column: "Resolved by amendment" = artifact gap closed by the 2026-11-26 amendment (US7, US8, FR-017 to FR-025, SC-009 to SC-012, contracts/agent-api.md, T041 to T056). "Open" = issue in code or constitution; documented, not fixed.

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation | Status |
|----|----------|----------|-------------|---------|----------------|--------|
| D1 | Constitution | CRITICAL | constitution.md:27-28; src/ | Principle II requires the interpretation-marker comment for every interpretation not explicit in the Directions. src/ has none; validation set lists 3 open interpretations. | Add markers in src/lib/kcc.ts at rounding, collateral and affidavit comparisons. | Open (code) |
| D2 | Constitution | CRITICAL | constitution.md:62, 52; wrangler.jsonc | Constitution fixes platform as Vercel; app runs on Cloudflare Workers (custom domain saakh.komalvardhan.com). | Constitution MINOR amendment or move to Vercel. | Open (constitution) |
| D3 | Constitution | CRITICAL | constitution.md:55-56; plan.md:20-21, 51; research.md R2; tasks.md T004 | Plan names @anthropic-ai/sdk (not installed). ai, @ai-sdk/anthropic, @ai-sdk/react, zod, @opennextjs/cloudflare, wrangler unjustified. | Justify in plan. | Resolved by amendment |
| D4 | Constitution | CRITICAL (letter) | constitution.md:15-16; src/lib/whatif.ts:19-20, 34-46, 98 | Rupee amounts computed outside kcc.ts: PMFBY premium estimate, term-loan cut, fixed ₹50,000 pump set. Deterministic; every limit still from computeKcc; no AI involved. | Move into kcc.ts or amend Principle I to "deterministic tested code under src/lib". | Open |
| D5 | Constitution | HIGH | constitution.md:24-26; src/lib/harness.ts:31-56 | Agent summary checked for figure provenance, not for a para citation per figure. Template fallback does cite. | Add a citation verifier or declare summaries advisory. | Open (code) |
| D6 | Constitution | MEDIUM | constitution.md:46; src/data/ui/*.json | 299 of 620 UI keys (all agent.*) missing in mr, gu, te, ta, kn, bn, pa, ml, od; t() falls back to English. | Re-run scripts/translate-ui.mjs. | Open (data) |
| D7 | Constitution | LOW | src/lib/risk.ts:166-183 | DOUBLE_FINANCING / DUPLICATE_APPLICANT evidence sent to the model names another farmer. Audit stores codes only. | Use case id instead of name in evidence. | Open (code) |
| U1 | Underspecification | HIGH | spec.md; src/lib/agent/*, risk.ts, whatif.ts, harness.ts, reconcile.ts, names.ts | Intelligence layer had no story, FR, SC, entity, contract or task. | Amend artifacts. | Resolved by amendment |
| U2 | Underspecification | MEDIUM | spec.md FR-006 | "Required inputs" not enumerated. | List district, land > 0, tenure, at least one crop line. | Open (spec) |
| U3 | Underspecification | MEDIUM | spec.md FR-013; src/lib/validation.ts | Validation pack does not cover risk rules or verifier behaviour. | Add section or scope out. | Open |
| I1 | Inconsistency | HIGH | spec.md SC-008; contracts/ai-api.md:5; src/lib/ai.ts:21, 206 | 20 s target vs Claude 35 s and land readers 45 s each. | Align SC-008, contract and timeouts. | Open |
| I2 | Inconsistency | MEDIUM | research.md R3; plan.md:10; tasks.md T018 | Sarvam-first with Claude fallback vs both readers always in parallel. | Record change. | Resolved by amendment |
| I3 | Inconsistency | MEDIUM | spec.md Clarifications, SC-004; validation-set.json | Parity set is 13 languages vs 6 in spec; audio for 6 only. | Record as text parity. | Resolved by amendment (SC-012) |
| I4 | Inconsistency | MEDIUM | data-model.md:50-60 | AuditEvent lacks agent_run; Case lacks agent, land evidence. | Add. | Resolved by amendment |
| I5 | Inconsistency | MEDIUM | contracts/ai-api.md:7-20 | land response lacks evidence; errors lack 404 and 503. | Extend. | Resolved by amendment |
| I6 | Inconsistency | LOW | tasks.md T036 | scripts/translate-ui.ts vs actual .mjs. | Fix path. | Open |
| I7 | Inconsistency | LOW | tasks.md T005 | check:dash now scans more paths. | None. | Noted |
| I8 | Inconsistency | LOW | plan.md:28, 82 | Plan says Vercel and one AI route; now two routes. | Plan amendment. | Resolved by amendment |
| A1 | Ambiguity | MEDIUM | src/lib/harness.ts:32-35; src/lib/ai-pure.ts:58-67 | figures_from_tools allows any number found anywhere in tool output (survey nos, paras, percentages). | Restrict to amount fields. | Open (code) |
| A2 | Ambiguity | LOW | spec.md FR-009 | Agent "decline" could read as auto-reject; code never changes status. | Spell out. | Resolved by amendment |
| C1 | Coverage | MEDIUM | spec.md SC-008 | No task measures latency. | Add to validation or quickstart. | Open |
| C2 | Coverage | LOW | spec.md SC-005; T023 | Citations verified by manual review only. | Same as D5. | Open |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 | Yes | T006, T007, T016 | |
| FR-002 | Yes | T016 | |
| FR-003 | Yes | T006, T016 | |
| FR-004 | Yes | T018, T019, T021, T041 | |
| FR-005 | Yes | T018, T019, T021 | |
| FR-006 | Yes | T019, T021 | U2 |
| FR-007 | Yes | T008, T018, T036 | D6 |
| FR-008 | Yes | T023, T024 | |
| FR-009 | Yes | T024 | |
| FR-010 | Yes | T010, T011, T017, T022, T025, T054 | |
| FR-011 | Yes | T019, T022 | |
| FR-012 | Yes | T013, T014, T026, T027 | |
| FR-013 | Yes | T029, T030, T031 | U3 |
| FR-014 | Yes | T032, T033, T035, T056 | |
| FR-015 | Yes | T034 | |
| FR-016 | Yes | T016 | |
| SC-001 | Yes | T007, T029, T030 | |
| SC-003 | Yes | T020, T029, T030 | |
| SC-004 | Yes | T029, T030, T055 | |
| SC-005 | Partial | T023 | C2, D5 |
| SC-007 | Yes | T011 | |
| SC-008 | Partial | T018 | I1, C1 |
| FR-017 | Yes | T041, T042, T043 | added |
| FR-018 | Yes | T047, T048, T050, T051, T052, T053 | added |
| FR-019 | Yes | T048, T049, T050 | added, A1 |
| FR-020 | Yes | T049, T050 | added, D5 |
| FR-021 | Yes | T044, T045 | added |
| FR-022 | Yes | T046 | added, D4 |
| FR-023 | Yes | T050 | added |
| FR-024 | Yes | T054 | added |
| FR-025 | Yes | T053 | added |
| SC-009 | Yes | T049, T050 | added |
| SC-010 | Yes | T050, T051 | added |
| SC-011 | Yes | T049 | added |
| SC-012 | Yes | T055 | added |

Unmapped code before amendment: reconcile.ts, names.ts, risk.ts, agronomy-mp.json, whatif.ts, harness.ts, lib/agent/*, api/agent/route.ts, agent-panel/agent-trace/risk-card/whatif-card, agent_run audit type, 13-language parity, custom domain. All mapped by T041 to T056.
Unmapped tasks: none. T040 (US6 / SC-006) open.

## Constitution Alignment

| Principle | Result | Evidence |
|---|---|---|
| I | PASS for limits; letter conflict D4 | Numeric tools take empty input; result_is_engine verifier; figure check (weakened by A1); translation discarded if digits change. No AI computes a limit. |
| II | FAIL (D1), partial (D5) | No markers; risks and what-ifs show para in UI. |
| III | PASS | Agent never changes status or decision. |
| IV | PASS | agent_run event; failures as ai_call; cancelled runs not logged. |
| V | PARTIAL (D6) | Agent text and farmer questions translated; 9 UI dictionaries incomplete. |
| VI | PASS with note (D7) | |
| VII | Resolved (D3) | |
| Platform | FAIL (D2) | |

## Metrics

- Requirements: 22 before, 35 after
- Tasks: 40 before, 56 after (55 done)
- Coverage: 100% before and after (SC-005, SC-008 partial)
- Ambiguity: 2 | Duplication: 0
- Critical: 4 (D3 resolved; D1, D2, D4 open)

## Next Actions

1. D1: add interpretation markers in src/lib/kcc.ts.
2. D2, D4: constitution amendment to 1.1.0 with Sync Impact Report.
3. I1: align SC-008, ai-api contract and ai.ts timeouts.
4. D5, A1: tighten harness before calling summaries audit-grade.
5. D6: regenerate 9 UI dictionaries before the demo video if a non-Hindi officer language is shown.

## Remediation (2026-11-26)

| ID | Status | Change |
|---|---|---|
| D1 | Resolved | `interpretation:` markers at the three open RBI interpretations in `src/lib/kcc.ts` and the bigha factor in `src/lib/ai-pure.ts`. |
| D2 | Resolved | Constitution 1.1.0: platform is Cloudflare Workers via OpenNext. |
| D4 | Resolved | Constitution 1.1.0, Principle I: what-if scenario inputs may come from deterministic tested code in `whatif.ts`; limits still only from `kcc.ts`. |
| D7 | Resolved | Other cases are referenced by case id, never by farmer name, in risk evidence sent to the model (`risk.ts`, test asserts it). |
| A1 | Resolved | `resultNumbers` keeps only rupee amounts (numeric fields of ₹100 or more, ₹-marked text), not survey or para numbers (`ai-pure.ts`, test added). |
| I6 | Resolved | T036 path corrected to `scripts/translate-ui.mjs`. |
| Transcript | Resolved | Agent evidence carries the transcript as spoken with its language; the mislabelled `english` copy is gone. |
| I1 | Resolved | One 20 s deadline per land or crops request; note streams; agent budget 45 s (`ai.ts`, routes). |
| D6 | Resolved | UI dictionaries regenerated for all 11 languages (`scripts/translate-ui.mjs`). |
| D5, C1 | Open | Citation-per-figure verifier and an automated latency check are not built; summaries remain advisory and the officer signs the cited engine note. |
