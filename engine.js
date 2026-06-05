/*
 * LipidLogic engine — pure statistical core for the lipid-intensification
 * outcome simulator (LDL-lowering -> CV-risk projection).
 *
 * Extracted VERBATIM from the dashboard's inline web-worker so the statistical
 * core is a single source of truth, importable under Node for testing.
 * Browser: functions are globals (plain declarations). Node: module.exports.
 *
 * Method: Cholesterol Treatment Trialists (CTT) log-linear model — every
 * 1 mmol/L LDL reduction multiplies relative risk by RR_per_mmol (Baigent et
 * al.). Risk is projected on the LOG scale: patientRR = RR_per_mmol ^ ΔLDL
 * (i.e. exp(logRR_per_mmol * ΔLDL_mmol)). Monte-Carlo over the CTT slope
 * propagates efficacy uncertainty. No methodology changes from the shipped app.
 */

// mg/dL -> mmol/L conversion factor for LDL-C (used throughout the app).
var MG_TO_MMOL = 0.02586;

// Drug potencies (fractional LDL reduction). Verbatim from the worker.
var POT_EZE = 0.18;     // ezetimibe ~18%
var POT_PCSK9 = 0.60;   // PCSK9 inhibitor ~60%

// Added LDL-lowering potency for a strategy. Combo uses the multiplicative
// independent-action model: 1 - (1-e1)(1-e2). Verbatim from the worker.
function addedPotency(strategy) {
    if (strategy === 'eze') return POT_EZE;
    if (strategy === 'pcsk9') return POT_PCSK9;
    if (strategy === 'combo') return 1 - ((1 - POT_PCSK9) * (1 - POT_EZE));
    return 0;
}

// LDL kinetics: final on-treatment LDL and the achieved reduction.
// baselineLDL is in mg/dL. Verbatim from the worker.
function ldlKinetics(baselineLDL, strategy) {
    var pot = addedPotency(strategy);
    var finalLDL = baselineLDL * (1 - pot);
    var deltaLDL_mg = baselineLDL - finalLDL;
    var deltaLDL_mmol = deltaLDL_mg * MG_TO_MMOL;
    return { finalLDL: finalLDL, deltaLDL_mg: deltaLDL_mg, deltaLDL_mmol: deltaLDL_mmol };
}

// Per-patient relative risk under the CTT log-linear model, for a given
// LDL reduction (mmol/L) and a (possibly sampled) log-RR-per-mmol slope.
// This is the load-bearing log-scale application: RR = exp(logRR * ΔLDL),
// equivalently RR_per_mmol ^ ΔLDL. Capped to [0.2, 0.99] as in the app.
function patientRR(logRR_per_mmol, deltaLDL_mmol) {
    var rr = Math.exp(logRR_per_mmol * deltaLDL_mmol);
    return Math.max(0.2, Math.min(0.99, rr));
}

// Box–Muller standard normal from two uniforms. Verbatim from the worker.
function boxMuller(u1, u2) {
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Heterogeneity spread multiplier: 0% -> 1.0, 100% -> 1.5. Verbatim.
function hetFactor(hetPenalty) {
    return 1 + (hetPenalty / 200);
}

/*
 * Monte-Carlo CTT projection. Returns mean ARR / RRR and the 100-patient
 * waffle counts. Ported VERBATIM from the worker (minus message plumbing).
 *
 * opts: { baselineLDL (mg/dL), baselineRisk (% 10-year), strategy, hetPenalty,
 *         iterations (default 20000), rng (default Math.random),
 *         rrPerMmol (default 0.78), slopeSD (default 0.03) }
 *
 * Risk math (verbatim): risk5y = baselineRisk/200 (10-year% -> 5-year fraction);
 * arr = risk5y * (1 - patientRR). Waffle: prevented = round(meanARR*100),
 * inevitable = round(baselineRisk/2 - meanARR*100), healthy = remainder.
 */
function runProjection(opts) {
    var baselineLDL = opts.baselineLDL;
    var baselineRisk = opts.baselineRisk;
    var strategy = opts.strategy;
    var hetPenalty = opts.hetPenalty || 0;
    var iterations = opts.iterations || 20000;
    var rng = opts.rng || Math.random;
    var rrPerMmol = (opts.rrPerMmol === undefined) ? 0.78 : opts.rrPerMmol;
    var slopeSD = (opts.slopeSD === undefined) ? 0.03 : opts.slopeSD;

    var kin = ldlKinetics(baselineLDL, strategy);
    var deltaLDL_mmol = kin.deltaLDL_mmol;

    var logRR_per_mmol = Math.log(rrPerMmol);
    var hf = hetFactor(hetPenalty);

    var sumARR = 0, sumRRR = 0;
    for (var i = 0; i < iterations; i++) {
        var z = boxMuller(rng(), rng());
        var sampleLogRR = logRR_per_mmol + (z * slopeSD * hf);
        var rr = patientRR(sampleLogRR, deltaLDL_mmol);
        var risk5y = baselineRisk / 200;   // 20% (10y) -> 0.10 (5y fraction)
        var arr = risk5y * (1 - rr);
        sumARR += arr;
        sumRRR += (1 - rr);
    }
    var meanARR = sumARR / iterations;
    var meanRRR = sumRRR / iterations;

    var n_prevented = Math.round(meanARR * 100);
    var n_event_inevitable = Math.round((baselineRisk / 2) - (meanARR * 100));
    var n_healthy = 100 - n_event_inevitable - n_prevented;

    return {
        finalLDL: kin.finalLDL,
        deltaLDL_mg: kin.deltaLDL_mg,
        deltaLDL_mmol: deltaLDL_mmol,
        meanARR: meanARR,
        meanRRR: meanRRR,
        n_prevented: n_prevented,
        n_event_inevitable: n_event_inevitable,
        n_healthy: n_healthy,
        strategy: strategy
    };
}

// Number-needed-to-treat from an absolute risk reduction. Verbatim semantics
// from updateMetrics(): round(1/ARR), guarded for tiny ARR.
function nntFromARR(meanARR) {
    return meanARR > 0.001 ? Math.round(1 / meanARR) : Infinity;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MG_TO_MMOL: MG_TO_MMOL,
        POT_EZE: POT_EZE,
        POT_PCSK9: POT_PCSK9,
        addedPotency: addedPotency,
        ldlKinetics: ldlKinetics,
        patientRR: patientRR,
        boxMuller: boxMuller,
        hetFactor: hetFactor,
        runProjection: runProjection,
        nntFromARR: nntFromARR
    };
}
