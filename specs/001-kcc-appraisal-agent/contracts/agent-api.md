# Contract: `POST /api/agent` *(added 2026-11-26)*

Server-only route (`src/app/api/agent/route.ts`) holding `ANTHROPIC_API_KEY` (and `SARVAM_API_KEY` for
translation). Runs the appraisal agent for one case and streams its work. Never returns a figure the engine did
not produce (constitution I, spec FR-019). Types live in `src/lib/agent/types.ts`. Client:
`useChat<SaakhAgentUIMessage>` with `DefaultChatTransport({ api: "/api/agent" })` in
`src/components/case/agent-panel.tsx`; the request is built by `buildRequest(case, answers?)` in
`src/lib/agent/client.ts`.

## Request

`Content-Type: application/json`, at most 200 KB. Body `AgentPostBody`:

```json
{
  "request": {
    "evidence": {
      "caseId": "string",
      "district": "Sehore",
      "applicant": { "name": "string", "village": "string", "surveyNos": ["string"], "aadhaarLast4": "1234" },
      "landHa": 2,
      "tenure": "owner | tenant | oral_lessee | sharecropper",
      "crops": [{ "crop": "soybean", "season": "kharif | rabi | zaid | annual", "areaHa": 2 }],
      "insurancePremium": 2600,
      "termLoan": 0,
      "recoveryTieUp": false,
      "land": "LandEvidence (optional, from the dual-read land step)",
      "transcript": { "original": "string", "english": "string", "lang": "hi-IN" }
    },
    "sof": { "soybean": { "current": 43100, "previous": 42000, "source": "official | proxy-pmfby", "scope": "district | state", "ref": "string" } },
    "portfolio": [{ "caseId": "string", "farmerName": "string", "village": "string", "district": "string", "surveyNos": ["string"], "status": "string", "kccLimit": 0 }],
    "officerLang": "hi-IN",
    "farmerLang": "mr-IN",
    "answers": [{ "questionId": "q1", "question": "string", "answer": "string" }]
  }
}
```

The body also carries the `useChat` fields (`id`, `messages`, `trigger`); the route reads only `request`.
`messages` are not used: the agent history is built server-side from `request`.

Validation (400 on failure): `evidence.caseId` and non-empty `district`; `applicant` with `name`, `village`,
`surveyNos[]`; `landHa > 0`; `tenure` in the list; `recoveryTieUp` boolean; every crop has `crop`, a valid
`season` and `areaHa > 0`; `insurancePremium` and `termLoan` absent or `>= 0`; each `sof` value has numeric or
absent `current` / `previous`; `portfolio[]` entries have `caseId` and `surveyNos[]`; both languages are
supported codes; `answers` absent or at most 10 entries with string `answer`.

## Errors (before streaming)

JSON `{ "error": string, "retryable": boolean }`:

| Status | When |
|---|---|
| 400 | Body over 200 KB, invalid JSON, or a validation failure above (message names the field) |
| 503 | `ANTHROPIC_API_KEY` not set (`"AI not configured"`) |

Errors after the stream has started arrive as an AI SDK `error` chunk whose text is the same JSON
`{ error, retryable }`. A provider failure before the agent completes any step surfaces this way; a failure
after at least one step does not: the run ends with a downgraded report instead.

## Response (200)

AI SDK UI message stream (`createUIMessageStreamResponse`): `text/event-stream`, header
`x-vercel-ai-ui-message-stream: v1`. Message type `SaakhAgentUIMessage = UIMessage<never, SaakhDataParts,
SaakhTools>`. Chunk order:

1. `start`
2. `data-plan` `{ steps: string[] }`, once, before the first tool call (parsed from the agent's first text, or a
   default 4-step plan)
3. Interleaved, as the agent works:
   - text and reasoning parts (short notes between tool calls)
   - `tool-<name>` parts for each tool call: input then output (`ToolOutput { ok, summary, data?, ms? }`).
     Harness-run tools use ids `harness-<n>` and empty input.
   - `data-note` `{ text }`: harness notes (ran a skipped required tool, repair turn requested)
   - `data-question` `Question`: each question queued by `ask_officer`
4. `data-check` `Check`: one per verifier (`figures_from_tools`, `result_is_engine`, `no_approve_with_errors`,
   `no_approve_with_high_risk`, `rule_risks_preserved`, `decline_needs_reason`, `summary_language_nonempty`),
   repeated if a repair turn re-verifies, then `required_tools`, and when applicable `agent_completed` and
   `harness_downgrade`
5. `data-report` `AgentReport`: the last data part, the verified report
6. `finish`

## Tools (`tool-<name>` parts)

| Tool | Input | Output `data` | Notes |
|---|---|---|---|
| `lookup_sof` | `{ crop }` (key or local name) | SoF row with `source`, `scope`, `ref`, or `{ found: false, para: "13(4)" }` | |
| `compute_kcc` | `{}` | `KccResult` | Required before `finish`; input from evidence only |
| `run_risk_checks` | `{}` | `Risk[]` | Required before `finish` |
| `check_crop_plan` | `{}` | `Risk[]` | Season and district plausibility |
| `what_if` | `{}` | `WhatIf[]` (at most 5) | If never called, the harness computes them |
| `ask_officer` | `{ question, why, askFarmer }` | `Question` | At most 3; translated to officer and farmer language |
| `finish` | `{ recommendation, confidence, summary, agentRisks? }` | none | Offered only after both required tools ran |

## Limits

- At most 10 agent steps; time budget 75 s for the whole run including one repair turn; route `maxDuration` 90 s.
- Model `claude-sonnet-5-5` via `@ai-sdk/anthropic`; translation via Sarvam (`translate` in `src/lib/ai.ts`).
- The summary is verified in English, then translated to `officerLang` only if every digit survives
  (`figures()` in `src/lib/agent/run.ts`); otherwise English is returned.
