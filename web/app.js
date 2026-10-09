(function () {
  const S = Scoring.make(DATA);
  const I = Insights.make(DATA);
  const N = DATA.questions.length;
  const D = DATA.dimensions.length;
  const app = document.getElementById('app');
  const KEY = 'personality-test.v1';
  const LANG_KEY = 'personality-test.lang';
  const PREFS_KEY = 'personality-test.prefs';
  const TAU = 0.5; // below this profile size, report "balanced" (provisional)
  const MIN_FOR_EARLY = 10;
  const LANGS = [['en', 'EN'], ['it', 'IT']];

  // { order: question indices, pos: how many handled, r: answers by question index, done,
  //   plain: no feedback while answering, seen: cards and milestones already shown (so going back or resuming
  //   doesn't replay them) }
  let st = null;
  let lang = 'en';
  let current = null; // the screen function currently shown, so a language switch can redraw it
  let prefs = { plain: false, buzz: true };
  let enterDir = ''; // 'next' or 'prev': how the next question screen slides in
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- language ----------
  function initialLang() {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved && UI[saved]) return saved;
    } catch (e) { /* ignore */ }
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return UI[nav] ? nav : 'en';
  }
  function t(key, vars) {
    const s = (UI[lang] && UI[lang][key]) || UI.en[key] || key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''));
  }
  const tr = () => DATA.i18n[lang] || null;
  const qText = (q) => (tr() && tr().questions[q.id]) || q.text;
  const dimText = (d) => (tr() && tr().dimensions[d.id]) || d;
  const tagText = (g) => (tr() && tr().tags[g.id]) || g;
  const shortName = (g) => tagText(g).name.split(' (')[0];
  const ins = () => (tr() && tr().insights) || DATA.insights;
  const themeText = (d) => ins().themes[DATA.dimensions[d].id];

  function setLang(l) {
    if (l === lang) return;
    lang = l;
    document.documentElement.lang = l;
    try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* ignore */ }
    const y = window.scrollY;
    if (current) current();
    window.scrollTo(0, y);
    if (cardDim != null) card(cardDim);
  }

  // ---------- state ----------
  function shuffled(n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function fresh() { return { order: shuffled(N), pos: 0, r: new Array(N).fill(null), done: false, plain: prefs.plain, seen: [] }; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* private mode etc. */ } }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.order && s.order.length === N && s.r.length === N && s.pos >= 0 && s.pos <= N) {
        if (!Array.isArray(s.seen)) s.seen = [];
        s.plain = !!s.plain;
        return s;
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function loadPrefs() {
    try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); } catch (e) { /* ignore */ }
  }
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }
  const snapshot = (s) => ({ order: s.order, pos: s.pos, r: s.r.slice() });

  // The running profile after each handled question, starting from the typical person (all zeros).
  function trackOf(s) {
    const partial = new Array(N).fill(null);
    const tk = [new Array(D).fill(0)];
    for (let j = 0; j < s.pos; j++) {
      partial[s.order[j]] = s.r[s.order[j]];
      tk.push(S.score(partial));
    }
    return tk;
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

  function langBar() {
    return h('div', { class: 'lang', role: 'group', 'aria-label': t('lang') },
      LANGS.map(([code, label]) => h('button', {
        class: 'lang-btn', 'aria-pressed': String(code === lang), lang: code, onclick: () => setLang(code),
      }, label)));
  }
  function show(fn, ...nodes) {
    current = fn;
    app.replaceChildren(langBar(), ...nodes);
    window.scrollTo(0, 0);
  }

  // ---------- screens ----------
  function intro() {
    const resumable = load();
    const canResume = resumable && resumable.pos > 0;
    const nodes = [
      h('h1', {}, t('title')),
      h('p', { class: 'muted' }, t('intro1', { n: N })),
      h('p', { class: 'muted' }, t('intro2')),
      h('p', { class: 'small' }, t('intro3')),
    ];
    if (!prefs.plain) nodes.push(h('p', { class: 'small' }, t('intro4')));
    const toggle = (key, label) => h('label', { class: 'toggle' },
      h('input', { type: 'checkbox', checked: prefs[key], onchange: (e) => { prefs[key] = e.target.checked; savePrefs(); intro(); } }),
      h('span', {}, label));
    nodes.push(h('div', { class: 'settings' }, toggle('plain', t('plainLabel')), prefs.plain ? null : toggle('buzz', t('buzzLabel'))));
    if (canResume) {
      nodes.push(h('button', { class: 'primary', onclick: () => { st = resumable; st.done ? result() : question(); } },
        t('cont', { pos: resumable.pos, n: N })));
      nodes.push(h('p', {}, ''));
      nodes.push(h('button', { onclick: start, style: 'width:100%' }, t('restart')));
    } else {
      nodes.push(h('button', { class: 'primary', onclick: start }, t('start')));
    }
    show(intro, ...nodes);
  }

  function start() { st = fresh(); save(); question(); }

  // ---------- feedback while answering (never depends on the answer's value; see web/insights.js) ----------
  const overlay = document.body.appendChild(h('div', { class: 'overlay', hidden: true }));
  const toasts = document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  let cardDim = null; // theme shown in the open mirror card, so a language switch can redraw it

  function buzz(pattern) {
    if (st.plain || !prefs.buzz || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }
  function toast(text) {
    const el = h('div', { class: 'toast' }, text);
    toasts.append(el);
    setTimeout(() => el.remove(), 3600);
  }

  function arc(r, a0, a1) { // degrees, 0 = top, clockwise, centred in a 64x64 box
    const p = (a) => [32 + r * Math.sin((a * Math.PI) / 180), 32 - r * Math.cos((a * Math.PI) / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  // The portrait: one ring segment per complete theme, lit from the top in completion order, so a segment's
  // position says nothing about which theme it is. The silhouette sharpens with every answer, whatever the answer.
  function hud(fx) {
    const done = I.complete(st).filter(Boolean).length;
    const c = I.clarity(st);
    const pct = Math.round(c * 100);
    const step = 360 / D;
    let g = '';
    for (let k = 0; k < D; k++) {
      const cls = k < done ? (fx.lit && k === done - 1 ? 'seg lit pop' : 'seg lit') : 'seg';
      g += `<path class="${cls}" d="${arc(28, k * step + 2, (k + 1) * step - 2)}"/>`;
    }
    const silStyle = (x) => `filter:blur(${(7 * (1 - x)).toFixed(2)}px);opacity:${(0.3 + 0.6 * x).toFixed(2)}`;
    const sil = html(h('div', { class: 'sil', style: silStyle(fx.prevC != null ? fx.prevC : c) }),
      '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="14" r="7"/><path d="M6 38c0-8 6.3-13 14-13s14 5 14 13z"/></svg>');
    if (fx.prevC != null) requestAnimationFrame(() => requestAnimationFrame(() => sil.setAttribute('style', silStyle(c))));
    const near = I.nearly(st);
    return h('div', { class: 'hud', role: 'img', 'aria-label': t('clarityAria', { p: pct, c: done, n: D }) },
      h('div', { class: 'portrait' }, sil, html(h('div', { class: 'ring' }), `<svg viewBox="0 0 64 64" aria-hidden="true">${g}</svg>`),
        fx.plus ? h('div', { class: 'plus' }, '+1') : null),
      h('div', { class: 'hud-text' },
        h('div', { class: 'clarity' }, t('clarity', { p: pct })),
        h('div', { class: 'small' }, t('themesDone', { c: done, n: D })),
        near ? h('div', { class: 'small teaser' }, near === 1 ? t('nearly1') : t('nearlyN', { k: near })) : null));
  }

  // Your answers on a theme as rows of statement + a 1-5 dot scale. Only shows what you picked.
  function answerRows(m) {
    return h('ul', { class: 'answers' }, m.items.map((qi, j) => {
      const v = m.values[j];
      return h('li', {},
        h('span', { class: 'stmt' }, qText(DATA.questions[qi])),
        v == null
          ? h('span', { class: 'dots skipped' }, t('skippedRow'))
          : h('span', { class: 'dots', role: 'img', 'aria-label': t('answerAria', { v }) },
            [1, 2, 3, 4, 5].map((x) => h('i', { class: x === v ? 'on' : null }))));
    }));
  }
  function saidText(m) {
    const lines = [t('said_' + m.pattern)];
    if (m.firm) lines.push(t('saidFirm'));
    if (m.skipped && m.pattern !== 'none') lines.push(t('saidSkipped', { n: m.skipped }));
    return lines.join(' ');
  }

  // The mirror card: shown once a theme is complete, so nothing it shows can change that theme's score.
  function closeCard() {
    overlay.hidden = true;
    overlay.replaceChildren();
    cardDim = null;
    const b = app.querySelector('.scale button');
    if (b) b.focus({ preventScroll: true });
  }
  function card(d) {
    cardDim = d;
    const m = I.mirror(st, d);
    const btn = h('button', { class: 'primary', onclick: closeCard }, t('cont2'));
    overlay.replaceChildren(h('div', {
      class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'card-title', onclick: (e) => e.stopPropagation(),
    },
    h('div', { class: 'kicker' }, t('cardKicker', { c: I.complete(st).filter(Boolean).length, n: D })),
    h('h2', { id: 'card-title' }, themeText(d)),
    h('p', { class: 'said' }, saidText(m)),
    answerRows(m),
    h('p', { class: 'small' }, t('cardNote')),
    btn));
    overlay.onclick = closeCard;
    overlay.hidden = false;
    btn.focus({ preventScroll: true });
  }

  function question(fx) {
    if (st.pos >= N) { finish(); return; }
    fx = fx || {};
    const qi = st.order[st.pos];
    const q = DATA.questions[qi];
    const picked = st.r[qi];
    const buttons = [1, 2, 3, 4, 5].map((v) =>
      h('button', { class: picked === v ? 'picked' : '', 'aria-label': t('answerAria', { v }), onclick: () => answer(v) }, String(v)));
    const top = st.plain
      ? h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': N, 'aria-valuenow': st.pos },
        h('div', { style: `width:${(100 * st.pos) / N}%` }))
      : hud(fx);
    const anim = enterDir && !st.plain && !reducedMotion ? ` enter-${enterDir}` : '';
    enterDir = '';
    show(question, top,
      h('div', { class: 'qbody' + anim },
        h('div', { class: 'count' }, t('qOf', { pos: st.pos + 1, n: N })),
        h('p', { class: 'question' }, qText(q)),
        h('div', { class: 'scale' }, buttons),
        h('div', { class: 'scale-labels' }, h('span', {}, t('disagree')), h('span', {}, t('neutral')), h('span', {}, t('agree')))),
      h('div', { class: 'nav' },
        h('button', { class: 'link', disabled: st.pos === 0, onclick: back }, t('back')),
        answeredCount(st) >= MIN_FOR_EARLY ? h('button', { class: 'link', onclick: finish }, t('seeNow')) : null,
        h('button', { class: 'link', onclick: skip }, t('skip'))),
    );
  }

  // After an answer or a skip: redraw, then hand out what the step earned. Same answer 8 times in a row pauses
  // the +1 and milestones until the run breaks.
  function step(prev) {
    enterDir = 'next';
    if (st.plain || st.pos >= N) { question(); return; }
    const ev = I.events(prev, st);
    const run = I.streak(st);
    const paused = run >= I.STREAK;
    const done = ev.find((e) => e.type === 'complete' && !st.seen.includes('d' + e.dim));
    const plus = !paused && ev.some((e) => e.type === 'answer');
    question({ prevC: I.clarity(prev), plus, lit: !!done });
    if (plus) buzz(8);
    if (run === I.STREAK) toast(t('streakNudge'));
    if (!paused) {
      ev.filter((e) => e.type === 'milestone' && !st.seen.includes('m' + e.n)).forEach((e) => {
        st.seen.push('m' + e.n);
        toast(t('milestone' + e.n));
      });
    }
    if (done) {
      st.seen.push('d' + done.dim);
      buzz([10, 40, 10]);
      card(done.dim);
    }
    save();
  }
  function answer(v) {
    const prev = snapshot(st);
    st.r[st.order[st.pos]] = v;
    st.pos++;
    save();
    step(prev);
  }
  function skip() {
    const prev = snapshot(st);
    st.r[st.order[st.pos]] = null;
    st.pos++;
    save();
    step(prev);
  }
  function back() {
    if (st.pos === 0) return;
    st.pos--;
    st.r[st.order[st.pos]] = null;
    save();
    enterDir = 'prev';
    question();
  }

  // Keys 1-5 answer, Backspace / left arrow go back, Escape closes the card. A swipe right goes back.
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!overlay.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeCard(); }
      return;
    }
    if (current !== question || !st || st.pos >= N || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (/^[1-5]$/.test(e.key)) { e.preventDefault(); answer(Number(e.key)); }
    else if (e.key === 'Backspace' || e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  });
  let touch = null;
  app.addEventListener('touchstart', (e) => {
    const p = e.touches[0];
    touch = e.touches.length === 1 && p.clientX > 24 ? [p.clientX, p.clientY] : null; // leave the edge to the browser
  }, { passive: true });
  app.addEventListener('touchend', (e) => {
    if (!touch || current !== question || !overlay.hidden) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - touch[0], dy = p.clientY - touch[1];
    touch = null;
    if (dx > 70 && Math.abs(dy) < 50) back();
  }, { passive: true });

  function finish() { st.done = true; save(); result(true); }

  // ---------- charts (SVG strings built only from numbers and bundled data) ----------
  const LABEL_AT = { // [dx, dy, anchor] overrides so close tags don't collide
    adventurer: [7, 12, 'start'], performer: [-7, -5, 'end'], grandiose_narcissist: [-14, -9, 'middle'],
    psychopathic: [0, 15, 'middle'], rebel: [7, -6, 'start'], worrier: [-6, -8, 'end'], perfectionist: [-7, 4, 'end'],
    peacemaker: [7, -6, 'start'], caregiver: [7, 12, 'start'],
  };

  function pathChart(track, top) {
    const W = 360, H = 360, cx = W / 2, cy = H / 2;
    const tagXY = DATA.tags.map((g) => S.project(g.v));
    const trkXY = track.map((u) => S.project(u));
    const lim = 1.12 * Math.max(...tagXY.flat().map(Math.abs), ...trkXY.flat().map(Math.abs));
    const px = (x) => cx + (x / lim) * (cx - 14);
    const py = (y) => cy - (y / lim) * (cy - 14);
    let g = `<line class="axis" x1="0" y1="${cy}" x2="${W}" y2="${cy}"/><line class="axis" x1="${cx}" y1="0" x2="${cx}" y2="${H}"/>`;
    const n = trkXY.length - 1;
    for (let i = 1; i <= n; i++) {
      const [x0, y0] = trkXY[i - 1], [x1, y1] = trkXY[i];
      const o = (0.18 + 0.82 * (i / n)).toFixed(2);
      g += `<line class="trace" style="--i:${i}" x1="${px(x0).toFixed(1)}" y1="${py(y0).toFixed(1)}" x2="${px(x1).toFixed(1)}" y2="${py(y1).toFixed(1)}" stroke="var(--ink)" stroke-opacity="${o}" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    DATA.tags.forEach((tag, k) => {
      const [x, y] = tagXY[k];
      const isTop = top.includes(k);
      const [dx, dy, anchor] = LABEL_AT[tag.id] || [7, -6, 'start'];
      g += `<circle cx="${px(x).toFixed(1)}" cy="${py(y).toFixed(1)}" r="4.5" fill="var(--cat-${tag.category})"/>`;
      if (isTop) g += `<circle cx="${px(x).toFixed(1)}" cy="${py(y).toFixed(1)}" r="9" fill="none" stroke="var(--ink)" stroke-width="1.4"/>`;
      g += `<text class="lbl" x="${(px(x) + dx).toFixed(1)}" y="${(py(y) + dy).toFixed(1)}" text-anchor="${anchor}" ${isTop ? 'font-weight="700"' : ''}>${esc(shortName(tag))}</text>`;
    });
    const [sx, sy] = trkXY[0], [ex, ey] = trkXY[n];
    g += `<circle cx="${px(sx)}" cy="${py(sy)}" r="4.5" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.6"/>`;
    g += `<text class="lbl sub" x="${px(sx) + 7}" y="${py(sy) + 12}">${esc(t('startLabel'))}</text>`;
    g += `<g class="trace" style="--i:${n + 4}"><circle cx="${px(ex).toFixed(1)}" cy="${py(ey).toFixed(1)}" r="6" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/>`;
    g += `<text class="lbl" x="${(px(ex) + 9).toFixed(1)}" y="${(py(ey) + 3).toFixed(1)}" font-weight="700">${esc(t('you'))}</text></g>`;
    const ev = DATA.pca.explained.map((e) => Math.round(e * 100));
    g += `<text class="lbl sub" x="${W - 4}" y="${cy - 5}" text-anchor="end">PC1 (${ev[0]}%)</text><text class="lbl sub" x="${cx + 5}" y="12">PC2 (${ev[1]}%)</text>`;
    // --d spaces out the segments when the path is drawn in (see .anim .trace in style.css)
    return `<svg class="chart" style="--d:${(1500 / Math.max(n, 1)).toFixed(1)}ms" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('pathAria'))}">${g}</svg>`;
  }

  function timeChart(track, top) {
    const W = 360, H = 190, L = 28, R = 130, T = 8, B = 24; // R leaves room for the longest archetype name
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
    g += `<text class="lbl sub" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">${esc(t('handled'))}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('matchAria'))}">${g}</svg>`;
  }

  // ---------- results (tier 3: everything the model works out) ----------
  const comboText = (id) => { const c = ins().combos[id]; return typeof c === 'string' ? c : c.text; };

  // One card per theme: what you said (the same rows as the mirror card) and what it means compared with how
  // most people answer.
  function themeInfo(u, d) {
    const m = I.mirror(st, d);
    if (!m.values.some((v) => v != null)) return null;
    const mean = I.meaning(u, st.r, d);
    const dt = dimText(DATA.dimensions[d]);
    const lines = [mean.band === 'mid' ? t('meansMid')
      : `${t(mean.strong ? 'meansClear' : 'meansLean', { pole: dt[mean.band] })} ${ins().poles[DATA.dimensions[d].id][mean.band]}`];
    if (mean.gap) {
      lines.push(mean.gap.is === 'mid' ? t('gapMid', { said: dt[mean.gap.said] }) : t('gapOpp', { said: dt[mean.gap.said], is: dt[mean.gap.is] }));
    }
    if (mean.mixed) lines.push(t('mixedNote'));
    return { m, dim: dt.name, text: lines.join(' ') };
  }
  function themeCard(u, d) {
    const info = themeInfo(u, d);
    if (!info) return null;
    return h('div', { class: 'theme-card' },
      h('div', { class: 'theme-head' }, h('span', { class: 'name' }, themeText(d)), h('span', { class: 'small' }, info.dim)),
      h('details', {}, h('summary', {}, saidText(info.m)), answerRows(info.m)),
      h('p', { class: 'means' }, info.text));
  }

  // ---------- share and PDF ----------
  // A plain snapshot of what the results page shows, in the current language, for share.js to draw.
  function reportOf(u, ms, top, norm, answered, track, charts) {
    const pct = (c) => Math.max(0, Math.round(c * 100));
    const title = norm < TAU ? t('balancedTitle') : t('closest', { name: shortName(DATA.tags[top[0]]) });
    const notes = [];
    if (answered < 20) notes.push(t('fewAnswers', { n: answered }));
    if (norm < TAU) notes.push(t('balancedNote'));
    return {
      brand: t('title'), title, notes,
      top: ms.slice(0, 3).map((m) => ({ name: tagText(DATA.tags[m.index]).name, desc: tagText(DATA.tags[m.index]).description, pct: pct(m.cosine), cat: DATA.tags[m.index].category })),
      pctNote: t('pctNote'),
      profileTitle: t('yourProfile'),
      dims: DATA.dimensions.map((d, i) => ({ lo: dimText(d).low, hi: dimText(d).high, v: u[i] })),
      profileNote: t('profileNote'),
      saidTitle: t('saidMeansTitle'), saidNote: t('saidMeansNote'),
      themes: DATA.dimensions.map((_, d) => {
        const info = themeInfo(u, d);
        return info && { name: themeText(d), dim: info.dim, said: saidText(info.m), text: info.text };
      }).filter(Boolean),
      comboTitle: t('combosTitle'), combos: I.combos(u).slice(0, 3).map((c) => comboText(c.id)),
      pathTitle: t('pathTitle'), pathNote: t('pathNote'), pathSvg: charts.path,
      legend: [['dark', t('legendDark')], ['bright', t('legendBright')], ['neutral', t('legendNeutral')]],
      matchTitle: t('matchTitle'), timeSvg: charts.time,
      disclaimer: t('disclaimer') + (st.plain ? ` ${t('plainNote')}` : ''),
    };
  }

  let busy = false;
  const pngOf = (r) => {
    if (!r.png) r.png = Share.png(r).catch((e) => { r.png = null; throw e; });
    return r.png;
  };
  async function working(fn) { // one file at a time; the buttons are disabled meanwhile
    if (busy) return;
    busy = true;
    const btns = [...document.querySelectorAll('.share-row button')];
    btns.forEach((b) => { b.disabled = true; });
    toast(t('preparing'));
    try { await fn(); } catch (e) { toast(t('shareFailed')); }
    busy = false;
    btns.forEach((b) => { b.disabled = false; });
  }
  async function shareImage(r) {
    const blob = await pngOf(r);
    const data = { files: [new File([blob], 'personality-test.png', { type: 'image/png' })], title: r.title, text: t('shareText', { title: r.title }) };
    if (navigator.canShare && navigator.canShare(data)) {
      try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; /* otherwise save it instead */ }
    }
    Share.save(blob, 'personality-test.png');
    toast(t('imageSaved'));
  }
  async function savePdf(r) {
    Share.save(await Share.pdf(r), 'personality-test.pdf');
    toast(t('pdfSaved'));
  }
  const ICON_SHARE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
  const ICON_PDF = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 11l5 5 5-5M5 21h14"/></svg>';
  function shareRow(r) {
    const label = (icon, text) => [html(h('span', { class: 'icon' }), icon), text];
    return h('div', { class: 'share-row' },
      h('button', { class: 'primary', 'aria-label': t('shareAria'), onclick: () => working(() => shareImage(r)) }, ...label(ICON_SHARE, t('share'))),
      h('button', { 'aria-label': t('pdfAria'), onclick: () => working(() => savePdf(r)) }, ...label(ICON_PDF, t('savePdf'))));
  }

  // reveal: arriving from the last question, so the top match sharpens in and the path draws itself
  function result(reveal) {
    const anim = reveal === true && !st.plain && !reducedMotion;
    const u = S.score(st.r);
    const norm = Math.hypot(...u);
    const ms = S.matches(u).sort((a, b) => b.cosine - a.cosine);
    const top = ms.slice(0, 3).map((m) => m.index);
    const track = trackOf(st);
    const answered = answeredCount(st);
    const pct = (c) => Math.max(0, Math.round(c * 100));

    const nodes = [h('h1', { class: anim ? 'reveal' : null }, norm < TAU ? t('balancedTitle') : t('closest', { name: shortName(DATA.tags[top[0]]) }))];
    if (answered < 20) nodes.push(h('p', { class: 'small' }, t('fewAnswers', { n: answered })));
    if (norm < TAU) nodes.push(h('div', { class: 'balanced' }, t('balancedNote')));
    ms.slice(0, 3).forEach((m, rank) => {
      const g = DATA.tags[m.index];
      const gt = tagText(g);
      nodes.push(h('div', { class: anim ? `tag-card ${rank ? 'rise' : 'reveal'}` : 'tag-card', style: anim ? `--i:${rank}` : null },
        h('div', { class: 'top' }, h('span', { class: `dot cat-${g.category}` }), h('span', { class: 'name' }, gt.name), h('span', { class: 'pct' }, `${pct(m.cosine)}%`)),
        h('p', {}, gt.description),
        h('div', { class: 'meter' }, h('div', { style: `width:${pct(m.cosine)}%` }))));
    });
    nodes.push(h('p', { class: 'small' }, t('pctNote')));
    const report = reportOf(u, ms, top, norm, answered, track, { path: pathChart(track, top), time: timeChart(track, top) });
    nodes.push(shareRow(report));

    nodes.push(h('h2', {}, t('saidMeansTitle')));
    nodes.push(h('p', { class: 'muted' }, t('saidMeansNote')));
    DATA.dimensions.forEach((_, d) => nodes.push(themeCard(u, d)));

    const cs = I.combos(u).slice(0, 3);
    if (cs.length) {
      nodes.push(h('h2', {}, t('combosTitle')));
      cs.forEach((c) => nodes.push(h('div', { class: 'combo' }, comboText(c.id))));
    }

    nodes.push(h('h2', {}, t('yourProfile')));
    DATA.dimensions.forEach((d, i) => {
      const v = u[i];
      const dt = dimText(d);
      const w = (Math.min(Math.abs(v), 1) * 50).toFixed(1);
      const style = v >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`;
      nodes.push(h('div', { class: 'dim' }, h('span', { class: 'lo' }, dt.low), h('div', { class: 'bar', role: 'img', 'aria-label': `${dt.name}: ${v.toFixed(2)}` }, h('div', { style })), h('span', { class: 'hi' }, dt.high)));
    });
    nodes.push(h('p', { class: 'small' }, t('profileNote')));

    nodes.push(h('h2', {}, t('pathTitle')));
    nodes.push(h('p', { class: 'muted' }, t('pathNote')));
    const path = html(h('div', { class: anim ? 'anim' : null }), pathChart(track, top));
    nodes.push(path);
    nodes.push(html(h('div', { class: 'legend' }),
      `<span><i class="dot cat-dark"></i>${esc(t('legendDark'))}</span><span><i class="dot cat-bright"></i>${esc(t('legendBright'))}</span><span><i class="dot cat-neutral"></i>${esc(t('legendNeutral'))}</span>`));

    nodes.push(h('h2', {}, t('matchTitle')));
    nodes.push(html(h('div', {}), timeChart(track, top)));

    const rows = ms.map((m) => h('tr', {}, h('td', {}, tagText(DATA.tags[m.index]).name), h('td', {}, `${Math.round(m.cosine * 100)}%`)));
    nodes.push(h('details', {}, h('summary', {}, t('allTags')), h('table', {}, h('tbody', {}, rows))));
    nodes.push(h('p', { class: 'small' }, t('disclaimer')));
    if (st.plain) nodes.push(h('p', { class: 'small' }, t('plainNote')));
    nodes.push(shareRow(report));
    nodes.push(h('button', { class: 'primary', onclick: () => { clear(); st = null; intro(); } }, t('again')));
    show(result, ...nodes.filter(Boolean));
    setTimeout(() => { if (current === result && !busy) pngOf(report).catch(() => {}); }, 800); // ready before the tap, so the share sheet opens at once
    if (anim) { // draw the path once it scrolls into view
      if (!('IntersectionObserver' in window)) path.classList.add('play');
      else {
        const io = new IntersectionObserver((es) => {
          if (es.some((e) => e.isIntersecting)) { path.classList.add('play'); io.disconnect(); }
        }, { threshold: 0.4 });
        io.observe(path);
      }
    }
  }

  // ---------- boot ----------
  loadPrefs();
  lang = initialLang();
  document.documentElement.lang = lang;
  intro();
})();
