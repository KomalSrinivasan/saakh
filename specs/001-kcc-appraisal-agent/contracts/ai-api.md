# Contract: `POST /api/ai/[action]`

Server-only route holding `SARVAM_API_KEY` and `ANTHROPIC_API_KEY`. Returns JSON. Never returns or computes
rupee limits (constitution I). Every response includes `models: string[]` for the audit log.
Errors: `{ error: string, retryable: boolean }` with HTTP 400 (bad input), 502 (provider error), 504 (timeout > 20 s).

## `land`
Request: `multipart/form-data` with `image` (jpeg/png, <= 5 MB), `district`.
Response:
```json
{
  "fields": { "ownerName": "string", "village": "string", "surveyNos": ["string"], "areaHa": 1.2,
              "areaUnitSeen": "hectare|acre|bigha", "aadhaarLast4": "1234|null" },
  "confidence": { "areaHa": 0.0, "ownerName": 0.0 },
  "rawText": "string",
  "followUps": ["string in officerLang"],
  "models": ["sarvam-vision", "claude-sonnet-5-5"]
}
```
Rules: full Aadhaar never returned; bigha/acre converted to hectares with the unit seen reported.

*Amended 2026-11-26*: the photo is read by two readers in parallel (Sarvam Vision OCR then Claude structuring;
Claude vision directly). The response adds `"evidence": LandEvidence` (per field `{ value, agree, reads[] }`, see
data-model.md) and `fields` holds the reconciled values. Disagreements add follow-ups. `models` lists every
model that served a read. Request also accepts `officerLang`. Errors also include 404 (unknown action) and 503
(AI not configured). Each land or crops request runs under one 20 s deadline shared by both readers
(3 s reserved for translating follow-ups), meeting SC-008. `note` streams its draft when the request sets
`stream: true`; figures are verified before the officer can copy or approve.

## `crops`
Request: `multipart/form-data` with `audio` (wav/webm/m4a, <= 60 s) or `text`; `farmerLang`, `officerLang`,
`district`, `landHa`.
Response:
```json
{
  "transcript": "string (farmer language)",
  "english": "string",
  "crops": [{ "crop": "soybean", "season": "kharif", "areaHa": 1.5, "spokenAs": "सोयाबीन" }],
  "unmapped": ["string"],
  "followUps": ["string in officerLang"],
  "models": ["saaras:v4", "claude-sonnet-5-5"]
}
```
Rules: `crop` must be a key of the district SoF table or listed in `unmapped`; total area per season above
`landHa` produces a follow-up instead of silent acceptance.

## `note`
Request JSON: `{ case: Case (inputs + result), officerLang, farmerLang }`.
Response:
```json
{ "officer": "string", "farmer": "string", "models": ["claude-sonnet-5-5", "mayura:v1"] }
```
Rules: every rupee figure in the note must equal a value in `case.result` and be followed by its para; the
route verifies this by string match and rejects the draft (retry once) if any figure is not from the result.

## `tts`
Request JSON: `{ text, lang }` (text <= 1500 chars). Response: `{ audio: "base64 wav", models: ["bulbul:v3"] }`.

## `translate`
Request JSON: `{ text, from, to }`. Response: `{ text, models: ["mayura:v1"] }`.
