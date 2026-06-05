/*
 * Node tests for the LipidLogic engine. Run: node tests.js
 * Every expected value is hand-computed independently of the engine, with the
 * derivation shown inline. Monte-Carlo paths use a deterministic RNG so the
 * result is exact and hand-checkable (no stochastic tolerance needed).
 */
const E = require('./engine.js');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  ok  ' + name); }
    else { fail++; console.log(' FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}
function close(a, b, tol) { return Math.abs(a - b) < (tol || 1e-9); }

// ----- potency -----
// eze = 0.18; pcsk9 = 0.60; combo = 1-(1-0.60)(1-0.18) = 1-0.40*0.82 = 1-0.328 = 0.672
ok('addedPotency eze = 0.18', close(E.addedPotency('eze'), 0.18));
ok('addedPotency pcsk9 = 0.60', close(E.addedPotency('pcsk9'), 0.60));
ok('addedPotency combo = 0.672', close(E.addedPotency('combo'), 0.672), 'got ' + E.addedPotency('combo'));
ok('addedPotency unknown -> 0', E.addedPotency('none') === 0);

// ----- LDL kinetics -----
// baseline 100 mg/dL, pcsk9: final = 100*(1-0.60) = 40; delta_mg = 60;
// delta_mmol = 60 * 0.02586 = 1.5516
const kin = E.ldlKinetics(100, 'pcsk9');
ok('kinetics finalLDL = 40', close(kin.finalLDL, 40));
ok('kinetics deltaLDL_mg = 60', close(kin.deltaLDL_mg, 60));
ok('kinetics deltaLDL_mmol = 1.5516', close(kin.deltaLDL_mmol, 1.5516, 1e-9), 'got ' + kin.deltaLDL_mmol);

// ----- patientRR: CTT log-scale application RR = exp(logRR * dLDL) = RR^dLDL -----
// logRR_per_mmol = ln(0.78) = -0.2484614; * 1.5516 = -0.3855548; exp = 0.6801019
ok('patientRR log-scale = 0.6801019',
   close(E.patientRR(Math.log(0.78), 1.5516), 0.6801019, 1e-6),
   'got ' + E.patientRR(Math.log(0.78), 1.5516));
// equivalence: exp(logRR*d) === RR_per_mmol ^ d (log-scale identity)
ok('patientRR == RR^dLDL identity',
   close(E.patientRR(Math.log(0.78), 1.5516), Math.pow(0.78, 1.5516), 1e-12));
// cap floor at 0.2: a huge reduction would push RR below 0.2 -> clamps
ok('patientRR floored at 0.2', close(E.patientRR(Math.log(0.78), 100), 0.2));
// cap ceiling at 0.99: zero reduction -> RR=1 -> clamps to 0.99
ok('patientRR ceiled at 0.99', close(E.patientRR(Math.log(0.78), 0), 0.99));

// ----- boxMuller -----
// u1=u2=0.5: sqrt(-2 ln 0.5) * cos(pi) = sqrt(1.3862944)*(-1) = -1.1774100
ok('boxMuller(0.5,0.5) = -1.1774100',
   close(E.boxMuller(0.5, 0.5), -1.1774100, 1e-6), 'got ' + E.boxMuller(0.5, 0.5));

// ----- hetFactor -----
ok('hetFactor 0 = 1.0', close(E.hetFactor(0), 1.0));
ok('hetFactor 100 = 1.5', close(E.hetFactor(100), 1.5));

// ===== HAND-WORKED FULL PROJECTION (deterministic) =====
// With hetPenalty=0, hetFactor=1, but the z noise term still multiplies slopeSD.
// To make the MC exactly hand-checkable, drive slopeSD=0 so every sample uses
// the central CTT slope ln(0.78). Then for baselineLDL=100, pcsk9, risk=20:
//   deltaLDL_mmol = 1.5516
//   patientRR     = exp(ln(0.78)*1.5516) = 0.6801019
//   RRR per iter  = 1 - 0.6801019 = 0.3198981
//   risk5y        = 20/200 = 0.10
//   ARR per iter  = 0.10 * 0.3198981 = 0.03198981
//   meanARR = 0.03198981, meanRRR = 0.3198981 (all iters identical)
//   n_prevented   = round(0.03198981*100) = round(3.198981) = 3
//   n_inevitable  = round(20/2 - 3.198981) = round(6.801019) = 7
//   n_healthy     = 100 - 7 - 3 = 90
const proj = E.runProjection({
    baselineLDL: 100, baselineRisk: 20, strategy: 'pcsk9',
    hetPenalty: 0, iterations: 1000, slopeSD: 0, rng: () => 0.5
});
ok('proj meanRRR = 0.3198981', close(proj.meanRRR, 0.3198981, 1e-6), 'got ' + proj.meanRRR);
ok('proj meanARR = 0.03198981', close(proj.meanARR, 0.03198981, 1e-7), 'got ' + proj.meanARR);
ok('proj n_prevented = 3', proj.n_prevented === 3, 'got ' + proj.n_prevented);
ok('proj n_event_inevitable = 7', proj.n_event_inevitable === 7, 'got ' + proj.n_event_inevitable);
ok('proj n_healthy = 90', proj.n_healthy === 90, 'got ' + proj.n_healthy);
ok('proj waffle sums to 100',
   proj.n_prevented + proj.n_event_inevitable + proj.n_healthy === 100);
// NNT = round(1/0.03198981) = round(31.26) = 31
ok('nntFromARR(meanARR) = 31', E.nntFromARR(proj.meanARR) === 31, 'got ' + E.nntFromARR(proj.meanARR));

// ----- heterogeneity is symmetric in expectation (rng=0.5 -> z fixed),
//        but with rng=0.5 the noise is deterministic; confirm het scales it.
// slopeSD=0.03, hetPenalty=100 -> hf=1.5; z=-1.17741 (from rng 0.5,0.5)
//   sampleLogRR = ln(0.78) + (-1.17741 * 0.03 * 1.5) = -0.2484614 - 0.05298 = -0.3014459
//   patientRR = exp(-0.3014459 * 1.5516) = exp(-0.4677) = 0.626432
const projHet = E.runProjection({
    baselineLDL: 100, baselineRisk: 20, strategy: 'pcsk9',
    hetPenalty: 100, iterations: 500, slopeSD: 0.03, rng: () => 0.5
});
// hand: z=-1.1774100; sampleLogRR = -0.2484614 + (-1.1774100*0.03*1.5) = -0.3014449
// rr = exp(-0.3014449*1.5516) = 0.6264340; RRR = 0.3735660
ok('proj het meanRRR = 0.3735660', close(projHet.meanRRR, 0.3735660, 1e-5), 'got ' + projHet.meanRRR);

// ----- edge cases -----
// k=1 analogue: a single iteration must not produce NaN
const one = E.runProjection({
    baselineLDL: 100, baselineRisk: 20, strategy: 'pcsk9',
    iterations: 1, slopeSD: 0, rng: () => 0.5
});
ok('single iteration: meanARR finite & not NaN', isFinite(one.meanARR) && !isNaN(one.meanARR));

// two-identical analogue: doubling identical iterations leaves the mean unchanged
const two = E.runProjection({
    baselineLDL: 100, baselineRisk: 20, strategy: 'pcsk9',
    iterations: 2, slopeSD: 0, rng: () => 0.5
});
ok('two identical iters: same mean as one', close(two.meanARR, one.meanARR, 1e-12));

// empty guard: zero LDL reduction (strategy 'none') -> RR clamps to 0.99,
//   RRR = 0.01, ARR = 0.10*0.01 = 0.001, NNT guard returns Infinity (ARR not > 0.001)
const none = E.runProjection({
    baselineLDL: 100, baselineRisk: 20, strategy: 'none',
    iterations: 10, slopeSD: 0, rng: () => 0.5
});
ok('strategy none: deltaLDL = 0', close(none.deltaLDL_mmol, 0));
ok('strategy none: meanRRR = 0.01 (RR clamped 0.99)', close(none.meanRRR, 0.01, 1e-9), 'got ' + none.meanRRR);
ok('strategy none: ARR = 0.001', close(none.meanARR, 0.001, 1e-9), 'got ' + none.meanARR);
// NNT guard is strict (> 0.001). 0.10*0.01 floats to 0.0010000000000000009,
// which IS > 0.001, so NNT = round(1/0.001) = 1000 (faithful behaviour).
ok('nntFromARR at ARR just over guard -> 1000', E.nntFromARR(none.meanARR) === 1000, 'got ' + E.nntFromARR(none.meanARR));
// A value clearly at/below the guard returns Infinity (the >1000 sentinel).
ok('nntFromARR at ARR=0.0005 -> Infinity', E.nntFromARR(0.0005) === Infinity);
ok('nntFromARR at ARR=0.001 exactly -> Infinity', E.nntFromARR(0.001) === Infinity);

// probability sanity: every per-patient RR is a valid probability multiplier in [0,1]
ok('patientRR always <= 1', E.patientRR(Math.log(0.78), 0.0001) <= 1);
ok('patientRR always >= 0', E.patientRR(Math.log(0.78), 1000) >= 0);

// eze hand-check: delta_mg = 100*0.18 = 18; delta_mmol = 18*0.02586 = 0.46548
//   rr = exp(ln(0.78)*0.46548) = 0.8907836; RRR = 0.1092164
const projEze = E.runProjection({
    baselineLDL: 100, baselineRisk: 20, strategy: 'eze',
    iterations: 100, slopeSD: 0, rng: () => 0.5
});
ok('eze meanRRR = 0.1092164', close(projEze.meanRRR, 0.1092164, 1e-6), 'got ' + projEze.meanRRR);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
