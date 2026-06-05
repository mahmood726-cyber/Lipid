# LipidLogic — LDL Intensification & Outcome Simulator

A single-file, **fully offline** dashboard that projects the cardiovascular
benefit of intensifying LDL-C lowering (ezetimibe, PCSK9 inhibitor, or the
combination) on top of a statin. It applies the Cholesterol Treatment Trialists
(CTT) log-linear model — every 1 mmol/L LDL reduction multiplies relative risk
by a fixed factor — and runs a small Monte-Carlo over the CTT slope to produce a
projected absolute risk reduction (ARR), number-needed-to-treat (NNT), relative
risk reduction (RRR), an LDL-trajectory waterfall, an evidence forest plot, and
a 100-patient waffle.

**Live app:** open `index.html` (or the GitHub Pages link). No build step, no
network, no external CDN.

## Layout

```
index.html   single-file UI (loads engine.js)
engine.js    pure statistical core — runs in Node and the browser
tests.js     Node test harness, 33 hand-derived assertions
LICENSE      Apache-2.0 (as originally committed to this repo)
```

## Statistical core (`engine.js`)

| Function | What it does |
|---|---|
| `addedPotency(strategy)` | fractional LDL reduction for `eze` / `pcsk9` / `combo` (combo = multiplicative independent action `1-(1-e1)(1-e2)`) |
| `ldlKinetics(baselineLDL, strategy)` | final on-treatment LDL and the achieved reduction (mg/dL and mmol/L) |
| `patientRR(logRR_per_mmol, deltaLDL_mmol)` | CTT log-scale risk multiplier `exp(logRR · ΔLDL) = RR_per_mmol^ΔLDL`, capped to [0.2, 0.99] |
| `boxMuller(u1, u2)` | standard-normal draw for the Monte-Carlo |
| `hetFactor(hetPenalty)` | heterogeneity spread multiplier (0% → 1.0, 100% → 1.5) |
| `runProjection(opts)` | Monte-Carlo CTT projection → mean ARR/RRR + 100-patient waffle counts |
| `nntFromARR(meanARR)` | number-needed-to-treat from ARR (strict `>0.001` guard) |

The risk projection is applied **on the log scale**: the per-mmol relative-risk
factor (0.78, Baigent et al.) is exponentiated by the LDL change in mmol/L,
`RR = RR_per_mmol ^ ΔLDL`, exactly as the CTT log-linear model requires.

## Fixes applied during revival (2026-06-05)

- **Made fully offline**: removed the Google Fonts CDN `<link>` (system fonts
  fall back). The page now loads no external resource — verified by
  `grep -nE 'https?://|@import'` returning nothing.
- **Extracted the statistical core** into a pure `engine.js` (single source of
  truth). The inline Web-Worker that held a duplicate copy of the math was
  removed; the page now loads `engine.js` and runs the (small) Monte-Carlo
  synchronously on the main thread.
- **Added `tests.js`** — 33 assertions, every expected value hand-derived
  independently, with a deterministic RNG so the Monte-Carlo result is exact.
- Renamed `lipid.html` → `index.html`; added `.nojekyll`, `.gitignore`, this
  README, and an E156 protocol.

No statistical bug was found: the pooling/potency/log-scale math was verified
correct and left unchanged. The only stat-adjacent subtlety is the NNT guard
boundary (the strict `>0.001` test means an ARR that floats to
`0.0010000000000000009` yields NNT≈1000, not the `>1000` sentinel) — this is
faithful to the original and is documented in the tests.

## Tests

```
node tests.js
# 33 passed, 0 failed
```

A hand-worked example (baseline LDL 100 mg/dL, PCSK9 inhibitor, 20% 10-year
risk, no heterogeneity): ΔLDL = 60 mg/dL = 1.5516 mmol/L →
`RR = 0.78^1.5516 = 0.6801` → RRR = 0.3199, ARR = 0.10 × 0.3199 = 0.03199,
NNT = 31, waffle = 3 prevented / 7 inevitable / 90 event-free.

## Caveats

This is a **transparent projection tool, not a clinical decision rule**. It
assumes the CTT log-linear LDL→risk relationship holds uniformly, fixes the
per-mmol slope at 0.78 with a coarse Monte-Carlo for slope uncertainty, and
linearly halves 10-year risk to a 5-year horizon. Drug potencies are nominal
class averages. Treat the outputs as hypothesis-generating. Apache-2.0 licensed.
