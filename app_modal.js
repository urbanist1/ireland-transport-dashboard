// ---------------------------------------------------------------------------
// Modal shift: trend, map, peak times
// ---------------------------------------------------------------------------
function txTrendRows() {
  const T = TX, p = T.P(), g = T.geo(), m = T.rows('modal');
  if (!m) return null;
  const notes = [];
  let r = m.filter((x) => x.series === p.series);
  let geoR = r.filter((x) => x.geo_level === g.level && x.geography === g.name);
  let used = g;
  if (!geoR.length) {
    geoR = r.filter((x) => x.geo_level === 'National'); used = {level: 'National', name: 'Ireland'};
    if (g.level !== 'National') notes.push(`This source has no ${g.name} figures; showing Ireland.`);
  }
  let st = p.settle;
  if (!geoR.some((x) => x.settlement === st)) {
    if (st !== 'All') notes.push(`This source isn't split by settlement type here; showing all areas.`);
    st = 'All';
  }
  const rs = geoR.filter((x) => x.settlement === st && T.inRange(x.year));
  return {rows: rs, used, settle: st, notes};
}

dash.draw('sub-trend', (el) => {
  const t = txTrendRows(); if (!t) { el.textContent = '—'; return; }
  const p = TX.P(); const ys = t.rows.map((r) => r.year);
  const what = p.series === 'Census commuters'
    ? (p.share ? 'Share of trips to work, school or college' : 'People travelling to work, school or college')
    : 'Share of all journeys by adults';
  TX.text(el, `${what} · ${t.used.name} · ${TX.settleLabel(t.settle).toLowerCase()} · ${ys.length ? `${d3.min(ys)}–${d3.max(ys)}` : 'no years in range'}`);
});
dash.draw('note-trend', (el) => {
  const t = txTrendRows(); if (!t) { el.textContent = '—'; return; }
  const p = TX.P();
  const base = p.series === 'Census commuters'
    ? 'Census years only; points mark each census, lines join them.'
    : 'Travel survey waves only (2014, 2016, 2019, 2021, 2024).';
  TX.text(el, [...t.notes, base].join(' '));
});

dash.draw('trend', (el) => {
  const T = TX; if (!T.ready(el, ['modal'])) return;
  const t = txTrendRows(); const p = T.P();
  el.replaceChildren();
  if (!t.rows.length) { T.text(el, ''); return; }
  const asShare = p.series !== 'Census commuters' || p.share;
  const years = [...new Set(t.rows.map((r) => r.year))].sort((a, b) => a - b);
  const keys = T.MODES.filter((k) => t.rows.some((r) => r.mode_group === k));
  const wide = years.map((y) => {
    const o = {year: y};
    for (const k of keys) { const r = t.rows.find((x) => x.year === y && x.mode_group === k); o[k] = r ? (asShare ? r.share_pct : r.value) : 0; }
    return o;
  });
  T.legend(el, keys.map((k) => [k, T.modeColor(k)]));
  const H = 330; const {s, w} = T.svg(el, H);
  const stack = d3.stack().keys(keys)(wide);
  const yMax = asShare ? 100 : d3.max(stack[stack.length - 1], (d) => d[1]) * 1.05;
  const y = d3.scaleLinear([0, yMax], [H - 26, 8]).nice();
  const yFmt = asShare ? (v) => `${v}%` : (v) => T.fmt.big(v);
  const ml = T.textWidth(s, y.ticks(5).map(yFmt)) + 10;
  const x = (years.length > 1 ? d3.scaleLinear(d3.extent(years), [ml, w - 12]) : d3.scaleLinear([years[0] - 1, years[0] + 1], [ml, w - 12]));
  s.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - ml - 12))).call(T.grid);
  s.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(yFmt).tickSize(0)).call(T.styleAxis).select('.domain').remove();
  const span = years[years.length - 1] - years[0];
  s.append('g').attr('transform', `translate(0,${H - 26})`)
    .call(d3.axisBottom(x).ticks(Math.min(years.length, Math.max(2, Math.floor((w - ml) / 70)))).tickFormat(d3.format('d'))).call(T.styleAxis);
  const area = d3.area().x((d) => x(d.data.year)).y0((d) => y(d[0])).y1((d) => y(d[1]));
  s.append('g').selectAll('path').data(stack).join('path').attr('d', area)
    .style('fill', (d) => T.modeColor(d.key)).style('fill-opacity', 0.85).style('stroke', 'var(--color-panel)').style('stroke-width', 1);
  if (span > years.length - 1 || years.length < 12) {
    s.append('g').selectAll('circle').data(stack.flatMap((ser) => ser.map((d) => ({k: ser.key, d}))))
      .join('circle').attr('cx', (o) => x(o.d.data.year)).attr('cy', (o) => y(o.d[1])).attr('r', 2.5)
      .style('fill', 'var(--color-panel)').style('stroke', (o) => T.modeColor(o.k)).style('stroke-width', 1.5);
  }
  const tp = T.tip(el); const rule = s.append('line').style('stroke', 'var(--cds-chart-reference)').attr('y1', 8).attr('y2', H - 26).attr('visibility', 'hidden');
  s.append('rect').attr('x', ml).attr('y', 0).attr('width', w - ml - 12).attr('height', H - 26).style('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [mx] = d3.pointer(ev); const yr = years.reduce((a, b) => (Math.abs(x(b) - mx) < Math.abs(x(a) - mx) ? b : a));
      const o = wide.find((d) => d.year === yr); rule.attr('x1', x(yr)).attr('x2', x(yr)).attr('visibility', 'visible');
      tp.show(String(yr), [...keys].reverse().map((k) => ({label: k, value: asShare ? T.fmt.pct(o[k]) : T.fmt.n0(o[k]), color: T.modeColor(k)})), x(yr) * el.clientWidth / w, 40);
    })
    .on('pointerleave', () => { tp.hide(); rule.attr('visibility', 'hidden'); });
});

// ---- map ----------------------------------------------------------------------
window.txMapFeatures = (() => {
  let src = null, fixed = null;
  return (gj) => {
    if (gj === src) return fixed;
    src = gj;
    fixed = {type: 'FeatureCollection', features: gj.features.map((f) => {
      const c = JSON.parse(JSON.stringify(f));
      // d3 wants clockwise outer rings; fix each polygon on its own (winding is mixed in the source)
      const polys = c.geometry.type === 'Polygon' ? [c.geometry.coordinates] : c.geometry.coordinates;
      polys.forEach((poly) => { if (d3.geoArea({type: 'Polygon', coordinates: poly}) > 2 * Math.PI) poly.forEach((ring) => ring.reverse()); });
      return c;
    })};
    return fixed;
  };
})();
function txMapValues() {
  const T = TX, p = T.P(), a = T.rows('area_metrics'); if (!a) return null;
  const r = a.filter((x) => x.metric === p.mapmetric && x.geo_level === p.maplevel);
  const y = T.latest(r);
  return {year: y, rows: r.filter((x) => x.year === y)};
}
dash.draw('sub-map', (el) => {
  const v = txMapValues(); if (!v) { el.textContent = '—'; return; }
  const p = TX.P();
  const src = {'PT share of commuters (%)': 'Census', 'PT trips per 1,000 residents': 'GTFS weekday timetable', 'Cars per 1,000 residents': 'licensed vehicles'}[p.mapmetric];
  TX.text(el, `${p.mapmetric} · ${p.maplevel === 'County' ? 'counties' : 'regions'} · ${src} ${v.year ?? ''} · darker = higher`);
});
dash.draw('map', (el) => {
  const T = TX; if (!T.ready(el, ['area_metrics', 'ireland_map'])) return;
  el.replaceChildren();
  const gj = dash.data('ireland_map').data;
  if (!gj || !gj.features) { T.text(el, ''); return; }
  const fc = txMapFeatures(gj); const v = txMapValues(); const p = T.P(); const g = T.geo();
  const key = p.maplevel === 'County' ? 'county' : 'region';
  const val = new Map(v.rows.map((r) => [r.geography, r.value]));
  const H = Math.max(380, Math.min(560, el.clientWidth * 1.15));
  const {s, w} = T.svg(el, H);
  const proj = d3.geoMercator().fitExtent([[8, 8], [w - 70, H - 8]], fc);
  const path = d3.geoPath(proj);
  const ext = d3.extent(v.rows, (r) => r.value);
  const color = d3.scaleSequential([ext[0], ext[1]], (t) => d3.interpolateBlues(0.15 + 0.8 * t));
  const tp = T.tip(el);
  const sel = (f) => (g.level === 'County' && f.properties.county === g.name) || (g.level === 'Regional' && f.properties.region === g.name);
  const fmtV = p.mapmetric.includes('%') ? T.fmt.pct : (p.mapmetric.startsWith('Cars') ? T.fmt.n0 : T.fmt.n1);
  s.append('g').selectAll('path').data(fc.features).join('path').attr('d', path)
    .style('fill', (f) => { const x = val.get(f.properties[key]); return x == null ? 'var(--cds-chart-muted)' : color(x); })
    .style('stroke', 'var(--color-panel)').style('stroke-width', 0.8).style('cursor', 'pointer')
    .on('pointermove', (ev, f) => {
      const [mx, my] = d3.pointer(ev, el); const nm = f.properties[key];
      tp.show(nm, [{label: p.mapmetric, value: fmtV(val.get(nm))}], mx, my);
    })
    .on('pointerleave', () => tp.hide())
    .on('click', (ev, f) => dash.setParams({geo: `${p.maplevel}|${f.properties[key]}`}));
  // outline of the chosen area
  const chosen = fc.features.filter(sel);
  if (chosen.length) s.append('g').selectAll('path').data(chosen).join('path').attr('d', path)
    .style('fill', 'none').style('stroke', 'var(--color-fg)').style('stroke-width', 2).style('pointer-events', 'none');
  // legend ramp
  const lx = w - 52, ly0 = 20, lh = Math.min(180, H - 60);
  const id = `txg${Math.random().toString(36).slice(2, 8)}`;
  const grad = s.append('defs').append('linearGradient').attr('id', id).attr('x1', 0).attr('x2', 0).attr('y1', 1).attr('y2', 0);
  d3.range(0, 1.01, 0.25).forEach((t) => grad.append('stop').attr('offset', t).style('stop-color', d3.interpolateBlues(0.15 + 0.8 * t)));
  s.append('rect').attr('x', lx).attr('y', ly0).attr('width', 12).attr('height', lh).attr('rx', 2).style('fill', `url(#${id})`);
  s.append('text').attr('x', lx + 16).attr('y', ly0 + 10).text(fmtV(ext[1])).style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
  s.append('text').attr('x', lx + 16).attr('y', ly0 + lh).text(fmtV(ext[0])).style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
});

// ---- peak commuting times --------------------------------------------------------
function txPeakRows() {
  const T = TX, d = T.rows('departure'); if (!d) return null;
  const y = T.latest(d); return {year: y, rows: d.filter((x) => x.year === y)};
}
dash.draw('sub-peak', (el) => {
  const v = txPeakRows(); if (!v) { el.textContent = '—'; return; }
  TX.text(el, `Census ${v.year} · ${TX.P().peaknorm ? "% of each mode's trips by time leaving home" : 'people leaving home in each half hour'}`);
});
dash.draw('peak', (el) => {
  const T = TX; if (!T.ready(el, ['departure'])) return;
  el.replaceChildren();
  const v = txPeakRows(); const norm = T.P().peaknorm;
  const times = [...new Set(v.rows.sort((a, b) => a.departure_rank - b.departure_rank).map((r) => r.departure_time))];
  const keys = T.MODES.filter((k) => v.rows.some((r) => r.mode_group === k));
  T.legend(el, keys.map((k) => [k, T.modeColor(k)]));
  const H = 330; const {s, w} = T.svg(el, H);
  const val = (r) => (norm ? r.share_of_mode_pct : r.value);
  const yMax = d3.max(v.rows, val) * 1.08;
  const y = d3.scaleLinear([0, yMax], [H - 42, 8]).nice();
  const yFmt = norm ? (x) => `${x}%` : (x) => T.fmt.big(x);
  const ml = T.textWidth(s, y.ticks(5).map(yFmt)) + 10;
  const x0 = d3.scaleBand(times, [ml, w - 6]).paddingInner(0.18);
  const x1 = d3.scaleBand(keys, [0, x0.bandwidth()]).padding(0.08);
  s.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - ml - 6))).call(T.grid);
  s.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(yFmt).tickSize(0)).call(T.styleAxis).select('.domain').remove();
  const xa = s.append('g').attr('transform', `translate(0,${H - 42})`).call(d3.axisBottom(x0).tickSize(0)).call(T.styleAxis);
  const tw = T.textWidth(s, times);
  if (tw > x0.bandwidth() - 4) xa.selectAll('text').attr('transform', 'rotate(-28)').style('text-anchor', 'end').attr('dx', '-0.2em').attr('dy', '0.9em');
  const tp = T.tip(el);
  s.append('g').selectAll('g').data(times).join('g').attr('transform', (t) => `translate(${x0(t)},0)`)
    .selectAll('rect').data((t) => keys.map((k) => v.rows.find((r) => r.departure_time === t && r.mode_group === k)).filter(Boolean)).join('rect')
    .attr('x', (r) => x1(r.mode_group)).attr('width', x1.bandwidth()).attr('y', (r) => y(val(r))).attr('height', (r) => y(0) - y(val(r)))
    .attr('rx', 2).style('fill', (r) => T.modeColor(r.mode_group))
    .on('pointermove', (ev, r) => { const [mx, my] = d3.pointer(ev, el); tp.show(r.departure_time, [{label: r.mode_group, value: norm ? T.fmt.pct(r.share_of_mode_pct) : T.fmt.n0(r.value), color: T.modeColor(r.mode_group)}], mx, my); })
    .on('pointerleave', () => tp.hide());
});
