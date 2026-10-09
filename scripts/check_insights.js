// Checks that the feedback shown while answering can't hint at the result (see web/insights.js).
//
// Usage: node scripts/check_insights.js   (run scripts/build_web.py first if the model or questions changed)
//
// 1. Same questions handled, different answer values: identical rewards (+1, theme complete, milestones), clarity,
//    complete themes and teaser. Only the mirror card's content may differ, since it shows what you said.
// 2. Same session, a scrambled scoring model (baselines, keying, weights, tags): everything shown while answering,
//    the mirror card included, is identical. So none of it uses what the model makes of the answers.
// 3. The interface has every string the feedback needs, in every language.
const assert = require('assert');
const DATA = require('../web/data.js');
const Insights = require('../web/insights.js');
const UI = require('../web/i18n.js');

let seed = 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const randInt = (n) => Math.floor(rand() * n);
const N = DATA.questions.length;
const D = DATA.dimensions.length;

function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// A session: question order, which steps are skips, and the answer values. Returns everything the page would show
// while answering, after every step.
function run(I, order, skips, values, withMirror) {
  const s = { order, pos: 0, r: new Array(N).fill(null) };
  const shown = [];
  for (let j = 0; j < N; j++) {
    const prev = { order, pos: s.pos, r: s.r.slice() };
    s.r[order[j]] = skips[j] ? null : values[j];
    s.pos++;
    const ev = I.events(prev, s);
    const step = { ev, clarity: I.clarity(s), complete: I.complete(s), nearly: I.nearly(s) };
    if (withMirror) step.mirror = ev.filter((e) => e.type === 'complete').map((e) => I.mirror(s, e.dim));
    shown.push(step);
  }
  return shown;
}

const I = Insights.make(DATA);
assert.strictEqual(I.items.flat().length, N, 'every question belongs to exactly one dimension');

// 1. answer values don't change anything but the mirror card's content
for (let k = 0; k < 300; k++) {
  const order = shuffled(N);
  const pSkip = k < 100 ? 0 : rand() * 0.5;
  const skips = order.map(() => rand() < pSkip);
  const a = order.map(() => 1 + randInt(5));
  const b = k % 3 ? order.map(() => 1 + randInt(5)) : order.map(() => 3); // also all-neutral vs random
  assert.deepStrictEqual(run(I, order, skips, a, false), run(I, order, skips, b, false), `values changed the rewards (case ${k})`);
}

// 2. the scoring model doesn't change anything shown while answering
for (let k = 0; k < 50; k++) {
  const fake = JSON.parse(JSON.stringify(DATA));
  fake.questions.forEach((q) => {
    q.baseline = 1 + rand() * 4;
    q.w = q.w.map((x) => (x ? (rand() < 0.5 ? -1 : 1) * (0.1 + rand()) : 0));
  });
  fake.tags.forEach((t) => { t.v = t.v.map(() => rand() * 2 - 1); });
  fake.range = { lo: fake.range.lo.map(() => -rand()), hi: fake.range.hi.map(() => rand()) };
  const J = Insights.make(fake);
  const order = shuffled(N);
  const skips = order.map(() => rand() < 0.2);
  const values = order.map(() => 1 + randInt(5));
  assert.deepStrictEqual(run(J, order, skips, values, true), run(I, order, skips, values, true), `model changed the feedback (case ${k})`);
}

// Smaller checks: events per step, streaks, the mirror card.
{
  const order = shuffled(N);
  const shown = run(I, order, order.map(() => false), order.map(() => 4), true);
  const all = shown.flatMap((x) => x.ev);
  assert.strictEqual(all.filter((e) => e.type === 'answer').length, N);
  assert.strictEqual(all.filter((e) => e.type === 'complete').length, D, 'each theme completes once');
  assert.deepStrictEqual(all.filter((e) => e.type === 'milestone').map((e) => e.n), [15, 30, 45]);
  assert.strictEqual(shown[N - 1].clarity, 1);
  shown.flatMap((x) => x.mirror).forEach((m) => assert.strictEqual(m.pattern, 'agree'));

  const allSkipped = run(I, order, order.map(() => true), order.map(() => 4), false).flatMap((x) => x.ev);
  assert.strictEqual(allSkipped.length, 0, 'skips earn nothing, and an all-skipped theme never completes');

  const s = { order, pos: 10, r: new Array(N).fill(null) };
  order.slice(0, 10).forEach((qi, j) => { s.r[qi] = j < 2 ? 1 : 5; });
  assert.strictEqual(I.streak(s), 8);
  s.r[order[5]] = null;
  assert.strictEqual(I.streak(s), 4, 'a skip ends the run');

  const d = I.dimOf[order[0]];
  const m = I.mirror({ order, pos: 1, r: s.r }, d);
  assert.deepStrictEqual(m.items, [order[0]], 'the mirror only lists handled questions');
}
{
  const r = new Array(N).fill(null);
  const s = { order: I.items[0].concat(I.items.slice(1).flat()), pos: 5, r };
  [[5, 5, 4, 2, 5], [1, 2, 1, 3, 4], [3, 3, 3, 1, 5], [5, 1, 4, 2, 3]].forEach((vals, k) => {
    I.items[0].forEach((qi, j) => { r[qi] = vals[j]; });
    assert.strictEqual(I.mirror(s, 0).pattern, ['agree', 'disagree', 'middle', 'mixed'][k]);
  });
}

// 3. strings
const need = ['said_agree', 'said_disagree', 'said_middle', 'said_mixed', 'said_none', 'milestone15', 'milestone30', 'milestone45'];
for (const [lang, strings] of Object.entries(UI)) {
  const missing = Object.keys(UI.en).concat(need).filter((key) => !(key in strings));
  assert.deepStrictEqual(missing, [], `web/i18n.js ${lang}: missing ${missing}`);
}

console.log('insights: rewards and feedback during the test depend only on which questions were handled');
