# E156-PROTOCOL — LipidLogic (LDL Intensification & Outcome Simulator)

- **Project:** Lipid (GitHub repo `Lipid`, user `mahmood726-cyber`)
- **Revived:** 2026-06-05 (from a single-file `lipid.html` dump)
- **Type:** single-file offline browser tool + Node-testable engine
- **Dashboard:** GitHub Pages (`index.html`)

## What changed in the revival

- Made **fully offline**: removed the Google Fonts CDN `<link>`; the app now
  loads no external resource (verified `grep -nE 'https?://|@import'` returns
  nothing). System fonts fall back.
- Extracted the statistical core into a pure `engine.js` (single source of
  truth). The inline Web-Worker that held a duplicate copy of the CTT/Monte-Carlo
  math was removed; the page loads `engine.js` and runs the small Monte-Carlo
  synchronously.
- Added `tests.js` (33 assertions, all passing) with every expected value
  hand-derived independently and a deterministic RNG for exact Monte-Carlo
  checks.
- Renamed `lipid.html` → `index.html`; added `.nojekyll`, `.gitignore`, README.
- **No statistical bug found.** The log-scale risk projection
  (`RR = RR_per_mmol ^ ΔLDL`), potency model, and waffle/NNT math were verified
  correct and left unchanged. The strict `>0.001` NNT guard boundary is
  documented in the tests as faithful behaviour.

## Body (E156 draft — CURRENT BODY)

Does intensifying LDL-lowering beyond a statin, by adding ezetimibe, a PCSK9 inhibitor, or both, translate a given LDL drop into meaningful cardiovascular benefit for a specific patient? This single-file offline tool takes a baseline LDL-C, a 10-year cardiovascular risk, and a chosen intensification strategy with nominal class-average potencies. It applies the Cholesterol Treatment Trialists log-linear model on the log scale, exponentiating a per-mmol relative-risk factor by the achieved LDL reduction, with a Monte-Carlo over the slope. The primary estimand is the projected five-year absolute risk reduction, reported with number-needed-to-treat, relative risk reduction, an LDL waterfall, a forest plot, and a hundred-patient waffle. A revival audit confirmed the log-scale and potency math were correct, extracted them into a pure engine, and locked the core behind a 33-assertion hand-derived suite. The honest read is that benefit scales with the LDL drop and baseline risk, not the drug label. The tool explores that projection transparently rather than prescribing therapy.

SUBMITTED: [ ]
