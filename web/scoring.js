// Scoring formulas from docs/MATH.md. Mirrors scripts/scoring.py; scripts/check_web.py verifies they agree.
const Scoring = (function () {
  function make(DATA) {
    const D = DATA.dimensions.length;
    const Q = DATA.questions;
    const T = DATA.tags.map((t) => t.v);
    const tagNorm = T.map((v) => Math.hypot(...v));

    // Steps 1-4: running weighted mean. r[i] is a 1-5 answer or null (not answered / skipped).
    function profile(r) {
      const S = new Array(D).fill(0);
      const W = new Array(D).fill(0);
      r.forEach((v, i) => {
        if (v == null) return;
        const q = Q[i];
        const a = (v - q.baseline) / Math.max(q.baseline - 1, 5 - q.baseline);
        const c = 0.5 + 0.5 * Math.abs(a);
        for (let d = 0; d < D; d++) {
          S[d] += a * q.w[d];
          W[d] += c * Math.abs(q.w[d]);
        }
      });
      return S.map((s, d) => s / (W[d] + DATA.k0));
    }

    // Step 4b: rescale each dimension so its reachable range is [-1, 1].
    function normalize(u) {
      return u.map((x, d) => (x >= 0 ? x / DATA.range.hi[d] : x / -DATA.range.lo[d]));
    }

    function score(r) {
      return normalize(profile(r));
    }

    // Step 5: per tag, cosine (direction) and strength (projection on the unit tag vector).
    function matches(u) {
      const un = Math.max(Math.hypot(...u), 1e-12);
      return T.map((t, k) => {
        const strength = t.reduce((s, x, d) => s + x * u[d], 0) / tagNorm[k];
        return { index: k, cosine: strength / un, strength };
      });
    }

    // Project a D-vector onto the 2D PCA plane fitted on the tags.
    function project(v) {
      const P = DATA.pca.P;
      return [0, 1].map((c) => v.reduce((s, x, d) => s + x * P[d][c], 0));
    }

    return { profile, normalize, score, matches, project };
  }
  return { make };
})();
if (typeof module !== 'undefined') module.exports = Scoring;
