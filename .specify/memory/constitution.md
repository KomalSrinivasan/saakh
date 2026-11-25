<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.1.0 (2026-11-26)
- Modified principles: I (what-if amounts allowed in deterministic tested code that re-runs the engine; limits still only from kcc.ts), II (interpretation marker is now `interpretation:`), VII (renamed Minimalism, wording only)
- Modified sections: Technology & Compliance Constraints (platform is Cloudflare Workers via OpenNext; secrets are Workers secrets)
- Resolves analysis findings D1, D2, D4 (specs/001-kcc-appraisal-agent/analysis.md)
- Templates requiring updates: none
- Previous: 1.0.0 initial ratification (2026-11-25)
-->
# Saakh Constitution

## Core Principles

### I. Deterministic Rules Decide Every Number (NON-NEGOTIABLE)
- Every rupee figure (drawing limits, yearly limits, KCC limit, collateral and Flexi KCC eligibility)
  MUST be computed by the deterministic engine in `src/lib/kcc.ts`. Scenario inputs for what-ifs
  (premium estimate, term-loan size, area cut) MAY be derived by deterministic, tested code in
  `src/lib/whatif.ts`, which then re-runs the engine for the limit.
- AI models MUST only extract inputs, ask follow-up questions, explain results and draft text.
  An AI model MUST NOT produce, round or override a limit.
- The engine MUST be pure (no I/O, no network, no model calls) and covered by `node:test` cases.

Rationale: lenders, auditors and RBI need reproducible numbers; LLM arithmetic is not auditable.

### II. Every Figure Cites Its Rule
- Each computed step MUST carry the paragraph of the RBI KCC Directions, 2026 (19 Jun 2026,
  effective 1 Jan 2027) that produced it, and this citation MUST be shown in the UI and the
  sanction note.
- Any interpretation not explicit in the Directions MUST be marked in code with an
  `interpretation:` comment and listed in the validation pack until confirmed.
- Proxy data (e.g. PMFBY sum insured used as Scale of Finance) MUST be labelled as proxy wherever
  it is displayed.

### III. Human Officer Approves (No Auto-Sanction)
- The system MUST NOT sanction, reject or disburse. It produces a recommendation and a draft note.
- A named officer MUST approve, edit or reject; edits to any engine output MUST capture a reason.

### IV. Audit Trail by Default
- Every case MUST record: inputs (as extracted and as confirmed), engine version, Directions
  reference, SoF source, model calls made (model name, purpose), officer action and timestamp.
- Audit records MUST be append-only and hash-chained so tampering is detectable.

### V. Multilingual First
- Farmers and officers MUST be able to use any language supported by Sarvam Saaras (speech) and
  Mayura/Sarvam-Translate (text); Hindi and English are the core and MUST be fully tested.
- Generated notes MUST be available in the officer's language and the farmer's language, with
  text-to-speech for the farmer.
- UI copy MUST NOT hardcode a single language; static strings live in one dictionary per language.

### VI. Privacy by Minimisation
- Logs and audit records MUST NOT store farmer PII beyond what the audit needs (name, land record
  identifiers, figures). Aadhaar numbers MUST be masked to last 4 digits; raw audio and images
  MUST NOT be persisted server-side after extraction unless the officer attaches them to the case.
- API keys MUST live only in environment variables (`.env.local`, Workers secrets), never in code.

### VII. Minimalism
- Fewest files and dependencies that work: stdlib and platform features first, then existing
  dependencies, then minimal new code. New dependencies require a one-line justification in the plan.
- Tests use `node:test` with `node:assert`; no test framework.
- Comments are one line max; no em dashes in code, docs or UI copy.

## Technology & Compliance Constraints

- Platform: installable PWA built with Next.js 16 (App Router, TypeScript), deployed on Cloudflare Workers via OpenNext
  (https://saakh.komalvardhan.com).
- AI: Claude for agent reasoning and drafting; Sarvam for speech-to-text (Saaras v4), document
  vision, translation (Mayura / Sarvam-Translate) and text-to-speech (Bulbul v3).
- Regulatory basis: RBI KCC Directions, 2026 for commercial banks, SFBs, RRBs and rural
  co-operative banks. Loans sanctioned before 1 Jan 2027 stay on extant guidelines.
- Demo data MUST be synthetic or public; no real farmer data before a bank pilot agreement.
- Deadline context: BUILD 2036 prototype submission 30 Nov 2026, finale 14 Dec 2026.

## Development Workflow & Quality Gates

- Spec Kit flow: constitution, specify, clarify, plan, tasks, analyze, then implement.
- Gates before merge to main: `pnpm test` green, `tsc --noEmit` clean, `pnpm build` succeeds,
  no em dashes (`git grep` check), engine changes add or update a test citing the paragraph.
- Commits follow Conventional Commits. No AI co-author trailers.

## Governance

- This constitution supersedes other practices for Saakh. Plans MUST include a Constitution Check
  and justify any violation in Complexity Tracking.
- Amendments: edit this file, bump the version (MAJOR for removed/redefined principles, MINOR for
  new principles or sections, PATCH for wording), and note the change in the Sync Impact Report.
- Contributor and framework guidance lives in `AGENTS.md`.

**Version**: 1.1.0 | **Ratified**: 2026-11-25 | **Last Amended**: 2026-11-26
