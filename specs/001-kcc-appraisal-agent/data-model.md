# Data Model: Saakh KCC Appraisal Agent

Engine types (`KccInput`, `CropLine`, `SofEntry`, `KccResult`, `Step`, `Flag`) already exist in
`src/lib/kcc.ts` and are reused unchanged.

## OfficerProfile
| Field | Type | Rule |
|---|---|---|
| name | string | required, 2 to 60 chars |
| institution | string | e.g. "Sehore DCCB / PACS Ashta" |
| uiLang | LangCode | default `hi-IN` |

## Case
| Field | Type | Rule |
|---|---|---|
| id | string | random UUID |
| createdAt | ISO string | set once |
| status | `draft` \| `computed` \| `approved` \| `edited_approved` \| `rejected` | see transitions |
| district | string | must exist in SoF table |
| farmer | { name, aadhaarLast4?, village, surveyNos[] } | Aadhaar stored as last 4 only |
| farmerLang / officerLang | LangCode | independent |
| landHa | number | > 0, from land record (confirmed) |
| tenure | `Tenure` | from engine |
| crops | `CropLine[]` | each mapped to SoF crop key |
| insurancePremium, termLoan | number | optional, >= 0 |
| recoveryTieUp | boolean | default false |
| extracted | { land?, crops?, transcript? } | raw AI output before confirmation |
| sofSnapshot | Record<crop, SofEntry & { source, scope }> | frozen at compute time |
| result | `KccResult` | engine output, never edited in place |
| decision | { action, finalLimit, reason?, by, at } | reason required when finalLimit differs |
| note | { officer: string, farmer: string } | drafted text |

State transitions: `draft -> computed` (engine run on confirmed inputs); `computed -> draft` (any input edit);
`computed -> approved | edited_approved | rejected` (officer only). Approved/rejected cases are read-only.

## SofRow (default dataset `src/data/sof-mp.json` and uploads)
| Field | Type | Rule |
|---|---|---|
| district | string | required |
| crop | string | lowercase key, aliases list for spoken names (e.g. gram: chana) |
| season | `kharif` \| `rabi` \| `zaid` \| `annual` | required |
| current | number? | ₹/ha, absent if not notified |
| previous | number? | ₹/ha |
| source | `official` \| `proxy-pmfby` | required |
| scope | `district` \| `state` | required |
| ref | string | citation URL or bank circular |

CSV upload columns: `district,crop,season,current,previous,ref`; uploaded rows get `source: official`.

## AuditEvent
| Field | Type | Rule |
|---|---|---|
| seq | number | monotonically increasing per device |
| caseId | string | |
| type | `created` \| `extracted` \| `confirmed` \| `computed` \| `ai_call` \| `note_drafted` \| `decision` \| `exported` | |
| at | ISO string | |
| actor | string | officer profile name or `system` |
| data | object | minimal, no raw media, Aadhaar last 4 only |
| prevHash | string | hash of previous event or `GENESIS` |
| hash | string | SHA-256 hex |

## ValidationRun
| Field | Type |
|---|---|
| ranAt | ISO string |
| calc | { pass, total, failures[] } |
| extraction | { pass, total, failures[] } |
| parity | { pass, total, failures[] } |
| openInterpretations | string[] |

## Amendment 2026-11-26: intelligence layer

Types live in `src/lib/agent/types.ts` and are used unchanged by the route, the tools and the UI.

Changes to existing entities:
- `Case` gains `agent?: AgentRun` (`src/lib/store.ts`); any input edit clears it (`src/components/case/case-view.tsx`).
- `Case.extracted.land` gains `evidence?: LandEvidence` from the dual-read land step
  (`src/components/case/capture-land.tsx`).
- `AuditEvent.type` gains `agent_run` (`src/lib/audit.ts`). Data: `recommendation`, `confidence`, `steps`, `ms`,
  `checks { passed, total }`, `risks` as `severity:CODE` strings, `questions`, `answers` (counts), `kccLimit`,
  `summaryChars`, `models`. No summary text, no trace, no PII beyond the case id.

### `ReadField<T>` and LandEvidence
| Field | Type | Rule |
|---|---|---|
| value | T | Claude-vision read unless empty, else the Sarvam read; survey numbers normalised and de-duplicated |
| agree | boolean | both readers present and equal after normalising (name similarity >= 0.85, village >= 0.9, survey set equal, area within 2%, Aadhaar last 4 exact) |
| reads | `{ source: "sarvam-vision" \| "claude-vision", value }[]` | one entry per reader that returned |

`LandEvidence` = `ownerName`, `village`, `surveyNos`, `areaHa`, `aadhaarLast4` (each a `ReadField`) plus
`areaUnitSeen: hectare | acre | bigha`. Built by `reconcileLand(a, b)` in `src/lib/reconcile.ts`.

### Risk
| Field | Type | Rule |
|---|---|---|
| code | string | UPPER_SNAKE; rule codes listed below |
| severity | `high` \| `medium` \| `low` | rule risks sorted high first |
| title, detail | string | officer language after translation |
| evidence | string[] | the values compared |
| para | string? | when an RBI para applies (29, 13(4), 30) |
| source | `rule` \| `agent` | agent risks never replace a rule risk with the same code |

Rule codes (`src/lib/risk.ts`, 17): `LAND_NOT_VERIFIED`, `NAME_MISMATCH`, `VILLAGE_MISMATCH`, `SURVEY_MISMATCH`,
`AREA_MISMATCH`, `AADHAAR_MISMATCH`, `READ_DISAGREE`, `LAND_SINGLE_READ`, `AREA_OVERCLAIM`, `DOUBLE_FINANCING`,
`DUPLICATE_APPLICANT`, `SOF_MISSING`, `SOF_PROXY`, `TENANCY_DOCS`, `UNKNOWN_CROP`, `CROP_SEASON_IMPLAUSIBLE`,
`CROP_DISTRICT_UNUSUAL`. Crop rules read `src/data/agronomy-mp.json` (indicative MP calendar and belts, sourced;
flags only, never changes a limit).

### WhatIf
| Field | Type | Rule |
|---|---|---|
| id | string | `recovery_tieup`, `add_insurance`, `fit_area_to_land`, `drop_no_sof`, `under_threshold`, `term_loan_pump` |
| label | string | |
| change | `Partial<KccInput>` | one input changed |
| kccLimit | number | from `computeKcc` on the changed input |
| delta | number | `kccLimit` minus the base limit |
| collateralFree | boolean | from the engine |
| para | string? | 25, 13(1)(iv), 29, 13(4), 23, 19 |
| note | string | |

At most 5, threshold crossings first; a scenario that changes nothing is dropped (`src/lib/whatif.ts`).

### Check
| Field | Type |
|---|---|
| verifier | string (`figures_from_tools`, `result_is_engine`, `no_approve_with_errors`, `no_approve_with_high_risk`, `rule_risks_preserved`, `decline_needs_reason`, `summary_language_nonempty`, `required_tools`, `agent_completed`, `harness_downgrade`) |
| ok | boolean |
| detail | string |

### Question
| Field | Type | Rule |
|---|---|---|
| id | string | `q1` to `q3` |
| text | string | officer language |
| why | string | |
| askFarmer | string? | same question in the farmer's language, when meant for the farmer |

### AgentReport
| Field | Type | Rule |
|---|---|---|
| recommendation | `approve` \| `review` \| `decline` | forced to `review` on harness downgrade |
| confidence | `high` \| `medium` \| `low` | `low` on downgrade |
| summary | string | officer language; English if translation changed a figure |
| result | `KccResult` | from `compute_kcc`, never from the model |
| risks | `Risk[]` | rule risks first, then agent risks |
| whatIfs | `WhatIf[]` | |
| questions | `Question[]` | at most 3 |
| checks | `Check[]` | |
| models | string[] | distinct model ids used |
| steps, ms | number | tool results counted; wall time |

### AgentRun
| Field | Type | Rule |
|---|---|---|
| at | ISO string | |
| report | `AgentReport` | |
| trace | UI message parts (or legacy event list) | replayed by `src/components/case/agent-trace.tsx` |
| toolMs | `Record<toolCallId, ms>`? | measured on the client |

Request body types (`CaseEvidence`, `PortfolioEntry`, `SofTable`, `AgentRequest`) are defined in
`contracts/agent-api.md`.
