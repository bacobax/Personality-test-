// Turns the results into a shareable image (PNG) or a report (PDF). Everything is drawn on a canvas from a plain
// `report` object that app.js builds, so there is no library and no network, and the output looks the same whatever
// theme the page is in (always light, which prints and shares better).
//
// report = { brand, title, notes: [text], top: [{ name, desc, pct, cat }], pctNote,
//   profileTitle, dims: [{ lo, hi, v }], profileNote,
//   saidTitle, saidNote, themes: [{ name, dim, said, text }], comboTitle, combos: [text],
//   pathTitle, pathNote, pathSvg, legend: [[cat, label]], matchTitle, timeSvg, disclaimer }
const Share = (function () {
  const C = {
    bg: '#fcfcfb', card: '#f3f2ee', ink: '#0b0b0b', ink2: '#52514e', muted: '#8a8984', grid: '#e4e3df', accent: '#2a78d6',
    dark: '#2a78d6', bright: '#eb6834', neutral: '#1baf7a',
  };
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const W = 1080, PAD = 64, IN = W - 2 * PAD;
  const PAGE_H = Math.round((W * 297) / 210); // A4 proportions
  const VARS = {
    ink: C.ink, 'ink-2': C.ink2, muted: C.muted, grid: C.grid, surface: C.bg, card: C.card, accent: C.accent,
    'cat-dark': C.dark, 'cat-bright': C.bright, 'cat-neutral': C.neutral,
  };
  const SVG_CSS = `.axis{stroke:${C.grid};stroke-width:1}.grid{stroke:${C.grid};stroke-width:.6}`
    + `text{fill:${C.ink};font-family:${FONT}}.lbl{font-size:9px}.lbl.sub{fill:${C.ink2}}`;

  // ---------- helpers ----------
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const toBlob = (cv, type, q) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), type, q));

  function rr(ctx, x, y, w, h, r) { // rounded rectangle path
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrap(m, text, font, maxW) {
    m.font = font;
    const out = [];
    let line = '';
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (line && m.measureText(test).width > maxW) { out.push(line); line = word; } else line = test;
    }
    if (line) out.push(line);
    return out;
  }
  function fit(m, text, weight, size, maxW) { // largest font size (down to 60%) at which the text fits
    let s = size;
    for (; s > size * 0.6; s--) { m.font = `${weight} ${s}px ${FONT}`; if (m.measureText(text).width <= maxW) break; }
    return `${weight} ${s}px ${FONT}`;
  }
  function svgImage(svg, w, h) { // an SVG string from app.js, with the page's CSS variables resolved to the light palette
    const src = svg.replace(/var\(--([\w-]+)\)/g, (_, k) => VARS[k] || '#000')
      .replace(/^<svg /, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `)
      .replace(/(<svg[^>]*>)/, `$1<style>${SVG_CSS}</style>`);
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('chart'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
    });
  }

  // ---------- blocks: { h, keep, draw(ctx, y) }; keep = stay on the same page as the next block ----------
  function text(m, str, o) {
    const font = `${o.weight || 400} ${o.size}px ${FONT}`;
    const lines = wrap(m, str, font, o.w || IN);
    const lh = Math.round(o.size * (o.lh || 1.35));
    const before = o.before || 0;
    return {
      h: before + lines.length * lh + (o.after || 0), keep: o.keep,
      draw(ctx, y) {
        ctx.font = font; ctx.fillStyle = o.color || C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        lines.forEach((l, i) => ctx.fillText(l, PAD, y + before + i * lh + Math.round(o.size * 1.05)));
      },
    };
  }
  const heading = (m, str) => text(m, str, { size: 40, weight: 700, before: 44, after: 16, keep: true, lh: 1.2 });
  const note = (m, str, keep) => text(m, str, { size: 26, color: C.muted, after: 14, keep });

  function archetype(m, g) {
    const iw = IN - 64;
    const lines = wrap(m, g.desc, `400 30px ${FONT}`, iw);
    const h = 32 + 48 + 12 + lines.length * 42 + 22 + 12 + 32; // padding, name row, gap, text, gap, meter, padding
    return {
      h: h + 20,
      draw(ctx, y) {
        ctx.fillStyle = C.card; rr(ctx, PAD, y, IN, h, 28); ctx.fill();
        const x = PAD + 32, base = y + 32 + 38;
        ctx.fillStyle = C[g.cat] || C.muted; ctx.beginPath(); ctx.arc(x + 10, base - 14, 10, 0, 7); ctx.fill();
        ctx.fillStyle = C.ink; ctx.font = `700 40px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(g.name, x + 34, base);
        ctx.textAlign = 'right'; ctx.fillText(`${g.pct}%`, PAD + IN - 32, base);
        ctx.textAlign = 'left'; ctx.fillStyle = C.ink2; ctx.font = `400 30px ${FONT}`;
        lines.forEach((l, i) => ctx.fillText(l, x, y + 32 + 48 + 12 + i * 42 + 31));
        const my = y + h - 32 - 12;
        ctx.fillStyle = C.grid; rr(ctx, x, my, iw, 12, 6); ctx.fill();
        if (g.pct > 0) { ctx.fillStyle = C.ink2; rr(ctx, x, my, Math.max(12, (iw * g.pct) / 100), 12, 6); ctx.fill(); }
      },
    };
  }

  function dimRow(m, d) { // low label | bar from the centre | high label
    const colW = 290, barW = 360, gap = 6;
    const fLo = fit(m, d.lo, 400, 26, colW), fHi = fit(m, d.hi, 400, 26, colW);
    return {
      h: 56,
      draw(ctx, y) {
        const cy = y + 28, bx = PAD + colW + gap;
        ctx.fillStyle = C.ink2; ctx.textBaseline = 'middle';
        ctx.font = fLo; ctx.textAlign = 'right'; ctx.fillText(d.lo, bx - 2 * gap, cy);
        ctx.font = fHi; ctx.textAlign = 'left'; ctx.fillText(d.hi, bx + barW + 2 * gap, cy);
        ctx.fillStyle = C.grid; rr(ctx, bx, cy - 8, barW, 16, 8); ctx.fill();
        const w = Math.min(Math.abs(d.v), 1) * (barW / 2);
        if (w > 0) { ctx.fillStyle = C.accent; ctx.fillRect(d.v >= 0 ? bx + barW / 2 : bx + barW / 2 - w, cy - 8, w, 16); }
        ctx.fillStyle = C.muted; ctx.fillRect(bx + barW / 2 - 1, cy - 14, 2, 28);
        ctx.textBaseline = 'alphabetic';
      },
    };
  }

  function theme(m, th) {
    const said = wrap(m, th.said, `400 26px ${FONT}`, IN);
    const means = wrap(m, th.text, `400 28px ${FONT}`, IN);
    const h = 18 + 40 + said.length * 36 + 6 + means.length * 39 + 18;
    return {
      h,
      draw(ctx, y) {
        ctx.fillStyle = C.grid; ctx.fillRect(PAD, y, IN, 2);
        ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.font = `700 32px ${FONT}`; ctx.fillText(th.name, PAD, y + 18 + 32);
        ctx.textAlign = 'right'; ctx.fillStyle = C.muted; ctx.font = `400 24px ${FONT}`; ctx.fillText(th.dim, PAD + IN, y + 18 + 31);
        ctx.textAlign = 'left'; ctx.fillStyle = C.muted; ctx.font = `400 26px ${FONT}`;
        said.forEach((l, i) => ctx.fillText(l, PAD, y + 18 + 40 + i * 36 + 27));
        ctx.fillStyle = C.ink; ctx.font = `400 28px ${FONT}`;
        means.forEach((l, i) => ctx.fillText(l, PAD, y + 18 + 40 + said.length * 36 + 6 + i * 39 + 28));
      },
    };
  }

  function combo(m, str) {
    const lines = wrap(m, str, `400 30px ${FONT}`, IN - 52);
    const h = 28 + lines.length * 42;
    return {
      h: h + 16,
      draw(ctx, y) {
        ctx.fillStyle = C.card; rr(ctx, PAD, y, IN, h, 16); ctx.fill();
        ctx.fillStyle = C.accent; ctx.fillRect(PAD, y + 12, 8, h - 24);
        ctx.fillStyle = C.ink; ctx.font = `400 30px ${FONT}`; ctx.textAlign = 'left';
        lines.forEach((l, i) => ctx.fillText(l, PAD + 36, y + 14 + i * 42 + 31));
      },
    };
  }

  const picture = (img, w, h) => ({ h: h + 20, draw(ctx, y) { ctx.drawImage(img, PAD + (IN - w) / 2, y, w, h); } });

  function legend(m, items) {
    const f = `400 24px ${FONT}`;
    m.font = f;
    const widths = items.map(([, l]) => 14 + 10 + m.measureText(l).width);
    const total = widths.reduce((a, b) => a + b, 0) + 36 * (items.length - 1);
    return {
      h: 56,
      draw(ctx, y) {
        let x = PAD + (IN - total) / 2;
        ctx.font = f; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        items.forEach(([cat, label], i) => {
          ctx.fillStyle = C[cat]; ctx.beginPath(); ctx.arc(x + 7, y + 20, 7, 0, 7); ctx.fill();
          ctx.fillStyle = C.ink2; ctx.fillText(label, x + 24, y + 20);
          x += widths[i] + 36;
        });
        ctx.textBaseline = 'alphabetic';
      },
    };
  }

  // The report as a list of blocks. full = the PDF (adds the explanations, combinations and the second chart).
  async function blocks(r, full) {
    const m = canvas(1, 1).getContext('2d');
    const out = [];
    out.push(text(m, r.brand, { size: 28, weight: 700, color: C.accent, before: 8, after: 10 }));
    out.push(text(m, r.title, { size: 62, weight: 700, lh: 1.15, after: 20 }));
    r.notes.forEach((n) => out.push(note(m, n)));
    r.top.forEach((g) => out.push(archetype(m, g)));
    if (full) out.push(note(m, r.pctNote));

    out.push(heading(m, r.profileTitle));
    r.dims.forEach((d, i) => out.push({ ...dimRow(m, d), keep: i < r.dims.length - 1 })); // the 12 bars stay on one page
    if (full) out.push(note(m, r.profileNote));

    if (full) {
      out.push(heading(m, r.saidTitle));
      out.push(note(m, r.saidNote, true));
      r.themes.forEach((th) => out.push(theme(m, th)));
      if (r.combos.length) {
        out.push(heading(m, r.comboTitle));
        r.combos.forEach((c) => out.push(combo(m, c)));
      }
    }

    out.push(heading(m, r.pathTitle));
    if (full) out.push(note(m, r.pathNote, true));
    const pw = full ? 800 : 760;
    out.push(picture(await svgImage(r.pathSvg, pw, pw), pw, pw));
    out.push(legend(m, r.legend));

    if (full) {
      out.push(heading(m, r.matchTitle));
      out.push(picture(await svgImage(r.timeSvg, IN, Math.round((IN * 190) / 360)), IN, Math.round((IN * 190) / 360)));
    }
    out.push(text(m, r.disclaimer, { size: 24, color: C.muted, before: 36, lh: 1.4 }));
    return out;
  }

  // Greedy pages of at most `usable` px; a block marked keep travels with the block after it.
  function paginate(list, usable) {
    const groups = [];
    for (let i = 0; i < list.length;) {
      const g = [list[i]];
      while (list[i].keep && list[i + 1]) { i++; g.push(list[i]); }
      i++;
      groups.push(g);
    }
    const pages = [];
    let cur = [], used = 0;
    groups.forEach((g) => {
      const h = g.reduce((a, b) => a + b.h, 0);
      if (cur.length && used + h > usable) { pages.push(cur); cur = []; used = 0; }
      cur.push(...g); used += h;
    });
    if (cur.length) pages.push(cur);
    return pages;
  }
  function paint(list, height) {
    const cv = canvas(W, height);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, height);
    let y = PAD;
    list.forEach((b) => { b.draw(ctx, y); y += b.h; });
    return cv;
  }

  // ---------- outputs ----------
  async function png(r) {
    const list = await blocks(r, false);
    return toBlob(paint(list, PAD * 2 + list.reduce((a, b) => a + b.h, 0)), 'image/png');
  }

  async function pdf(r) {
    const pages = paginate(await blocks(r, true), PAGE_H - 2 * PAD);
    const jpegs = [];
    for (const p of pages) {
      const b = await toBlob(paint(p, PAGE_H), 'image/jpeg', 0.92);
      jpegs.push(new Uint8Array(await b.arrayBuffer()));
    }
    return pdfOf(jpegs, W, PAGE_H);
  }

  // A PDF with one full-page JPEG per A4 page (so the text is part of the picture and can't be selected).
  function pdfOf(jpegs, iw, ih) {
    const enc = new TextEncoder();
    const parts = [];
    const at = [];
    let len = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { at[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
    const PW = 595, PH = 842;
    push('%PDF-1.4\n'); push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    const pageNo = (i) => 3 + 3 * i;
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Count ${jpegs.length} /Kids [${jpegs.map((_, i) => `${pageNo(i)} 0 R`).join(' ')}] >>`);
    jpegs.forEach((jpg, i) => {
      const n = pageNo(i);
      const content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
      obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
      obj(n + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      at[n + 2] = len;
      push(`${n + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${iw} /Height ${ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
      push(jpg);
      push('\nendstream\nendobj\n');
    });
    const total = 3 + 3 * jpegs.length;
    const xref = len;
    push(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let n = 1; n < total; n++) push(`${String(at[n]).padStart(10, '0')} 00000 n \n`);
    push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  function save(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  return { png, pdf, save };
})();
