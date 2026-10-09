// Feedback during and after the test. No DOM here, so scripts/check_insights.js can test it with node.
//
// During the test (clarity, complete themes, the mirror card) only the raw 1-5 answers and which questions were
// handled are used: never baselines, keying, scores or archetypes. The user is only shown what they already said,
// so the feedback can't hint at where the result is heading. The functions under "results page" use the model and
// are only called once the test is over.
const Insights = (function () {
  function make(DATA) {
    const N = DATA.questions.length;
    const D = DATA.dimensions.length;
    const dimOf = DATA.questions.map((q) => q.w.findIndex((x) => x !== 0)); // every question scores one dimension
    const items = Array.from({ length: D }, (_, d) => dimOf.flatMap((x, i) => (x === d ? [i] : [])));
    const MILESTONES = [15, 30, 45];
    const STREAK = 8; // this many identical answers in a row pauses the rewards
    const BAND = 0.25; // |normalized score| from which a dimension counts as clearly low or high
    const STRONG = 0.6;

    // ---------- during the test: s = { order, pos, r }; order[0..pos) are handled (answered or skipped) ----------
    const handled = (s) => new Set(s.order.slice(0, s.pos));
    const answered = (s) => s.order.slice(0, s.pos).filter((i) => s.r[i] != null).length;
    const clarity = (s) => answered(s) / N;

    // A theme is complete once all its questions are handled and at least one was answered.
    function complete(s) {
      const h = handled(s);
      return items.map((qs) => qs.every((i) => h.has(i)) && qs.some((i) => s.r[i] != null));
    }
    // Themes with exactly one question left (the teaser names none of them).
    function nearly(s) {
      const h = handled(s);
      return items.filter((qs) => qs.filter((i) => !h.has(i)).length === 1).length;
    }

    // What one step forward (an answer or a skip) earns. A skip earns no "answer" or milestone, and nothing here
    // depends on the answer's value.
    function events(prev, next) {
      if (next.pos !== prev.pos + 1) return [];
      const qi = next.order[prev.pos];
      const ev = [];
      if (next.r[qi] != null) ev.push({ type: 'answer' });
      const d = dimOf[qi];
      if (complete(next)[d] && !complete(prev)[d]) ev.push({ type: 'complete', dim: d });
      const a0 = answered(prev), a1 = answered(next);
      MILESTONES.forEach((m) => { if (a0 < m && a1 >= m) ev.push({ type: 'milestone', n: m }); });
      return ev;
    }

    // What you said on a theme: your answers to its handled questions in the order you gave them, and a plain
    // summary of them.
    function mirror(s, d) {
      const pos = new Map(s.order.map((qi, j) => [qi, j]));
      const qs = items[d].filter((i) => pos.get(i) < s.pos).sort((a, b) => pos.get(a) - pos.get(b));
      const values = qs.map((i) => s.r[i]);
      const v = values.filter((x) => x != null);
      const n = v.length;
      const count = (f) => v.filter(f).length;
      let pattern = 'none';
      if (n) {
        if (2 * count((x) => x >= 4) > n) pattern = 'agree';
        else if (2 * count((x) => x <= 2) > n) pattern = 'disagree';
        else if (2 * count((x) => x === 3) >= n) pattern = 'middle';
        else pattern = 'mixed';
      }
      return { dim: d, items: qs, values, pattern, firm: n > 0 && 2 * count((x) => x === 1 || x === 5) > n, skipped: qs.length - n };
    }

    // Identical answers in a row, ending at the last handled question (a skip ends the run).
    function streak(s) {
      let k = 0;
      for (let j = s.pos - 1; j >= 0; j--) {
        const x = s.r[s.order[j]];
        if (x == null || (k && x !== s.r[s.order[s.pos - 1]])) break;
        k++;
      }
      return k;
    }

    // ---------- results page (uses the model) ----------
    const band = (x) => (x <= -BAND ? 'low' : x >= BAND ? 'high' : 'mid');
    const keyed = (r, d) => items[d].filter((i) => r[i] != null).map((i) => Math.sign(DATA.questions[i].w[d]) * (r[i] - 3));

    // u: normalized profile, r: answers. The gap is when the 1-5 scale alone (reverse-keyed statements flipped,
    // but not compared with typical answers) points elsewhere than the comparison with typical answers does.
    function meaning(u, r, d) {
      const k = keyed(r, d);
      const b = band(u[d]);
      const lean = k.length ? k.reduce((a, x) => a + x, 0) / k.length : 0;
      let gap = null;
      if (Math.abs(lean) >= 0.5) {
        const said = lean > 0 ? 'high' : 'low';
        if (b !== said) gap = { said, is: b };
      }
      return {
        band: b, strong: Math.abs(u[d]) >= STRONG, gap,
        mixed: k.filter((x) => x >= 1).length >= 2 && k.filter((x) => x <= -1).length >= 2, // a real split, not one outlier
      };
    }

    // Combinations whose two dimensions are both clearly on the given side, strongest first.
    function combos(u) {
      const idx = Object.fromEntries(DATA.dimensions.map((d, i) => [d.id, i]));
      return Object.entries(DATA.insights.combos)
        .filter(([, c]) => Object.entries(c.when).every(([id, side]) => band(u[idx[id]]) === side))
        .map(([id, c]) => ({ id, strength: Math.min(...Object.keys(c.when).map((k) => Math.abs(u[idx[k]]))) }))
        .sort((a, b) => b.strength - a.strength);
    }

    return { items, dimOf, clarity, answered, complete, nearly, events, mirror, streak, STREAK, band, meaning, combos };
  }
  return { make };
})();
if (typeof module !== 'undefined') module.exports = Insights;
