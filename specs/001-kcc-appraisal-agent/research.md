# Research: Saakh KCC Appraisal Agent

## R1. Rule source and interpretation
- Decision: RBI [Commercial Banks / RRBs / Rural Co-op Banks] KCC Scheme Directions, 2026 (19 Jun 2026, effective
  1 Jan 2027) are the only rule source. Paras 6, 8, 10, 13, 23 to 25, 29, 30 implemented in `src/lib/kcc.ts`.
- Rationale: verified from rbi.org.in notification text on 2026-11-25.
- Open: yearly compounding/rounding order (unrounded compounding, round per year) pending Annex I illustrations
  (PDF download blocked by RBI bot protection). Tracked as an open interpretation in the validation pack.
- Alternatives: pre-2027 KCC master circular (rejected, superseded for new sanctions).

## R2. Agent reasoning model
- Decision: Claude (`claude-sonnet-5-5`) via `@anthropic-ai/sdk` with tool use / JSON output for structuring
  land fields, crop lines and follow-up questions, and drafting notes.
- Rationale: user choice; reliable structured output and vision fallback. Sarvam-only kept as future option.
- Alternatives: Sarvam-105B (sovereign story, less proven tool calling), both switchable (extra half day).

## R3. Indian-language services
- Decision: Sarvam via REST `fetch`:
  - STT: `POST https://api.sarvam.ai/speech-to-text`, model `saaras:v4`, mode `transcribe` plus `translate`
    (English) for parsing; `keyterms` seeded with crop names.
  - Translate: `POST /translate`, `mayura:v1` (1000 chars) or `sarvam-translate:v1` (2000 chars), mode `formal`.
  - TTS: `POST /text-to-speech`, `bulbul:v3`, returns base64 audio.
  - Vision: Sarvam Vision document intelligence for land-record OCR; if latency exceeds 20 s or output is
    unusable, fall back to Claude vision on the same image (logged in audit as model used).
- Rationale: 22+ Indian languages, sovereign Indian stack fits jury; header `api-subscription-key`.
- Alternatives: Google STT/Translate (rejected, weaker Indic coverage story), Bhashini (onboarding time).

## R4. Storage
- Decision: `localStorage` per device for cases, audit chain, officer profile and uploaded SoF; JSON export.
- Rationale: prototype, one officer per device, zero infra, works offline; satisfies clarification Q1.
- Alternatives: Postgres/Neon (rejected for v1: infra, PII at rest), IndexedDB (more code, not needed at this
  size since images/audio are not stored).

## R5. Audit chain
- Decision: each event `{seq, caseId, type, at, actor, data, prevHash, hash}` with
  `hash = SHA-256(prevHash + canonical JSON of event without hash)` using Web Crypto `crypto.subtle`
  (available in browsers and Node 26, so testable with node:test).
- Rationale: tamper evidence with stdlib only.

## R6. SoF proxy data
- Decision: PMFBY sum insured per hectare (district-level, set by DLTC, usually equal to SoF) for Indore,
  Sehore, Ujjain, Dewas, Dhar and soybean, maize, cotton, wheat, gram, mustard, sugarcane; every row has
  `source: "proxy-pmfby"` and a citation URL. Where district values are not found, use the state-level
  value and mark `scope: "state"`.
- Rationale: official MP 2026-27 SoF tables not machine-readable online; labelled proxy keeps principle II.
- Alternatives: invent numbers (rejected), skip districts (rejected: demo needs MP).

## R7. PWA
- Decision: `app/manifest.ts` (Next.js built-in) + hand-written `public/sw.js` caching the app shell; drafts
  persist in localStorage so dropped connections lose nothing.
- Alternatives: next-pwa / serwist (rejected: extra dependency for a small shell cache).

## R8. UI languages
- Decision: static dictionaries for en and hi written by hand; mr, gu, te, ta, kn, bn, pa, ml, od generated once
  with Sarvam translate via a one-off script and committed. Runtime content (notes, summaries) translated live.
- Rationale: constitution V (no hardcoded single language) with no runtime cost for static UI.
