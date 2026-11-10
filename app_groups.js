// ---------------------------------------------------------------------------
// Who commutes & the bus: CSO Census table F7122 (national, 1986-2022)
// Growth by mode, growth by group, who takes the bus, how each group travels.
// Uses the From / To year filters; the table has no area or settlement split.
// ---------------------------------------------------------------------------
window.TXG = (() => {
  const T = TX;
  // Groups, bottom -> top of the bus stack (and the order of the group picker)
  const GROUPS = ['Workers (15+)', 'Students (19+)', 'Secondary (13-18)', 'Primary school (5-12)', 'Childcare (0-4)'];
  // Ordinal blue ramp by group (darkest at the base): every group here is a bus rider
  const GROUP_COL = {'Workers (15+)': '#0d366b', 'Students (19+)': '#256abf', 'Secondary (13-18)': '#5598e7',
    'Primary school (5-12)': '#9ec5f4', 'Childcare (0-4)': '#cde2fb'};
  const MODE_OF = {Walking: 'Walk or cycle', Cycling: 'Walk or cycle', Bus: 'Bus', Rail: 'Rail', 'Car driver': 'Car driver',
    'Car passenger': 'Car passenger', Motorcycle: 'Van, motorcycle, other', 'Van, lorry or other': 'Van, motorcycle, other'};
  // Modes, bottom -> top of the stack. Colours checked for colour-blind separation in this
  // order; the grey band keeps car driver (orange) and car passenger (magenta) apart.
  const MODES = ['Car driver', 'Van, motorcycle, other', 'Car passenger', 'Rail', 'Bus', 'Walk or cycle'];
  const MODE_COL = {'Car driver': dash.colors[1], 'Van, motorcycle, other': 'var(--cds-chart-muted)',
    'Car passenger': dash.colors[4], Rail: dash.colors[3], Bus: dash.colors[0], 'Walk or cycle': dash.colors[2]};

  const rows = () => T.rows('commute_groups');
  const P = () => { const p = dash.params(); return {busshare: !!p.gbusshare, group: p.ggroup || 'Everyone'}; };

  // Census years inside the From / To filter; null if fewer than two.
  function range() {
    const r = rows(); if (!r) return null;
    const all = [...new Set(r.map((x) => x.year))].sort((a, b) => a - b);
    const {from, to} = T.years();
    const ys = all.filter((y) => y >= from && y <= to);
    return ys.length < 2 ? {all, years: ys, ok: false} : {all, years: ys, ok: true, start: ys[0], end: ys[ys.length - 1]};
  }
  // People by mode in a year, for one group or 'Everyone'. "Not stated" is left out.
  function byMode(year, group) {
    const o = Object.fromEntries(MODES.map((m) => [m, 0]));
    for (const r of rows()) {
      if (r.year !== year || r.mode === 'Not stated' || (group !== 'Everyone' && r.group !== group)) continue;
      o[MODE_OF[r.mode]] += r.value;
    }
    return o;
  }
  // People by group in a year, for one mode or all stated modes.
  function byGroup(year, mode) {
    const o = Object.fromEntries(GROUPS.map((g) => [g, 0]));
    for (const r of rows()) {
      if (r.year !== year || r.mode === 'Not stated' || (mode && MODE_OF[r.mode] !== mode)) continue;
      o[r.group] += r.value;
    }
    return o;
  }
  function notStatedPct(year) {
    let ns = 0, all = 0;
    for (const r of rows()) if (r.year === year) { all += r.value; if (r.mode === 'Not stated') ns += r.value; }
    return all ? ns / all * 100 : null;
  }
  const sum = (o) => d3.sum(Object.values(o));
  // +849k / −50k / +9
  function signed(v) {
    const a = Math.abs(v), s = v > 0 ? '+' : v < 0 ? '−' : '';
    return s + (a >= 10000 ? `${d3.format(',.0f')(a / 1000)}k` : d3.format(',')(a));
  }
  const pct = (v) => T.fmt.pct0(v);
  // "1.36 million" / "198,000"
  const words = (v) => { const a = Math.abs(v); return a >= 1e6 ? `${d3.format('.2f')(a / 1e6)} million` : d3.format(',')(a); };
  function pickYears(el, r) {
    el.replaceChildren();
    const m = document.createElement('p'); m.className = 'tx-fail';
    m.textContent = `Widen the year range: this table has census years ${r ? r.all.join(', ') : ''}.`;
    el.append(m);
  }

  // Horizontal bars around zero. items: [{name, value, color, strong, tip: [{label, value}]}]
  function hbars(el, items, valueLabel) {
    const rowH = 36, H = items.length * rowH + 30;
    const {s, w} = T.svg(el, H);
    const fs = 'var(--cds-font-size-caption)';
    const ml = T.textWidth(s, items.map((o) => o.name)) + 18;
    const lw = T.textWidth(s, items.map((o) => valueLabel(o))) + 12;
    const lo = Math.min(0, d3.min(items, (o) => o.value)), hi = Math.max(0, d3.max(items, (o) => o.value));
    const x = d3.scaleLinear([lo, hi], [ml + (lo < 0 ? lw : 4), w - lw]).nice();
    const y = d3.scaleBand(items.map((o) => o.name), [4, H - 26]).paddingInner(0.32).paddingOuter(0.1);
    const ticks = Math.max(2, Math.floor((w - ml) / 110));
    s.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).ticks(ticks).tickSize(-(H - 30))).call(T.grid);
    // on narrow screens the bar labels carry the values, so the axis labels are left out
    if (w - ml >= 300) {
      s.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).ticks(ticks).tickFormat((v) => (v === 0 ? '0' : signed(v))).tickSize(0))
        .call(T.styleAxis).select('.domain').remove();
    }
    // highlighted row band
    s.append('g').selectAll('rect').data(items.filter((o) => o.strong)).join('rect')
      .attr('x', 0).attr('width', w).attr('y', (o) => y(o.name) - y.step() * y.paddingInner() / 2).attr('height', y.step())
      .attr('rx', 4).style('fill', 'var(--color-bg)');
    s.append('g').selectAll('rect').data(items).join('rect')
      .attr('x', (o) => Math.min(x(0), x(o.value))).attr('width', (o) => Math.max(2, Math.abs(x(o.value) - x(0))))
      .attr('y', (o) => y(o.name)).attr('height', y.bandwidth()).attr('rx', 2).style('fill', (o) => o.color);
    s.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', H - 26).style('stroke', 'var(--cds-chart-reference)');
    s.append('g').selectAll('text').data(items).join('text')
      .attr('x', ml - 10).attr('y', (o) => y(o.name) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
      .text((o) => o.name).style('font-size', fs).style('fill', (o) => (o.strong ? 'var(--color-fg)' : 'var(--color-fg-muted)'))
      .style('font-weight', (o) => (o.strong ? 'var(--cds-font-weight-medium)' : null));
    s.append('g').selectAll('text').data(items).join('text')
      .attr('x', (o) => (o.value >= 0 ? x(o.value) + 6 : x(o.value) - 6)).attr('y', (o) => y(o.name) + y.bandwidth() / 2)
      .attr('dy', '0.35em').attr('text-anchor', (o) => (o.value >= 0 ? 'start' : 'end')).text((o) => valueLabel(o))
      .style('font-size', fs).style('fill', 'var(--color-fg)').style('font-variant-numeric', 'tabular-nums')
      .style('font-weight', (o) => (o.strong ? 'var(--cds-font-weight-medium)' : null));
    const tp = T.tip(el);
    s.append('g').selectAll('rect').data(items).join('rect')
      .attr('x', 0).attr('width', w).attr('y', (o) => y(o.name) - y.step() * y.paddingInner() / 2).attr('height', y.step())
      .style('fill', 'transparent')
      .on('pointermove', (ev, o) => { const [mx, my] = d3.pointer(ev, el); tp.show(o.name, o.tip, mx, my); })
      .on('pointerleave', () => tp.hide());
  }

  return {GROUPS, GROUP_COL, MODES, MODE_COL, rows, P, range, byMode, byGroup, notStatedPct, sum, signed, pct, words, pickYears, hbars};
})();

// ---- scope note: this table is national only
dash.draw('g-scope', (el) => {
  const p = TX.P();
  const msg = p.geo !== 'National|Ireland' || p.settle !== 'All'
    ? 'This tab shows Ireland as a whole: the Census table it uses has no area or settlement split, so only the year filters apply.' : '';
  el.textContent = msg; el.hidden = !msg;
});

// ---- 1. where the growth went -------------------------------------------------
dash.draw('g-sub-growth', (el) => {
  const G = TXG, r = G.range(); if (!r || !r.ok) { el.textContent = '—'; return; }
  TX.text(el, `Change in people travelling to work, school or college, by main mode · Ireland · Census ${r.start} to ${r.end}`);
});
dash.draw('g-growth', (el) => {
  const T = TX, G = TXG; if (!T.ready(el, ['commute_groups'])) return;
  const r = G.range(); if (!r.ok) { G.pickYears(el, r); return; }
  el.replaceChildren();
  const a = G.byMode(r.start, 'Everyone'), b = G.byMode(r.end, 'Everyone');
  const ta = G.sum(a), tb = G.sum(b);
  const items = G.MODES.map((m) => ({
    name: m, value: b[m] - a[m], color: G.MODE_COL[m], strong: m === 'Bus',
    tip: [{label: String(r.start), value: `${T.fmt.n0(a[m])} (${G.pct(a[m] / ta * 100)})`},
      {label: String(r.end), value: `${T.fmt.n0(b[m])} (${G.pct(b[m] / tb * 100)})`},
      {label: 'Change', value: G.signed(b[m] - a[m])}],
  })).sort((p, q) => q.value - p.value);
  G.hbars(el, items, (o) => G.signed(o.value));
});
dash.draw('g-note-growth', (el) => {
  const T = TX, G = TXG, r = G.range(); if (!r || !r.ok) { el.textContent = '—'; return; }
  const a = G.byMode(r.start, 'Everyone'), b = G.byMode(r.end, 'Everyone');
  const ta = G.sum(a), tb = G.sum(b), car = (o) => o['Car driver'] + o['Car passenger'];
  const ns = G.notStatedPct(r.end);
  const bus = b.Bus - a.Bus, dc = car(b) - car(a);
  const verb = (v) => (v >= 0 ? 'rose' : 'fell');
  const bold = (v) => T.b(document.createTextNode(G.words(v)));
  T.text(el, `Commuters ${verb(tb - ta)} by `, bold(tb - ta), ` (${G.pct(Math.abs(tb - ta) / ta * 100)}). `,
    `Car drivers and passengers ${verb(dc)} by `, bold(dc), `; bus commuters ${verb(bus)} by `, bold(bus),
    `, so the bus share went from ${G.pct(a.Bus / ta * 100)} to ${G.pct(b.Bus / tb * 100)}. Excludes "not stated" (${T.fmt.pct(ns)} of people in ${r.end}).`);
});

// ---- 2. who commutes: change by group -------------------------------------------
dash.draw('g-sub-who', (el) => {
  const r = TXG.range(); if (!r || !r.ok) { el.textContent = '—'; return; }
  TX.text(el, `Change in people travelling, by group · all modes · ${r.start} to ${r.end}`);
});
dash.draw('g-who', (el) => {
  const T = TX, G = TXG; if (!T.ready(el, ['commute_groups'])) return;
  const r = G.range(); if (!r.ok) { G.pickYears(el, r); return; }
  el.replaceChildren();
  const a = G.byGroup(r.start), b = G.byGroup(r.end);
  const total = G.sum(b) - G.sum(a);
  const items = G.GROUPS.map((g) => ({
    name: g, value: b[g] - a[g], color: 'var(--cds-chart-reference)', strong: false,
    tip: [{label: String(r.start), value: T.fmt.n0(a[g])}, {label: String(r.end), value: T.fmt.n0(b[g])},
      {label: 'Share of all growth', value: total ? G.pct((b[g] - a[g]) / total * 100) : '—'}],
  })).sort((p, q) => q.value - p.value);
  const top = items[0]; top.strong = true; top.color = 'var(--color-fg-muted)';
  G.hbars(el, items, (o) => G.signed(o.value));
});
dash.draw('g-note-who', (el) => {
  const T = TX, G = TXG, r = G.range(); if (!r || !r.ok) { el.textContent = '—'; return; }
  const a = G.byGroup(r.start), b = G.byGroup(r.end), total = G.sum(b) - G.sum(a);
  const w = 'Workers (15+)', s = 'Students (19+)';
  const parts = [`Workers make up ${G.pct((b[w] - a[w]) / total * 100)} of the change.`];
  if (a[s] > 0) parts.push(`Students aged 19+ grew ${d3.format('.1f')(b[s] / a[s])}-fold.`);
  if (r.end >= 2022 && r.start < 2022) parts.push('Childcare (0-4) was first counted in 2022, so its whole number shows as growth.');
  el.textContent = parts.join(' ');
});

// ---- 3. who takes the bus ------------------------------------------------------
dash.draw('g-sub-bus', (el) => {
  const r = TXG.range(); if (!r || !r.ok) { el.textContent = '—'; return; }
  TX.text(el, `${TXG.P().busshare ? 'Share of bus commuters' : 'Bus commuters'} by group · Census ${r.start}–${r.end}`);
});
dash.draw('g-bus', (el) => {
  const T = TX, G = TXG; if (!T.ready(el, ['commute_groups'])) return;
  const r = G.range(); if (!r.ok) { G.pickYears(el, r); return; }
  el.replaceChildren();
  const share = G.P().busshare;
  const keys = G.GROUPS.filter((g) => r.years.some((y) => G.byGroup(y, 'Bus')[g] > 0));
  const raw = r.years.map((y) => ({year: y, ...G.byGroup(y, 'Bus')}));
  const wide = raw.map((o) => { const t = d3.sum(keys, (k) => o[k]); const v = {year: o.year, total: t};
    for (const k of keys) v[k] = share ? o[k] / t * 100 : o[k]; return v; });
  T.legend(el, [...keys].reverse().map((k) => [k, G.GROUP_COL[k]]));
  const H = 320; const {s, w} = T.svg(el, H);
  const stack = d3.stack().keys(keys)(wide);
  const y = d3.scaleLinear([0, share ? 100 : d3.max(wide, (o) => o.total) * 1.05], [H - 26, 8]).nice();
  const yFmt = share ? (v) => `${v}%` : (v) => T.fmt.big(v);
  const ml = T.textWidth(s, y.ticks(5).map(yFmt)) + 10;
  const x = d3.scaleBand(r.years, [ml, w - 6]).paddingInner(0.3).paddingOuter(0.15);
  s.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - ml - 6))).call(T.grid);
  s.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(yFmt).tickSize(0)).call(T.styleAxis).select('.domain').remove();
  s.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).tickSize(0)).call(T.styleAxis);
  s.append('g').selectAll('g').data(stack).join('g').style('fill', (d) => G.GROUP_COL[d.key])
    .selectAll('rect').data((d) => d).join('rect')
    .attr('x', (d) => x(d.data.year)).attr('width', x.bandwidth()).attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])))
    .style('stroke', 'var(--color-panel)').style('stroke-width', 1);
  const tp = T.tip(el);
  s.append('g').selectAll('rect').data(wide).join('rect')
    .attr('x', (o) => x(o.year) - x.step() * x.paddingInner() / 2).attr('width', x.step()).attr('y', 0).attr('height', H - 26)
    .style('fill', 'transparent')
    .on('pointermove', (ev, o) => {
      const [mx, my] = d3.pointer(ev, el); const rawO = raw.find((q) => q.year === o.year);
      tp.show(`${o.year} · ${T.fmt.n0(o.total)} bus commuters`, [...keys].reverse().map((k) => ({label: k,
        value: `${T.fmt.n0(rawO[k])} (${G.pct(rawO[k] / o.total * 100)})`, color: G.GROUP_COL[k]})), mx, my);
    })
    .on('pointerleave', () => tp.hide());
});
dash.draw('g-note-bus', (el) => {
  const G = TXG, r = G.range(); if (!r || !r.ok) { el.textContent = '—'; return; }
  const a = G.byGroup(r.start, 'Bus'), b = G.byGroup(r.end, 'Bus'), ta = G.sum(a), tb = G.sum(b);
  const sh = (o, t, g) => G.pct(o[g] / t * 100);
  el.textContent = `Bus commuters: ${TX.fmt.n0(ta)} in ${r.start}, ${TX.fmt.n0(tb)} in ${r.end}. `
    + `Students aged 19+ went from ${sh(a, ta, 'Students (19+)')} to ${sh(b, tb, 'Students (19+)')} of riders, `
    + `workers from ${sh(a, ta, 'Workers (15+)')} to ${sh(b, tb, 'Workers (15+)')}, `
    + `primary school children from ${sh(a, ta, 'Primary school (5-12)')} to ${sh(b, tb, 'Primary school (5-12)')}.`;
});

// ---- 4. how each group travels ------------------------------------------------
dash.draw('g-sub-modes', (el) => {
  const r = TXG.range(); if (!r || !r.ok) { el.textContent = '—'; return; }
  const g = TXG.P().group;
  TX.text(el, `Share of ${g === 'Everyone' ? 'everyone travelling to work, school or college' : g.toLowerCase()} by main mode · Census ${r.start}–${r.end}`);
});
dash.draw('g-modes', (el) => {
  const T = TX, G = TXG; if (!T.ready(el, ['commute_groups'])) return;
  const r = G.range(); if (!r.ok) { G.pickYears(el, r); return; }
  el.replaceChildren();
  const grp = G.P().group;
  const years = r.years.filter((y) => G.sum(G.byMode(y, grp)) > 0);
  if (years.length < 2) {
    const m = document.createElement('p'); m.className = 'tx-fail';
    m.textContent = `${grp} only appears in Census ${years.join(', ') || 'none of the chosen years'}; pick another group to see a trend.`;
    el.append(m); return;
  }
  const wide = years.map((y) => { const o = G.byMode(y, grp), t = G.sum(o); const v = {year: y};
    for (const k of G.MODES) v[k] = o[k] / t * 100; return v; });
  T.legend(el, [...G.MODES].reverse().map((k) => [k, G.MODE_COL[k]]));
  const H = 340; const {s, w} = T.svg(el, H);
  const stack = d3.stack().keys(G.MODES)(wide);
  const y = d3.scaleLinear([0, 100], [H - 26, 8]);
  const ml = T.textWidth(s, ['100%']) + 10;
  const x = d3.scaleLinear(d3.extent(years), [ml, w - 12]);
  s.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - ml - 12))).call(T.grid);
  s.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => `${v}%`).tickSize(0)).call(T.styleAxis).select('.domain').remove();
  // label census years, skipping any that would collide on narrow screens
  const shown = years.reduce((acc, yr) => ((!acc.length || x(yr) - x(acc[acc.length - 1]) >= 38) ? [...acc, yr] : acc), []);
  s.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).tickValues(shown).tickFormat(d3.format('d'))).call(T.styleAxis);
  const area = d3.area().x((d) => x(d.data.year)).y0((d) => y(d[0])).y1((d) => y(d[1]));
  s.append('g').selectAll('path').data(stack).join('path').attr('d', area)
    .style('fill', (d) => G.MODE_COL[d.key]).style('fill-opacity', 0.9).style('stroke', 'var(--color-panel)').style('stroke-width', 1.5);
  const tp = T.tip(el); const rule = s.append('line').style('stroke', 'var(--cds-chart-reference)').attr('y1', 8).attr('y2', H - 26).attr('visibility', 'hidden');
  s.append('rect').attr('x', ml).attr('y', 0).attr('width', w - ml - 12).attr('height', H - 26).style('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [mx] = d3.pointer(ev); const yr = years.reduce((a, b) => (Math.abs(x(b) - mx) < Math.abs(x(a) - mx) ? b : a));
      const o = wide.find((d) => d.year === yr); rule.attr('x1', x(yr)).attr('x2', x(yr)).attr('visibility', 'visible');
      tp.show(`${grp} · ${yr}`, [...G.MODES].reverse().map((k) => ({label: k, value: T.fmt.pct(o[k]), color: G.MODE_COL[k]})), x(yr) * el.clientWidth / w, 40);
    })
    .on('pointerleave', () => { tp.hide(); rule.attr('visibility', 'hidden'); });
});
dash.draw('g-note-modes', (el) => {
  const G = TXG, r = G.range(); if (!r || !r.ok) { el.textContent = '—'; return; }
  const grp = G.P().group;
  const years = r.years.filter((y) => G.sum(G.byMode(y, grp)) > 0);
  if (years.length < 2) { el.textContent = ''; return; }
  const y0 = years[0], y1 = years[years.length - 1];
  const a = G.byMode(y0, grp), b = G.byMode(y1, grp), ta = G.sum(a), tb = G.sum(b);
  const d = G.MODES.map((m) => ({m, a: a[m] / ta * 100, b: b[m] / tb * 100})).map((o) => ({...o, d: o.b - o.a})).sort((p, q) => q.d - p.d);
  const up = d[0], down = d[d.length - 1];
  el.textContent = `Biggest shift, ${y0} to ${y1}: ${up.m.toLowerCase()} up from ${G.pct(up.a)} to ${G.pct(up.b)}; `
    + `${down.m.toLowerCase()} down from ${G.pct(down.a)} to ${G.pct(down.b)}. Excludes "not stated".`;
});

// ---- controls for this tab
document.querySelectorAll('.tx-gbusshare').forEach((c) => c.addEventListener('change', () => dash.setParams({gbusshare: c.checked || null})));
document.querySelectorAll('.tx-ggroup').forEach((c) => c.addEventListener('change', () => dash.setParams({ggroup: c.value === 'Everyone' ? null : c.value})));
dash.onData(() => {
  const p = TXG.P();
  document.querySelectorAll('.tx-gbusshare').forEach((c) => { c.checked = p.busshare; });
  document.querySelectorAll('.tx-ggroup').forEach((c) => { c.value = p.group; });
});
