// ---------------------------------------------------------------------------
// Commuting flows: CSO Census 2022 place of work, school or college flows
// between Electoral Divisions (EDs) in one county (data/galway_flows.json,
// made by make_galway_flows.py). Map with flow lines (click an area to follow
// its flows), the selected area, the largest flows and an electoral-area matrix.
// Uses its own controls; the year, area and settlement filters don't apply.
// ---------------------------------------------------------------------------
window.TXF = (() => {
  const T = TX;
  const SEQ = ['#f7f6f3', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
  const DIV = ['#a52a2a', '#d55a57', '#efa9a5', '#f7f6f3', '#9ec5f4', '#3987e5', '#184f95'];
  const FLOW = '#184f95', FLOW_SEL = dash.colors[1];
  const MINS = {area: [10, 25, 50, 100, 200, 300, 500, 1000, 2000], ed: [3, 5, 10, 20, 30, 50, 100, 200, 500]};
  const DEF_MIN = {area: 200, ed: 30};
  const BUCKET = {WFH: 'Work or study from home', NFP: 'No fixed place of work'};

  const raw = () => { const d = dash.data('galway_flows'); return d.status === 'ok' ? d.data : null; };
  const P = () => {
    const p = dash.params(); const level = p.flevel === 'ed' ? 'ed' : 'area';
    const min = Number(p.fmin);
    return {level, colour: p.fcolour || 'jobs', dir: p.fdir === 'in' ? 'in' : 'out',
      sel: p.fsel == null || p.fsel === '' ? null : Number(p.fsel), lines: p.flines !== false,
      min: MINS[level].includes(min) ? min : DEF_MIN[level], mx: p.fmx || 'n'};
  };
  const short = (name) => name.replace(/^Galway City /, 'City ');

  // ---- totals for areas or EDs, built once per level
  const models = {};
  function model(level) {
    const D = raw(); if (!D) return null;
    if (models[level] && models[level].D === D) return models[level];
    const isA = level === 'area';
    const n = isA ? D.areas.length : D.eds.length;
    const uOf = (i) => (isA ? D.eds[i].area : i);
    const units = isA
      ? D.areas.map((a, i) => ({name: a.name, short: short(a.name), city: a.city, c: a.c, pop: 0, shape: D.area_shapes.features[i]}))
      : D.eds.map((e, i) => ({name: e.name, short: e.name, city: e.city, c: e.c, pop: e.pop || 0, area: D.areas[e.area].name, shape: D.ed_shapes.features[i]}));
    if (isA) D.eds.forEach((e) => { units[e.area].pop += e.pop || 0; });
    const M = new Float64Array(n * n);
    for (const [o, d, c] of D.flows) M[uOf(o) * n + uOf(d)] += c;
    const xo = Array.from({length: n}, () => ({})), xi = Array.from({length: n}, () => ({}));
    for (const k in D.out) { const u = uOf(+k); for (const b in D.out[k]) xo[u][b] = (xo[u][b] || 0) + D.out[k][b]; }
    for (const k in D.in) { const u = uOf(+k); for (const b in D.in[k]) xi[u][b] = (xi[u][b] || 0) + D.in[k][b]; }
    const z = () => new Float64Array(n);
    const m = {D, level, isA, n, units, M, xo, xi, res: z(), fixed: z(), work: z(), intra: z(), toCity: z(), ext: z(), wfh: z(), nfp: z(), inExt: z()};
    for (let u = 0; u < n; u++) {
      let r = 0, w = 0, tc = 0, e = 0, ie = 0;
      for (let v = 0; v < n; v++) { r += M[u * n + v]; w += M[v * n + u]; if (units[v].city) tc += M[u * n + v]; }
      for (const b in xo[u]) { r += xo[u][b]; if (b !== 'WFH' && b !== 'NFP') e += xo[u][b]; }
      for (const b in xi[u]) ie += xi[u][b];
      m.wfh[u] = xo[u].WFH || 0; m.nfp[u] = xo[u].NFP || 0; m.res[u] = r; m.fixed[u] = r - m.wfh[u] - m.nfp[u];
      m.work[u] = w + ie; m.intra[u] = M[u * n + u]; m.toCity[u] = tc; m.ext[u] = e; m.inExt[u] = ie;
    }
    models[level] = m; return m;
  }
  const cur = () => { const p = P(); const m = model(p.level); if (m && p.sel != null && !(p.sel >= 0 && p.sel < m.n)) p.sel = null; return {p, m}; };

  // ---- the colour on the map
  function niceRound(x) {
    if (x <= 0) return 0; const e = Math.pow(10, Math.floor(Math.log10(x))); const f = x / e;
    return (f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * e;
  }
  function quantBreaks(vals, k) {
    const v = vals.filter(Number.isFinite).sort((a, b) => a - b); const br = [];
    for (let i = 1; i < k && v.length; i++) { const r = niceRound(v[Math.floor(i * v.length / k)] * 100) / 100; if (!br.length || r > br[br.length - 1]) br.push(r); }
    return br;
  }
  const classOf = (x, br) => { let i = 0; while (i < br.length && x >= br[i]) i++; return i; };
  const pctTxt = (x) => (Number.isFinite(x) ? `${+(x * 100).toFixed(x < 0.1 ? 1 : 0)}%` : '—');
  const COLOURS = {
    jobs: 'Jobs balance: people working or studying here ÷ residents travelling to a fixed place',
    self: '% of residents working or studying in their own area',
    city: '% of residents travelling to the city',
    wfh: '% of residents working or studying from home',
    leave: '% of residents travelling outside the county',
  };
  function metric(p, m) {
    const n = m.n, val = new Float64Array(n).fill(NaN);
    let title, breaks, ramp, fmtB, diverging = false;
    if (p.sel != null) {
      const s = p.sel, nm = m.units[s].short;
      if (p.dir === 'out') { for (let v = 0; v < n; v++) if (m.fixed[s] > 0) val[v] = m.M[s * n + v] / m.fixed[s]; title = `% of ${nm}'s commuters going to each area`; }
      else { for (let u = 0; u < n; u++) if (m.work[s] > 0) val[u] = m.M[u * n + s] / m.work[s]; title = `% of people working or studying in ${nm} who live in each area`; }
      breaks = m.isA ? [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.4] : [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1];
      ramp = SEQ; fmtB = (b) => `${+(b * 100).toFixed(2)}%`;
    } else {
      for (let u = 0; u < n; u++) {
        const f = m.fixed[u], r = m.res[u];
        val[u] = {jobs: f > 0 ? m.work[u] / f : NaN, self: f > 0 ? m.intra[u] / f : NaN, city: f > 0 ? m.toCity[u] / f : NaN,
          wfh: r > 0 ? m.wfh[u] / r : NaN, leave: f > 0 ? m.ext[u] / f : NaN}[p.colour];
      }
      title = COLOURS[p.colour].replace('the city', m.D.city || 'the city').replace('the county', m.D.name);
      if (p.colour === 'jobs') { diverging = true; breaks = [1 / 3, 0.5, 0.8, 1.25, 2, 3]; ramp = DIV; fmtB = (b) => (b === 1 / 3 ? '⅓' : String(b)); }
      else {
        breaks = quantBreaks(Array.from(val), 8);
        ramp = Array.from({length: breaks.length + 1}, (_, i) => SEQ[Math.round(i * (SEQ.length - 1) / Math.max(1, breaks.length))]);
        fmtB = (b) => `${+(b * 100).toFixed(1)}%`;
      }
    }
    const col = Array.from(val, (x) => (Number.isFinite(x) ? ramp[Math.min(classOf(x, breaks), ramp.length - 1)] : 'var(--cds-chart-muted)'));
    return {val, col, title, breaks, ramp, fmtB, diverging};
  }

  function legendEl(mt, p, flowInfo) {
    const box = document.createElement('div'); box.className = 'tx-flegend';
    const a = document.createElement('div'); a.className = 'tx-flegend-c';
    const t = document.createElement('div'); t.className = 'tx-flegend-t'; t.textContent = mt.title; a.append(t);
    const ramp = document.createElement('div'); ramp.className = 'tx-framp';
    const ticks = document.createElement('div'); ticks.className = 'tx-fticks';
    mt.ramp.forEach((c, i) => {
      const sw = document.createElement('i'); sw.style.background = c; ramp.append(sw);
      const lb = document.createElement('span');
      lb.textContent = i === 0 ? `< ${mt.fmtB(mt.breaks[0])}` : i === mt.ramp.length - 1 ? `${mt.fmtB(mt.breaks[i - 1])}+` : `${mt.fmtB(mt.breaks[i - 1])}–${mt.fmtB(mt.breaks[i])}`;
      ticks.append(lb);
    });
    a.append(ramp, ticks);
    if (mt.diverging) {
      const e = document.createElement('div'); e.className = 'tx-fticks tx-fends';
      e.innerHTML = '<span>◀ more residents leave</span><span>more people come in ▶</span>'; a.append(e);
    }
    box.append(a);
    if (flowInfo) {
      const b = document.createElement('div'); b.className = 'tx-flegend-c tx-flegend-f';
      const t2 = document.createElement('div'); t2.className = 'tx-flegend-t'; t2.textContent = 'Flow lines: people (curving clockwise from home to work)'; b.append(t2);
      const row = document.createElement('div'); row.className = 'tx-fflows';
      for (const c of flowInfo.samples) {
        const w = flowInfo.width(c), h = Math.max(10, w);
        row.insertAdjacentHTML('beforeend', `<svg width="34" height="${h}" aria-hidden="true"><line x1="3" x2="31" y1="${h / 2}" y2="${h / 2}" stroke="${flowInfo.color}" stroke-width="${w}" stroke-linecap="round"/></svg><span>${T.fmt.n0(c)}</span>`);
      }
      b.append(row);
      if (flowInfo.nodes) { const nn = document.createElement('div'); nn.className = 'tx-fflows'; nn.innerHTML = `<svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="#fff" stroke="${flowInfo.color}" stroke-width="1.5"/></svg><span>circle = people working or studying in their own area</span>`; b.append(nn); }
      box.append(b);
    }
    return box;
  }

  const select = (i) => dash.setParams({fsel: i == null ? null : i});
  return {raw, P, model, cur, metric, legendEl, select, short, pctTxt, MINS, DEF_MIN, BUCKET, SEQ, FLOW, FLOW_SEL};
})();

// ---- scope note
dash.draw('f-scope', (el) => {
  const p = TX.P(); const D = TXF.raw();
  const msg = D && ((p.geo !== 'National|Ireland' && p.geo !== `County|${D.name}`) || p.settle !== 'All')
    ? `This tab shows ${D.name} city and county from Census ${D.census}: the year, area and settlement filters don't apply.` : '';
  el.textContent = msg; el.hidden = !msg;
});

// ---- controls whose choices depend on the data or level
dash.draw('f-min', (sel) => {
  const {p} = TXF.cur();
  sel.replaceChildren(...TXF.MINS[p.level].map((v) => new Option(`${d3.format(',')(v)}+ people`, String(v))));
  sel.value = String(p.min); sel.disabled = !p.lines || p.sel != null;
  sel.onchange = () => dash.setParams({fmin: Number(sel.value)});
});
dash.draw('f-colour', (sel) => {
  const {p, m} = TXF.cur(); const D = TXF.raw(); if (!D) return;
  const labels = {jobs: 'Jobs balance', self: '% working or studying in own area', city: `% travelling to ${D.city || 'the city'}`,
    wfh: '% working from home', leave: `% travelling outside ${D.name}`};
  if (sel.options.length !== 5) sel.replaceChildren(...Object.entries(labels).map(([k, v]) => new Option(v, k)));
  sel.value = p.colour; sel.disabled = p.sel != null;
  sel.onchange = () => dash.setParams({fcolour: sel.value === 'jobs' ? null : sel.value});
});
document.querySelectorAll('.tx-flevel').forEach((c) => c.addEventListener('change', () => dash.setParams({flevel: c.value === 'ed' ? 'ed' : null, fsel: null, fmin: null})));
document.querySelectorAll('.tx-fdir').forEach((c) => c.addEventListener('change', () => dash.setParams({fdir: c.value === 'in' ? 'in' : null})));
document.querySelectorAll('.tx-flines').forEach((c) => c.addEventListener('change', () => dash.setParams({flines: c.checked ? null : false})));
document.querySelectorAll('.tx-fmx').forEach((c) => c.addEventListener('change', () => dash.setParams({fmx: c.value === 'n' ? null : c.value})));
dash.onData(() => {
  const {p} = TXF.cur();
  document.querySelectorAll('.tx-flevel').forEach((c) => { c.value = p.level; });
  document.querySelectorAll('.tx-fdir').forEach((c) => { c.value = p.dir; c.disabled = p.sel == null; });
  document.querySelectorAll('.tx-flines').forEach((c) => { c.checked = p.lines; });
  document.querySelectorAll('.tx-fmx').forEach((c) => { c.value = p.mx; });
});

// ---- map ---------------------------------------------------------------------
dash.draw('f-sub-map', (el) => {
  const {p, m} = TXF.cur(); if (!m) { el.textContent = '—'; return; }
  const lv = m.isA ? `${m.n} electoral areas` : `${m.n} electoral divisions (EDs)`;
  TX.text(el, `${m.D.name} · Census ${m.D.census} · ${lv} · `,
    p.sel == null ? 'click an area to follow its flows' : `following ${m.units[p.sel].name}: ${p.dir === 'out' ? 'where its residents go' : 'where its workforce lives'}`);
});

const txfView = {key: null, t: null};
dash.draw('f-map', (el) => {
  const T = TX, F = TXF; if (!T.ready(el, ['galway_flows', 'ireland_map'])) return;
  el.replaceChildren();
  const {p, m} = F.cur(); const D = m.D; const n = m.n;
  const mt = F.metric(p, m);
  const w0 = Math.max(280, el.clientWidth || 600);
  const H = Math.round(Math.max(360, Math.min(640, w0 * 0.6)));
  const {s, w} = T.svg(el, H);
  s.attr('aria-label', `Map of commuting flows in ${D.name}`).style('touch-action', 'none').style('cursor', 'grab');
  const proj = d3.geoMercator().fitExtent([[10, 10], [w - 10, H - 10]], D.ed_shapes);
  const path = d3.geoPath(proj);
  const cid = `txfc${Math.random().toString(36).slice(2, 8)}`;
  s.append('defs').append('clipPath').attr('id', cid).append('rect').attr('width', w).attr('height', H);
  s.append('rect').attr('width', w).attr('height', H).style('fill', '#eef3f8');
  const root = s.append('g').attr('clip-path', `url(#${cid})`).append('g');
  const tp = T.tip(el);
  const NS = 'non-scaling-stroke';

  // neighbouring counties for context
  const ctx = (window.txMapFeatures ? txMapFeatures(dash.data('ireland_map').data).features : []) // winding fixed (app_modal.js)
    .filter((f) => f.properties.county !== D.name);
  root.append('g').selectAll('path').data(ctx).join('path').attr('d', path)
    .style('fill', '#e2e0d9').style('stroke', '#cdcac1').style('stroke-width', 1).attr('vector-effect', NS);
  // areas or EDs, coloured
  const shapes = m.units.map((u) => u.shape);
  root.append('g').selectAll('path').data(shapes).join('path').attr('d', path)
    .style('fill', (f) => mt.col[f.properties.i]).style('stroke', '#fff').style('stroke-width', m.isA ? 1 : 0.6)
    .attr('vector-effect', NS).style('cursor', 'pointer')
    .on('pointermove', (ev, f) => {
      const u = f.properties.i, U = m.units[u], x = mt.val[u]; const [mx, my] = d3.pointer(ev, el);
      const lines = [];
      if (!m.isA) lines.push({label: '', value: U.area});
      if (p.sel != null) {
        const s0 = p.sel, S = m.units[s0].short; const c = p.dir === 'out' ? m.M[s0 * n + u] : m.M[u * n + s0];
        lines.push({label: '', value: p.dir === 'out' ? `${T.fmt.n0(c)} people from ${S} work or study here` : `${T.fmt.n0(c)} people living here work or study in ${S}`});
        lines.push({label: p.dir === 'out' ? `Share of ${S}'s commuters` : `Share of ${S}'s workforce`, value: F.pctTxt(x)});
      } else if (p.colour === 'jobs') {
        lines.push({label: 'Jobs balance', value: Number.isFinite(x) ? x.toFixed(2) : '—'});
        lines.push({label: 'Work or study here', value: T.fmt.n0(m.work[u])}, {label: 'Residents travelling to a fixed place', value: T.fmt.n0(m.fixed[u])});
      } else {
        lines.push({label: {self: 'Work or study in own area', city: `Travel to ${D.city || 'the city'}`, wfh: 'Work or study from home', leave: `Travel outside ${D.name}`}[p.colour], value: F.pctTxt(x)});
        lines.push({label: 'Residents commuting', value: T.fmt.n0(m.res[u])});
      }
      lines.push({label: '', value: p.sel === u ? 'Click to clear' : 'Click to follow its flows'});
      tp.show(U.name, lines, mx, my);
    })
    .on('pointerleave', () => tp.hide())
    .on('click', (ev, f) => { ev.stopPropagation(); F.select(f.properties.i === p.sel ? null : f.properties.i); });
  // electoral area outlines on top
  root.append('g').style('pointer-events', 'none').selectAll('path').data(D.area_shapes.features).join('path').attr('d', path)
    .style('fill', 'none').style('stroke', '#3d3c39').style('stroke-opacity', 0.7).style('stroke-width', 1.2).attr('vector-effect', NS);
  if (p.sel != null) root.append('path').attr('d', path(m.units[p.sel].shape)).style('fill', 'none').style('stroke', F.FLOW_SEL)
    .style('stroke-width', 3).attr('vector-effect', NS).style('pointer-events', 'none');

  // flow lines
  let flowInfo = null; const nodes = root.append('g').style('pointer-events', 'none');
  if (p.lines) {
    const list = [];
    if (p.sel != null) {
      const s0 = p.sel;
      for (let v = 0; v < n; v++) { if (v === s0) continue; const c = p.dir === 'out' ? m.M[s0 * n + v] : m.M[v * n + s0]; if (c >= (m.isA ? 1 : 3)) list.push(p.dir === 'out' ? [s0, v, c] : [v, s0, c]); }
    } else {
      for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) if (u !== v && m.M[u * n + v] >= p.min) list.push([u, v, m.M[u * n + v]]);
    }
    list.sort((a, b) => a[2] - b[2]);
    const maxC = p.sel != null ? Math.max(1, d3.max(list, (f) => f[2]) || 1) : (m.isA ? 10000 : 2500);
    const maxW = m.isA ? 16 : 9; const color = p.sel != null ? F.FLOW_SEL : F.FLOW;
    const width = (c) => Math.max(0.6, Math.sqrt(c / maxC) * maxW);
    const pt = (u) => proj(m.units[u].c);
    const arc = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; return `M${a[0]},${a[1]}Q${(a[0] + b[0]) / 2 - dy * 0.18},${(a[1] + b[1]) / 2 + dx * 0.18} ${b[0]},${b[1]}`; };
    root.append('g').selectAll('path').data(list).join('path').attr('d', (f) => arc(pt(f[0]), pt(f[1])))
      .style('fill', 'none').style('stroke', color).style('stroke-width', (f) => width(f[2]))
      .style('stroke-opacity', p.sel != null ? 0.85 : (m.isA ? 0.7 : 0.55)).style('stroke-linecap', 'round').attr('vector-effect', NS)
      .on('pointermove', (ev, f) => {
        const [u, v, c] = f; const [mx, my] = d3.pointer(ev, el);
        tp.show(`${m.units[u].short} → ${m.units[v].short}`, [{label: 'People', value: T.fmt.n0(c)},
          {label: `Share of ${m.units[u].short}'s commuters`, value: F.pctTxt(c / m.fixed[u])},
          {label: `Share of ${m.units[v].short}'s workforce`, value: F.pctTxt(c / m.work[v])},
          {label: '', value: `Click to follow ${m.units[p.sel == null ? u : (u === p.sel ? v : u)].short}`}], mx, my);
      })
      .on('pointerleave', () => tp.hide())
      .on('click', (ev, f) => { ev.stopPropagation(); F.select(p.sel == null ? f[0] : (f[0] === p.sel ? f[1] : f[0])); });
    // circles: people staying in their own area
    const ids = p.sel != null ? [p.sel] : (m.isA ? d3.range(n) : []);
    const maxI = m.isA ? d3.max(m.intra) : 3000; // same scale with or without a selection
    nodes.raise().selectAll('circle').data(ids).join('circle')
      .attr('cx', (u) => pt(u)[0]).attr('cy', (u) => pt(u)[1]).attr('data-r', (u) => Math.max(3, Math.sqrt(m.intra[u] / maxI) * (m.isA ? 20 : 10)))
      .style('fill', '#fff').style('fill-opacity', 0.85).style('stroke', color).style('stroke-width', 1.5).attr('vector-effect', NS);
    flowInfo = {color, width, nodes: ids.length > 0,
      samples: p.sel != null ? [maxC, maxC / 4, maxC / 16].map((x) => Math.max(1, Math.round(x))) : (m.isA ? [10000, 2500, 500] : [2000, 500, 100])};
  }

  // labels: electoral areas, or towns at ED level
  const labels = root.append('g').style('pointer-events', 'none');
  const lab = [];
  if (m.isA) {
    const cityAreas = D.areas.map((a, i) => i).filter((i) => D.areas[i].city);
    D.areas.forEach((a, i) => { if (!a.city) { const q = proj(a.c); lab.push({x: q[0], y: q[1] - 16, t: a.name, b: true}); } });
    if (cityAreas.length && D.city) { const q = proj(D.areas[cityAreas[0]].c); lab.push({x: q[0], y: q[1] + 28, t: D.city, b: true}); }
  } else {
    const TOWN = /^(.*) Urban$/;
    const towns = new Set(['Athenry', 'Oranmore', 'Gort', 'Clifden', 'Oughterard', 'Portumna', 'Headford', 'Mount Bellew', 'Spiddle', 'Kinvarra', 'Moycullen', 'Glennamaddy', 'Eyre Square']);
    const rename = {'Mount Bellew': 'Mountbellew', Spiddle: 'Spiddal', Kinvarra: 'Kinvara', 'Eyre Square': D.city ? D.city.replace(/ City$/, '') : 'Eyre Square'};
    D.eds.forEach((e) => { const mm = TOWN.exec(e.name); if (mm || towns.has(e.name)) { const q = proj(e.c); lab.push({x: q[0], y: q[1] - 9, t: mm ? mm[1] : (rename[e.name] || e.name), b: false}); } });
  }
  // context county names, at a point of each neighbouring county that is on screen
  for (const f of ctx) {
    const nm = f.properties.county; if (!nm || nm === D.name || lab.some((l) => l.ctx && l.t === nm)) continue;
    const [[bx0, by0], [bx1, by1]] = path.bounds(f);
    const x0 = Math.max(bx0, 50), x1 = Math.min(bx1, w - 50), y0 = Math.max(by0, 20), y1 = Math.min(by1, H - 20);
    if (x1 - x0 < 30 || y1 - y0 < 20) continue;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; let best = null;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 6; j++) {
      const x = x0 + (x1 - x0) * i / 8, y = y0 + (y1 - y0) * j / 6; const ll = proj.invert([x, y]);
      if (ll && d3.geoContains(f, ll)) { const dd = (x - cx) ** 2 + (y - cy) ** 2; if (!best || dd < best[2]) best = [x, y, dd]; }
    }
    if (best) lab.push({x: best[0], y: best[1], t: nm, ctx: true});
  }
  labels.selectAll('text').data(lab).join('text').attr('x', (l) => l.x).attr('y', (l) => l.y).attr('text-anchor', 'middle').text((l) => l.t)
    .attr('data-fs', (l) => (l.ctx ? 12 : l.b ? 12 : 11))
    .style('font-weight', (l) => (l.b ? 600 : 400)).style('font-style', (l) => (l.ctx ? 'italic' : null))
    .style('fill', (l) => (l.ctx ? 'var(--cds-chart-reference)' : l.b ? 'var(--color-fg)' : 'var(--color-fg-muted)'))
    .style('paint-order', 'stroke').style('stroke', (l) => (l.ctx ? 'none' : 'var(--color-panel)')).style('stroke-linejoin', 'round');

  // zoom and pan (Ctrl / ⌘ + scroll, pinch, drag or the buttons)
  const rescale = (k) => {
    labels.selectAll('text').attr('font-size', function () { return +this.dataset.fs / k; }).style('stroke-width', 3 / k);
    nodes.selectAll('circle').attr('r', function () { return +this.dataset.r / k; });
  };
  const zoom = d3.zoom().scaleExtent([1, 40]).translateExtent([[0, 0], [w, H]])
    .filter((ev) => (ev.type === 'wheel' ? ev.ctrlKey || ev.metaKey : !ev.button && ev.type !== 'dblclick'))
    .on('start', () => s.style('cursor', 'grabbing')).on('end', () => s.style('cursor', 'grab'))
    .on('zoom', (ev) => { root.attr('transform', ev.transform); rescale(ev.transform.k); txfView.t = ev.transform; tp.hide(); });
  s.call(zoom).on('click', (ev) => { if (ev.target === s.node() || ev.target.tagName === 'rect') F.select(null); });
  const key = `${w}x${H}`;
  if (txfView.key === key && txfView.t) s.call(zoom.transform, txfView.t); else { txfView.key = key; txfView.t = d3.zoomIdentity; rescale(1); }
  // zoom buttons
  const btns = document.createElement('div'); btns.className = 'tx-fzoom';
  const fitTo = (feats) => {
    const [[x0, y0], [x1, y1]] = path.bounds({type: 'FeatureCollection', features: feats});
    const k = Math.min(40, 0.85 / Math.max((x1 - x0) / w, (y1 - y0) / H));
    s.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(w / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  };
  const cityFeats = D.area_shapes.features.filter((f) => D.areas[f.properties.i].city);
  for (const [label, aria, fn] of [['+', 'Zoom in', () => s.transition().duration(300).call(zoom.scaleBy, 1.6)],
    ['−', 'Zoom out', () => s.transition().duration(300).call(zoom.scaleBy, 1 / 1.6)],
    ...(cityFeats.length ? [['City', `Zoom to ${D.city || 'the city'}`, () => fitTo(cityFeats)]] : []),
    ['All', `Show all of ${D.name}`, () => s.transition().duration(500).call(zoom.transform, d3.zoomIdentity)]]) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria); b.onclick = fn; btns.append(b);
  }
  el.append(btns);
  const hint = document.createElement('div'); hint.className = 'tx-fhint'; hint.textContent = 'Drag to pan · Ctrl/⌘ + scroll or the buttons to zoom'; el.append(hint);
  el.append(F.legendEl(mt, p, flowInfo));
});

// ---- the selected area (or the county overview) ----------------------------------
function txfBars(el, items, total) {
  const box = document.createElement('div'); box.className = 'tx-fbars';
  const mx = d3.max(items, (it) => it.c) || 1;
  for (const it of items) {
    const r = document.createElement(it.sel != null ? 'button' : 'div'); r.className = 'tx-fbar';
    if (it.sel != null) { r.type = 'button'; r.onclick = () => TXF.select(it.sel); r.title = `Follow ${it.n}`; }
    const nm = document.createElement('span'); nm.className = 'n'; nm.textContent = it.n; nm.title = it.n;
    const tr = document.createElement('span'); tr.className = 'tr';
    const fl = document.createElement('i'); fl.style.width = `${it.c / mx * 100}%`; if (it.ext) fl.className = 'ext'; tr.append(fl);
    const v = document.createElement('span'); v.className = 'v'; v.textContent = total ? `${TX.fmt.n0(it.c)} · ${TXF.pctTxt(it.c / total)}` : TX.fmt.n0(it.c);
    r.append(nm, tr, v); box.append(r);
  }
  el.append(box);
}
function txfStats(el, stats) {
  const g = document.createElement('div'); g.className = 'tx-fstats';
  for (const [v, l] of stats) { const d = document.createElement('div'); d.innerHTML = '<b></b><span></span>'; d.firstChild.textContent = v; d.lastChild.textContent = l; g.append(d); }
  el.append(g);
}
dash.draw('f-sel-h', (el) => {
  const {p, m} = TXF.cur(); if (!m) { el.textContent = 'Selected area'; return; }
  el.textContent = p.sel == null ? `${m.D.name} overall` : m.units[p.sel].name;
});
dash.draw('f-sel', (el) => {
  const T = TX, F = TXF; if (!T.ready(el, ['galway_flows'])) return;
  el.replaceChildren();
  const {p, m} = F.cur(); const n = m.n;
  if (p.sel == null) {
    const A = F.model('area'); let res = 0, inner = 0, city = 0, wfh = 0, inx = 0, ext = 0;
    for (let u = 0; u < A.n; u++) { res += A.res[u]; wfh += A.wfh[u]; inx += A.inExt[u]; ext += A.ext[u]; for (let v = 0; v < A.n; v++) { inner += A.M[u * A.n + v]; if (A.units[v].city) city += A.M[u * A.n + v]; } }
    const sub = document.createElement('p'); sub.className = 'tx-sub';
    sub.textContent = `People living in ${m.D.name} who travel to work, school or college, Census ${m.D.census}. Click an area on the map, a flow below or a row of the matrix to follow it.`;
    el.append(sub);
    txfStats(el, [[T.fmt.n0(res), 'residents commuting'], [T.fmt.n0(inner), `trips within ${m.D.name}`],
      [T.fmt.n0(city), `go to ${m.D.city || 'the city'}`], [T.fmt.n0(wfh), 'work or study from home'],
      [T.fmt.n0(ext), `travel outside ${m.D.name}`], [T.fmt.n0(inx), `come in from outside ${m.D.name}`]]);
    return;
  }
  const s0 = p.sel, U = m.units[s0];
  const sub = document.createElement('p'); sub.className = 'tx-sub';
  sub.textContent = `${m.isA ? '' : `${U.area} · `}${U.city ? (m.D.city || 'City') : `${m.D.name} County`} · population ${T.fmt.n0(U.pop)}`;
  const clr = document.createElement('button'); clr.type = 'button'; clr.className = 'tx-reset tx-fclear'; clr.textContent = 'Clear selection'; clr.onclick = () => F.select(null);
  el.append(clr, sub);
  txfStats(el, [[T.fmt.n0(m.res[s0]), 'residents commuting'], [T.fmt.n0(m.work[s0]), 'people working or studying here'],
    [F.pctTxt(m.intra[s0] / m.fixed[s0]), 'of residents stay in this area*'], [F.pctTxt(m.wfh[s0] / m.res[s0]), 'of residents work from home']]);
  const items = [];
  const own = (v) => (v === s0 ? `${m.units[v].short} (own area)` : m.units[v].short);
  if (p.dir === 'out') {
    for (let v = 0; v < n; v++) if (m.M[s0 * n + v] > 0) items.push({n: own(v), c: m.M[s0 * n + v], sel: v === s0 ? null : v});
    for (const b in m.xo[s0]) items.push({n: F.BUCKET[b] || b, c: m.xo[s0][b], ext: true});
  } else {
    for (let v = 0; v < n; v++) if (m.M[v * n + s0] > 0) items.push({n: own(v), c: m.M[v * n + s0], sel: v === s0 ? null : v});
    for (const b in m.xi[s0]) items.push({n: b, c: m.xi[s0][b], ext: true});
  }
  items.sort((a, b) => b.c - a.c);
  const h = document.createElement('h3'); h.className = 'tx-fh3';
  h.textContent = `${p.dir === 'out' ? 'Where residents go' : 'Where its workforce lives'} (top ${Math.min(15, items.length)} of ${items.length})`;
  el.append(h);
  txfBars(el, items.slice(0, 15), p.dir === 'out' ? m.res[s0] : m.work[s0]);
  const note = document.createElement('p'); note.className = 'tx-note';
  note.textContent = `Grey bars are outside ${m.D.name}, home working or no fixed place. Percentages are of all ${p.dir === 'out' ? 'residents commuting' : 'people working or studying here'}. *Excludes home working and no fixed place.`;
  el.append(note);
});

// ---- largest flows and biggest destinations ----------------------------------
dash.draw('f-sub-top', (el) => {
  const {m} = TXF.cur(); if (!m) { el.textContent = '—'; return; }
  el.textContent = `Between different ${m.isA ? 'electoral areas' : 'EDs'}, people staying in their own area left out · click to follow`;
});
dash.draw('f-top', (el) => {
  const T = TX, F = TXF; if (!T.ready(el, ['galway_flows'])) return;
  el.replaceChildren();
  const {m} = F.cur(); const n = m.n; const rows = [];
  for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) if (u !== v && m.M[u * n + v] > 0) rows.push([u, v, m.M[u * n + v]]);
  rows.sort((a, b) => b[2] - a[2]);
  txfBars(el, rows.slice(0, 10).map(([u, v, c]) => ({n: `${m.units[u].short} → ${m.units[v].short}`, c, sel: u})));
  const h = document.createElement('h3'); h.className = 'tx-fh3'; h.textContent = 'Most people working or studying in'; el.append(h);
  const jc = d3.range(n).filter((u) => m.fixed[u] > 0).sort((a, b) => m.work[b] - m.work[a]).slice(0, 8);
  txfBars(el, jc.map((u) => ({n: m.units[u].short, c: m.work[u], sel: u})));
});

// ---- electoral area matrix -------------------------------------------------------
dash.draw('f-sub-mx', (el) => {
  const {p} = TXF.cur(); const D = TXF.raw(); if (!D) { el.textContent = '—'; return; }
  el.textContent = `${D.name} · Census ${D.census} · rows are where people live, columns where they work or study · ${{n: 'people', row: '% of each row (residents commuting)', col: '% of each column (people working or studying there)'}[p.mx]}`;
});
dash.draw('f-matrix', (el) => {
  const T = TX, F = TXF; if (!T.ready(el, ['galway_flows'])) return;
  el.replaceChildren();
  const {p} = F.cur(); const L = F.model('area'), n = L.n, mode = p.mx; const D = L.D;
  const cols = [...d3.range(n), 'ext', 'WFH', 'NFP'];
  const cell = (u, c) => (typeof c === 'number' ? L.M[u * n + c] : c === 'ext' ? L.ext[u] : (L.xo[u][c] || 0));
  const br = mode === 'n' ? [50, 100, 250, 500, 1000, 2500, 5000] : [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5];
  const val = (u, c, x) => (mode === 'n' ? x : mode === 'row' ? x / L.res[u] : (typeof c === 'number' ? x / L.work[c] : NaN));
  const tp = T.tip(el);
  const wrap = document.createElement('div'); wrap.className = 'tx-fmatrix-wrap';
  const tb = document.createElement('table'); tb.className = 'tx-fmatrix';
  const head = tb.createTHead().insertRow();
  const corner = document.createElement('th'); corner.className = 'c'; corner.innerHTML = 'Live in ↓<br>Work / study in →'; head.append(corner);
  for (const c of cols) {
    const th = document.createElement('th'); th.scope = 'col';
    th.textContent = typeof c === 'number' ? L.units[c].short : {ext: 'Elsewhere', WFH: 'From home', NFP: 'No fixed place'}[c];
    if (c === 'ext') th.className = 'gap'; head.append(th);
  }
  const tot = document.createElement('th'); tot.textContent = 'Total'; head.append(tot);
  const body = tb.createTBody();
  const paint = (td, v, x) => {
    const ci = Number.isFinite(v) ? classOf(v) : -1;
    td.style.background = ci < 0 ? 'transparent' : F.SEQ[ci]; td.style.color = ci >= 4 ? '#fff' : 'var(--color-fg)';
    td.textContent = mode === 'n' ? T.fmt.n0(x) : Number.isFinite(v) ? F.pctTxt(v) : '';
  };
  function classOf(v) { let i = 0; while (i < br.length && v >= br[i]) i++; return i; }
  for (let u = 0; u < n; u++) {
    const tr = body.insertRow(); if (p.level === 'area' && p.sel === u) tr.className = 'sel';
    const th = document.createElement('th'); th.scope = 'row'; th.textContent = L.units[u].short; th.className = 'pick'; th.tabIndex = 0;
    th.title = `Follow ${L.units[u].name} on the map`;
    const go = () => { dash.setParams({flevel: null, fsel: u, fmin: null}); document.getElementById('flows-map')?.scrollIntoView({behavior: 'smooth', block: 'start'}); };
    th.onclick = go; th.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    tr.append(th);
    cols.forEach((c, j) => {
      const x = cell(u, c), v = val(u, c, x); const td = tr.insertCell(); paint(td, v, x);
      if (c === u) td.classList.add('diag'); if (c === 'ext') td.classList.add('gap');
      const to = typeof c === 'number' ? L.units[c].short : {ext: `outside ${D.name}`, WFH: 'from home', NFP: 'no fixed place'}[c];
      td.onpointermove = (ev) => { const [mx, my] = d3.pointer(ev, el); tp.show(`${L.units[u].short} → ${to}`, [{label: 'People', value: T.fmt.n0(x)},
        {label: `Share of ${L.units[u].short}'s residents commuting`, value: F.pctTxt(x / L.res[u])},
        ...(typeof c === 'number' ? [{label: `Share of ${L.units[c].short}'s workforce`, value: F.pctTxt(x / L.work[c])}] : [])], mx, my); };
      td.onpointerleave = () => tp.hide();
    });
    const t = tr.insertCell(); t.className = 'tot'; t.textContent = T.fmt.n0(L.res[u]);
  }
  const rIn = body.insertRow(); rIn.className = 'in';
  const thIn = document.createElement('th'); thIn.scope = 'row'; thIn.textContent = `Outside ${D.name}`; rIn.append(thIn);
  for (let v = 0; v < n; v++) { const x = L.inExt[v], vv = mode === 'col' ? x / L.work[v] : mode === 'row' ? NaN : x; const td = rIn.insertCell(); paint(td, vv, x); if (mode === 'row') td.textContent = ''; }
  for (let j = 0; j < 4; j++) { const td = rIn.insertCell(); if (j === 0) td.className = 'gap'; }
  const rT = body.insertRow(); rT.className = 'tot';
  const thT = document.createElement('th'); thT.scope = 'row'; thT.textContent = 'Total'; rT.append(thT);
  for (let v = 0; v < n; v++) { const td = rT.insertCell(); td.className = 'tot'; td.textContent = T.fmt.n0(L.work[v]); }
  for (let j = 0; j < 4; j++) { const td = rT.insertCell(); if (j === 0) td.className = 'gap'; }
  wrap.append(tb); el.append(wrap);
});
