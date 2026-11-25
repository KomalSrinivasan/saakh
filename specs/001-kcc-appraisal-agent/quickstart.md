# Quickstart: validate Saakh end to end

## Prerequisites
- Node 26, pnpm 10.
- `.env.local` with `SARVAM_API_KEY` and `ANTHROPIC_API_KEY` (copy `.env.example`).

## Run
```bash
pnpm install
pnpm test        # engine, sof, audit, validation logic
pnpm dev         # http://localhost:3000
```

## Scenarios
1. Engine only (US1): new case, district Sehore, 2 ha, soybean kharif 2 ha + wheat rabi 2 ha, insurance 2600,
   enter manually, compute. Expect yearly limits starting ₹1,72,000 and paragraph citations (using test SoF);
   with proxy SoF, figures change but citations and proxy labels appear.
2. Photo + voice (US2): use any of `public/samples/khasra-1.jpg` to `khasra-10.jpg` (expected fields in
   `public/samples/land-expected.json`) and one of `public/samples/crop-plan-<hi|en|mr|gu|te|ta>.wav`
   (transcripts in `public/samples/crop-plans.json`). Expect fields pre-filled, a follow-up if a season is
   missing, all editable.
3. Note + decision + audit (US3): draft note, play farmer summary, edit limit with reason, approve. Open audit
   panel and run "Verify chain": expect OK. Edit an event in DevTools localStorage, verify again: expect break.
4. SoF upload (US4): upload `public/samples/sof-sehore.csv`; new case shows "official"; bad CSV shows row errors.
5. Validation pack (US5): open `/validate`, run. Expect calc 100%, extraction and parity counts, open
   interpretations listed (Annex I rounding).
6. PWA (US6): `pnpm build && pnpm start`, open on phone over the deployed URL, install, run demo case in < 3 min.
7. Agent (US7, added 2026-11-26): on a computed case, open the result step and run the agent. Expect a live
   plan and tool steps, a report whose limit equals the computed limit and a passing check list. Create a second
   case in the same village with the same survey number, approve the first, run the agent on the second:
   expect a high double-financing risk and no approve.
8. Dual read (US8, added 2026-11-26): upload a `khasra-*.jpg`; expect per-field agreement stored with the case
   and a follow-up question for any field the two readers disagree on.

## Gates
`pnpm test`, `npx tsc --noEmit`, `pnpm build`, and `git grep -n $'\xe2\x80\x94'` returns nothing.
