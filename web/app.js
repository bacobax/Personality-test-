(function () {
  const S = Scoring.make(DATA);
  const N = DATA.questions.length;
  const D = DATA.dimensions.length;
  const app = document.getElementById('app');
  const KEY = 'personality-test.v1';
  const TAU = 0.5; // below this profile size, report "balanced" (provisional)
  const MIN_FOR_EARLY = 10;
  const shortName = (t) => t.name.split(' (')[0];

  let st = null; // { order: question indices, pos: how many handled, r: answers by question index, done }

  // ---------- state ----------
  function shuffled(n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function fresh() { return { order: shuffled(N), pos: 0, r: new Array(N).fill(null), done: false }; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* private mode etc. */ } }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.order && s.order.length === N && s.r.length === N && s.pos >= 0 && s.pos <= N) return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  // The running profile after each handled question, starting from the typical person (all zeros).
  function trackOf(s) {
    const partial = new Array(N).fill(null);
    const t = [new Array(D).fill(0)];
    for (let j = 0; j < s.pos; j++) {
      partial[s.order[j]] = s.r[s.order[j]];
      t.push(S.score(partial));
    }
    return t;
  }
  function answeredCount(s) { return s.r.filter((v) => v != null).length; }

  // ---------- tiny DOM helper ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  function html(el, markup) { el.innerHTML = markup; return el; } // only ever used with numbers and bundled data
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function show(...nodes) { app.replaceChildren(...nodes); window.scrollTo(0, 0); }

  // ---------- screens ----------
  function intro(resumable) {
    const nodes = [
      h('h1', {}, 'Personality test'),
      h('p', { class: 'muted' }, `${N} short statements. For each one, say how much it describes you. It takes about 8 minutes.`),
      h('p', { class: 'muted' }, 'At the end you get your profile on 12 behavioral dimensions, your closest archetypes, and a map of how your answers moved you through the space.'),
      h('p', { class: 'small' }, 'Everything runs in your browser. Your answers are not sent anywhere. The archetypes are rough descriptions for fun, not a diagnosis.'),
    ];
    if (resumable) {
      nodes.push(h('button', { class: 'primary', onclick: () => { st = resumable; st.done ? result() : question(); } },
        `Continue (${resumable.pos}/${N} done)`));
      nodes.push(h('p', {}, ''));
      nodes.push(h('button', { onclick: start, style: 'width:100%' }, 'Start over'));
    } else {
      nodes.push(h('button', { class: 'primary', onclick: start }, 'Start'));
    }
    show(...nodes);
  }

  function start() { st = fresh(); save(); question(); }

  function question() {
    if (st.pos >= N) { finish(); return; }
    const qi = st.order[st.pos];
    const q = DATA.questions[qi];
    const picked = st.r[qi];
    const buttons = [1, 2, 3, 4, 5].map((v) =>
      h('button', { class: picked === v ? 'picked' : '', 'aria-label': `${v} of 5`, onclick: () => answer(v) }, String(v)));
    show(
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': N, 'aria-valuenow': st.pos },
        h('div', { style: `width:${(100 * st.pos) / N}%` })),
      h('div', { class: 'count' }, `Question ${st.pos + 1} of ${N}`),
      h('p', { class: 'question' }, q.text),
      h('div', { class: 'scale' }, buttons),
      h('div', { class: 'scale-labels' }, h('span', {}, '1 Disagree'), h('span', {}, '3 Neutral'), h('span', {}, '5 Agree')),
      h('div', { class: 'nav' },
        h('button', { class: 'link', disabled: st.pos === 0, onclick: back }, '← Back'),
        answeredCount(st) >= MIN_FOR_EARLY ? h('button', { class: 'link', onclick: finish }, 'See results now') : null,
        h('button', { class: 'link', onclick: skip }, 'Skip →')),
    );
  }

  function answer(v) { st.r[st.order[st.pos]] = v; st.pos++; save(); question(); }
  function skip() { st.r[st.order[st.pos]] = null; st.pos++; save(); question(); }
  function back() {
    if (st.pos === 0) return;
    st.pos--;
    st.r[st.order[st.pos]] = null;
    save();
    question();
  }
  function finish() { st.done = true; save(); result(); }

  // ---------- charts (SVG strings built only from numbers and bundled data) ----------
  const LABEL_AT = { // [dx, dy, anchor] overrides so close tags don't collide
    adventurer: [7, 12, 'start'], performer: [-7, -5, 'end'], grandiose_narcissist: [0, -9, 'middle'],
    psychopathic: [0, 15, 'middle'], rebel: [7, -6, 'start'], worrier: [-6, -8, 'end'], perfectionist: [-7, 4, 'end'],
    peacemaker: [7, -6, 'start'], caregiver: [7, 12, 'start'],
  };

  function pathChart(track, top) {
    const W = 360, H = 360, cx = W / 2, cy = H / 2;
    const tagXY = DATA.tags.map((t) => S.project(t.v));
    const trkXY = track.map((u) => S.project(u));
    const lim = 1.12 * Math.max(...tagXY.flat().map(Math.abs), ...trkXY.flat().map(Math.abs));
    const px = (x) => cx + (x / lim) * (cx - 14);
    const py = (y) => cy - (y / lim) * (cy - 14);
    let g = `<line class="axis" x1="0" y1="${cy}" x2="${W}" y2="${cy}"/><line class="axis" x1="${cx}" y1="0" x2="${cx}" y2="${H}"/>`;
    const n = trkXY.length - 1;
    for (let i = 1; i <= n; i++) {
      const [x0, y0] = trkXY[i - 1], [x1, y1] = trkXY[i];
      const o = (0.18 + 0.82 * (i / n)).toFixed(2);
      g += `<line x1="${px(x0).toFixed(1)}" y1="${py(y0).toFixed(1)}" x2="${px(x1).toFixed(1)}" y2="${py(y1).toFixed(1)}" stroke="var(--ink)" stroke-opacity="${o}" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    DATA.tags.forEach((t, k) => {
      const [x, y] = tagXY[k];
      const isTop = top.includes(k);
      const [dx, dy, anchor] = LABEL_AT[t.id] || [7, -6, 'start'];
      g += `<circle cx="${px(x).toFixed(1)}" cy="${py(y).toFixed(1)}" r="4.5" fill="var(--cat-${t.category})"/>`;
      if (isTop) g += `<circle cx="${px(x).toFixed(1)}" cy="${py(y).toFixed(1)}" r="9" fill="none" stroke="var(--ink)" stroke-width="1.4"/>`;
      g += `<text class="lbl" x="${(px(x) + dx).toFixed(1)}" y="${(py(y) + dy).toFixed(1)}" text-anchor="${anchor}" ${isTop ? 'font-weight="700"' : ''}>${esc(shortName(t))}</text>`;
    });
    const [sx, sy] = trkXY[0], [ex, ey] = trkXY[n];
    g += `<circle cx="${px(sx)}" cy="${py(sy)}" r="4.5" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.6"/>`;
    g += `<text class="lbl sub" x="${px(sx) + 7}" y="${py(sy) + 12}">start: typical person</text>`;
    g += `<circle cx="${px(ex).toFixed(1)}" cy="${py(ey).toFixed(1)}" r="6" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/>`;
    g += `<text class="lbl" x="${(px(ex) + 9).toFixed(1)}" y="${(py(ey) + 3).toFixed(1)}" font-weight="700">you</text>`;
    const ev = DATA.pca.explained.map((e) => Math.round(e * 100));
    g += `<text class="lbl sub" x="${W - 4}" y="${cy - 5}" text-anchor="end">PC1 (${ev[0]}%)</text><text class="lbl sub" x="${cx + 5}" y="12">PC2 (${ev[1]}%)</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your path through the tag space">${g}</svg>`;
  }

  function timeChart(track, top) {
    const W = 360, H = 190, L = 28, R = 84, T = 8, B = 24;
    const n = track.length - 1;
    const cos = track.map((u) => (Math.hypot(...u) > 0 ? S.matches(u).map((m) => m.cosine) : new Array(DATA.tags.length).fill(0)));
    const x = (i) => L + (i / Math.max(n, 1)) * (W - L - R);
    const lowest = Math.min(0, ...cos.map((row) => Math.min(...top.map((k) => row[k]))));
    const floor = Math.max(-1, Math.floor(lowest * 2) / 2); // 0, -0.5 or -1, so the plot isn't mostly empty
    const y = (c) => T + ((1 - c) / (1 - floor)) * (H - T - B);
    let g = '';
    [-1, -0.5, 0, 0.5, 1].filter((c) => c >= floor).forEach((c) => {
      g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(c)}" y2="${y(c)}"/><text class="lbl sub" x="${L - 4}" y="${y(c) + 3}" text-anchor="end">${c}</text>`;
    });
    const styles = [['none', 2.4], ['6 4', 2], ['2 3', 2]];
    const ends = [];
    top.forEach((k, rank) => {
      const pts = cos.map((c, i) => `${x(i).toFixed(1)},${y(c[k]).toFixed(1)}`).join(' ');
      g += `<polyline points="${pts}" fill="none" stroke="var(--ink)" stroke-opacity="${[1, 0.7, 0.45][rank]}" stroke-width="${styles[rank][1]}" stroke-dasharray="${styles[rank][0]}" stroke-linejoin="round"/>`;
      ends.push([y(cos[n][k]), `${shortName(DATA.tags[k])} ${Math.round(cos[n][k] * 100)}%`]);
    });
    ends.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ends.length; i++) if (ends[i][0] - ends[i - 1][0] < 12) ends[i][0] = ends[i - 1][0] + 12; // keep labels apart
    ends.forEach(([ey, txt]) => { g += `<text class="lbl" x="${W - R + 5}" y="${ey + 3}">${esc(txt)}</text>`; });
    g += `<text class="lbl sub" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">questions handled</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="How your top matches built up over the test">${g}</svg>`;
  }

  // ---------- results ----------
  function result() {
    const u = S.score(st.r);
    const norm = Math.hypot(...u);
    const ms = S.matches(u).sort((a, b) => b.cosine - a.cosine);
    const top = ms.slice(0, 3).map((m) => m.index);
    const track = trackOf(st);
    const answered = answeredCount(st);
    const pct = (c) => Math.max(0, Math.round(c * 100));

    const nodes = [h('h1', {}, norm < TAU ? 'A balanced profile' : `You're closest to ${shortName(DATA.tags[top[0]])}`)];
    if (answered < 20) nodes.push(h('p', { class: 'small' }, `Based on only ${answered} answers, so treat this as a rough first guess.`));
    if (norm < TAU) {
      nodes.push(h('div', { class: 'balanced' }, 'Your answers sit close to the typical person on most dimensions, so no archetype really stands out. The closest ones are below anyway.'));
    }
    ms.slice(0, 3).forEach((m) => {
      const t = DATA.tags[m.index];
      nodes.push(h('div', { class: 'tag-card' },
        h('div', { class: 'top' }, h('span', { class: `dot cat-${t.category}` }), h('span', { class: 'name' }, t.name), h('span', { class: 'pct' }, `${pct(m.cosine)}%`)),
        h('p', {}, t.description),
        h('div', { class: 'meter' }, h('div', { style: `width:${pct(m.cosine)}%` }))));
    });
    nodes.push(h('p', { class: 'small' }, 'The percentage is how similar the direction of your profile is to the archetype (cosine similarity).'));

    nodes.push(h('h2', {}, 'Your profile'));
    DATA.dimensions.forEach((d, i) => {
      const v = u[i];
      const style = v >= 0 ? `left:50%;width:${(Math.min(Math.abs(v), 1) * 50).toFixed(1)}%` : `right:50%;width:${(Math.min(Math.abs(v), 1) * 50).toFixed(1)}%`;
      nodes.push(h('div', { class: 'dim' }, h('span', { class: 'lo' }, d.low), h('div', { class: 'bar', role: 'img', 'aria-label': `${d.name}: ${v.toFixed(2)}` }, h('div', { style })), h('span', { class: 'hi' }, d.high)));
    });
    nodes.push(h('p', { class: 'small' }, 'The center line is the typical person. Each bar is scaled so a full bar is the most extreme score the test can give on that dimension.'));

    nodes.push(h('h2', {}, 'Your path through the test'));
    nodes.push(h('p', { class: 'muted' }, 'Each answer moved your running profile. The path starts at the typical person (hollow dot), gets darker with later answers, and ends at you. Circled archetypes are your top 3.'));
    nodes.push(html(h('div', {}), pathChart(track, top)));
    nodes.push(html(h('div', { class: 'legend' }), '<span><i class="dot cat-dark"></i>dark</span><span><i class="dot cat-bright"></i>bright</span><span><i class="dot cat-neutral"></i>neutral</span>'));

    nodes.push(h('h2', {}, 'How your matches built up'));
    nodes.push(html(h('div', {}), timeChart(track, top)));

    const rows = ms.map((m) => h('tr', {}, h('td', {}, DATA.tags[m.index].name), h('td', {}, `${Math.round(m.cosine * 100)}%`)));
    nodes.push(h('details', {}, h('summary', {}, 'All 15 archetypes'), h('table', {}, h('tbody', {}, rows))));
    nodes.push(h('p', { class: 'small' }, 'Archetypes are rough descriptions for fun, not a diagnosis. Answers are compared with typical answers from online samples, so results are approximate.'));
    nodes.push(h('button', { class: 'primary', onclick: () => { clear(); st = null; intro(null); } }, 'Take it again'));
    show(...nodes);
  }

  // ---------- boot ----------
  const saved = load();
  intro(saved && saved.pos > 0 ? saved : null);
})();
