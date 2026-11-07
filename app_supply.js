// ---------------------------------------------------------------------------
// Urban vs rural (dependency) · Cars, services & kilometres
// ---------------------------------------------------------------------------
// ---- multi-line chart helper (lines labelled at the end) --------------------------
function txLines(el, series, opts) {
  const T = TX; const H = opts.H || 300; const {s, w} = T.svg(el, H);
  const all = series.flatMap((d) => d.points);
  if (!all.length) return;
  const y = d3.scaleLinear([opts.zero ? 0 : d3.min(all, (p) => p.v) * 0.95, d3.max(all, (p) => p.v) * 1.05], [H - 30, 10]).nice();
  const endW = T.textWidth(s, series.map((d) => `${d.name} ${opts.fmt(d.points[d.points.length - 1].v)}`));
  const ml = T.textWidth(s, y.ticks(5).map(opts.fmt)) + 10;
  const x = d3.scaleLinear(d3.extent(all, (p) => p.y), [ml, Math.max(ml + 80, w - endW - 12)]);
  s.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(x.range()[1] - ml))).call(T.grid);
  s.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(opts.fmt).tickSize(0)).call(T.styleAxis).select('.domain').remove();
  s.append('g').attr('transform', `translate(0,${H - 30})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.floor((x.range()[1] - ml) / 70))).tickFormat(d3.format('d'))).call(T.styleAxis);
  const line = d3.line().x((p) => x(p.y)).y((p) => y(p.v));
  for (const d of series) {
    s.append('path').attr('d', line(d.points)).style('fill', 'none').style('stroke', d.color).style('stroke-width', d.strong ? 2.5 : 2)
      .style('stroke-linecap', 'round').style('stroke-linejoin', 'round').style('stroke-dasharray', d.dash ? '4 3' : null).style('opacity', d.faded ? 0.35 : 1);
    if (opts.points) s.append('g').selectAll('circle').data(d.points).join('circle').attr('cx', (p) => x(p.y)).attr('cy', (p) => y(p.v)).attr('r', 3)
      .style('fill', d.color).style('stroke', 'var(--color-panel)').style('stroke-width', 1).style('opacity', d.faded ? 0.35 : 1);
  }
  // end labels, nudged apart
  const ends = series.map((d) => ({d, y: y(d.points[d.points.length - 1].v), x: x(d.points[d.points.length - 1].y)})).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  s.append('g').selectAll('text').data(ends).join('text').attr('x', (e) => e.x + 6).attr('y', (e) => e.y).attr('dy', '0.35em')
    .text((e) => `${e.d.name} ${opts.fmt(e.d.points[e.d.points.length - 1].v)}`)
    .style('font-size', 'var(--cds-font-size-caption)').style('fill', (e) => (e.d.faded ? 'var(--color-fg-muted)' : 'var(--color-fg)'));
  const tp = T.tip(el); const yrs = [...new Set(all.map((p) => p.y))].sort((a, b) => a - b);
  const rule = s.append('line').style('stroke', 'var(--cds-chart-reference)').attr('y1', 10).attr('y2', H - 30).attr('visibility', 'hidden');
  s.append('rect').attr('x', ml).attr('y', 0).attr('width', x.range()[1] - ml).attr('height', H - 30).style('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [mx] = d3.pointer(ev); const yr = yrs.reduce((a, b) => (Math.abs(x(b) - mx) < Math.abs(x(a) - mx) ? b : a));
      rule.attr('x1', x(yr)).attr('x2', x(yr)).attr('visibility', 'visible');
      tp.show(String(yr), series.map((d) => ({label: d.name, value: opts.fmt(d.points.find((p) => p.y === yr)?.v), color: d.color})).filter((l) => l.value !== '—'), x(yr), 30);
    })
    .on('pointerleave', () => { tp.hide(); rule.attr('visibility', 'hidden'); });
}

// ---- PT dependency index -----------------------------------------------------------
dash.draw('dep', (el) => {
  const T = TX; if (!T.ready(el, ['dependency'])) return;
  el.replaceChildren();
  const d = T.rows('dependency').filter((r) => T.inRange(r.year)); const st = T.P().settle;
  const series = [...T.SETTLES, 'All'].filter((k) => d.some((r) => r.settlement === k)).map((k) => ({
    name: T.settleLabel(k), color: k === 'All' ? 'var(--color-fg-muted)' : T.settleColor(k), dash: k === 'All',
    faded: st !== 'All' && k !== st && k !== 'All', strong: k === st,
    points: d.filter((r) => r.settlement === k).sort((a, b) => a.year - b.year).map((r) => ({y: r.year, v: r.pt_per_100_car}))}));
  txLines(el, series, {fmt: (v) => (v == null ? '—' : d3.format('.1f')(v)), zero: true, points: true});
});

// ---- kilometres --------------------------------------------------------------------
dash.draw('sub-km', (el) => {
  const v = TX.P().kmview;
  TX.text(el, v === 'meas' ? 'Official series, each in its own unit: road vehicle-km, scheduled bus vehicle-km, rail passenger-km (billions)'
    : `Estimated person-km per year by mode${v === 'share' ? ', % share' : ' (billions)'} · NTA travel survey years`);
});
dash.draw('note-km', (el) => {
  const v = TX.P().kmview;
  TX.text(el, v === 'meas' ? 'Vehicle-km and passenger-km are different units, so each series has its own panel and scale.'
    : 'Estimate: adults × journeys per day × 365 × mode share × average journey length. It understates rail against the measured series because long rail trips fall in the open 8+ km band.');
});
dash.draw('km', (el) => {
  const T = TX; if (!T.ready(el, ['km_estimate', 'km_measured'])) return;
  el.replaceChildren();
  const view = T.P().kmview;
  if (view === 'meas') {
    const m = T.rows('km_measured').filter((r) => T.inRange(r.year));
    const panels = [...new Set(m.map((r) => r.series))];
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:var(--cds-gap-md)';
    el.append(wrap);
    for (const pn of panels) {
      const box = document.createElement('div'); box.className = 'tx-chart'; box.style.minHeight = '260px';
      const h = document.createElement('div'); h.className = 'tx-sub'; h.textContent = `${pn} · ${m.find((r) => r.series === pn).unit}`;
      const cell = document.createElement('div'); cell.append(h, box); wrap.append(cell);
      const rs = m.filter((r) => r.series === pn);
      const tot = [...d3.rollup(rs, (g) => d3.sum(g, (r) => r.value_bn), (r) => r.category)].sort((a, b) => b[1] - a[1]).map((d) => d[0]);
      const keep = tot.slice(0, 2);
      const cats = tot.length > 3 ? [...keep, 'All other'] : tot;
      const series = cats.map((c, i) => ({name: c, color: dash.colors[i],
        points: [...d3.rollup(rs.filter((r) => (c === 'All other' ? !keep.includes(r.category) : r.category === c)), (g) => d3.sum(g, (r) => r.value_bn), (r) => r.year)]
          .sort((a, b) => a[0] - b[0]).map(([y, v]) => ({y, v}))}));
      txLines(box, series, {fmt: (v) => (v == null ? '—' : d3.format('.2f')(v)), zero: true, H: 240});
    }
    return;
  }
  const k = T.rows('km_estimate').filter((r) => T.inRange(r.year));
  const ys = [...new Set(k.map((r) => r.year))].sort((a, b) => a - b);
  if (!ys.length) return;
  const keys = T.MODES.filter((g) => k.some((r) => r.mode_group === g));
  const wide = ys.map((y) => { const o = {year: y}; for (const g of keys) o[g] = d3.sum(k.filter((r) => r.year === y && r.mode_group === g), (r) => r.person_km_bn); return o; });
  if (view === 'share') wide.forEach((o) => { const t = d3.sum(keys, (g) => o[g]); keys.forEach((g) => { o[g] = o[g] / t * 100; }); });
  T.legend(el, keys.map((g) => [g, T.modeColor(g)]));
  const H = 320; const {s, w} = T.svg(el, H);
  const stack = d3.stack().keys(keys)(wide);
  const y = d3.scaleLinear([0, view === 'share' ? 100 : d3.max(stack[stack.length - 1], (d) => d[1]) * 1.12], [H - 30, 10]).nice();
  const fmtY = view === 'share' ? (v) => `${v}%` : (v) => `${v} bn`;
  const ml = T.textWidth(s, y.ticks(5).map(fmtY)) + 10;
  const x = d3.scaleBand(ys.map(String), [ml, w - 6]).padding(0.45);
  s.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - ml - 6))).call(T.grid);
  s.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(fmtY).tickSize(0)).call(T.styleAxis).select('.domain').remove();
  s.append('g').attr('transform', `translate(0,${H - 30})`).call(d3.axisBottom(x).tickSize(0)).call(T.styleAxis);
  const tp = T.tip(el);
  s.append('g').selectAll('g').data(stack).join('g').style('fill', (d) => T.modeColor(d.key))
    .selectAll('rect').data((d) => d.map((p) => ({key: d.key, p}))).join('rect')
    .attr('x', (o) => x(String(o.p.data.year))).attr('width', x.bandwidth()).attr('y', (o) => y(o.p[1])).attr('height', (o) => Math.max(0, y(o.p[0]) - y(o.p[1])))
    .style('stroke', 'var(--color-panel)').style('stroke-width', 1)
    .on('pointermove', (ev, o) => { const [mx, my] = d3.pointer(ev, el); tp.show(String(o.p.data.year), [{label: o.key, value: view === 'share' ? T.fmt.pct(o.p.data[o.key]) : `${T.fmt.n1(o.p.data[o.key])} bn person-km`, color: T.modeColor(o.key)}], mx, my); })
    .on('pointerleave', () => tp.hide());
  if (view !== 'share') {
    const kt = dash.data('km_totals');
    if (kt.status === 'ok') s.append('g').selectAll('text').data(kt.data.filter((r) => ys.includes(r.year))).join('text')
      .attr('x', (r) => x(String(r.year)) + x.bandwidth() / 2).attr('y', (r) => y(r.total_bn) - 6).attr('text-anchor', 'middle')
      .text((r) => `${T.fmt.n1(r.total_bn)} bn`).style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
  }
});

// ---- cars per 1,000 over time -------------------------------------------------------
function txCars() {
  const T = TX, a = T.rows('area_metrics'); if (!a) return null;
  const c = a.filter((r) => r.metric === 'Cars per 1,000 residents' && T.inRange(r.year));
  const g = T.geo(); let picks; const notes = [];
  if (g.level === 'National') {
    const reg = c.filter((r) => r.geo_level === 'Regional'); const ly = d3.max(reg, (r) => r.year);
    const order = reg.filter((r) => r.year === ly).sort((p, q) => p.value - q.value).map((r) => r.geography);
    picks = [...order.slice(0, 2), ...order.slice(-2)].map((n) => ['Regional', n]);
    notes.push('Showing the two lowest and two highest regions; pick an area to compare it with Ireland.');
  } else picks = [[g.level, g.name]];
  const series = [...picks.map(([l, n], i) => ({name: n, color: dash.colors[i === 0 && picks.length === 1 ? 1 : i + 1], strong: picks.length === 1,
    points: c.filter((r) => r.geo_level === l && r.geography === n).sort((p, q) => p.year - q.year).map((r) => ({y: r.year, v: r.value}))})),
  {name: 'Ireland', color: 'var(--color-fg)', dash: true,
    points: c.filter((r) => r.geo_level === 'National').sort((p, q) => p.year - q.year).map((r) => ({y: r.year, v: r.value}))}].filter((d) => d.points.length);
  return {series, notes};
}
dash.draw('note-cars', (el) => { const v = txCars(); if (!v) { el.textContent = '—'; return; } TX.text(el, [...v.notes, 'Population: CSO annual estimates; Census for 2011–2016 county years, interpolated between.'].join(' ')); });
dash.draw('carstrend', (el) => {
  const T = TX; if (!T.ready(el, ['area_metrics'])) return;
  el.replaceChildren();
  const v = txCars(); txLines(el, v.series, {fmt: (x) => (x == null ? '—' : d3.format(',.0f')(x)), H: 300});
});

// ---- PT services per 1,000 -------------------------------------------------------
dash.draw('supply', (el) => {
  const T = TX; if (!T.ready(el, ['pt_supply'])) return;
  el.replaceChildren();
  const p = T.P(), g = T.geo(), sp = T.rows('pt_supply');
  const modes = ['Bus', 'Rail / DART', 'Luas'].filter((m) => sp.some((r) => r.mode === m));
  const col = {Bus: dash.colors[0], 'Rail / DART': dash.colors[1], Luas: dash.colors[2]};
  let rs; let label;
  if (p.supview === 'Settlement') { rs = sp.filter((r) => r.geo_level === 'National' && r.settlement !== 'All'); label = (r) => T.settleLabel(r.settlement); }
  else { rs = sp.filter((r) => r.geo_level === p.supview && r.settlement === 'All'); label = (r) => r.geography; }
  const names = [...new Set(rs.map(label))];
  const tot = new Map(names.map((n) => [n, d3.sum(rs.filter((r) => label(r) === n), (r) => r.trips_per_1000)]));
  names.sort((a, b) => tot.get(b) - tot.get(a));
  T.legend(el, modes.map((m) => [m, col[m]]));
  const rowH = 24; const H = names.length * rowH + 34; const {s, w} = T.svg(el, H);
  const ml = T.textWidth(s, names) + 12;
  const x = d3.scaleLinear([0, d3.max([...tot.values()]) * 1.15], [ml, w - 8]).nice();
  const y = d3.scaleBand(names, [4, H - 28]).padding(0.25);
  s.append('g').attr('transform', `translate(0,${H - 28})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.floor((w - ml) / 70)))).call(T.styleAxis).select('.domain').remove();
  const hl = (n) => (p.supview === 'Settlement' ? T.settleLabel(p.settle) === n : n === g.name);
  s.append('g').selectAll('text').data(names).join('text').attr('x', ml - 6).attr('y', (n) => y(n) + y.bandwidth() / 2).attr('dy', '0.35em')
    .attr('text-anchor', 'end').text((n) => n).style('font-size', 'var(--cds-font-size-caption)')
    .style('fill', (n) => (hl(n) ? 'var(--color-fg)' : 'var(--color-fg-muted)')).style('font-weight', (n) => (hl(n) ? 600 : null));
  const tp = T.tip(el);
  for (const n of names) {
    let x0 = 0;
    for (const m of modes) {
      const r = rs.find((q) => label(q) === n && q.mode === m); if (!r) continue;
      s.append('rect').attr('x', x(x0)).attr('y', y(n)).attr('height', y.bandwidth()).attr('width', Math.max(0, x(x0 + r.trips_per_1000) - x(x0)))
        .style('fill', col[m]).style('stroke', 'var(--color-panel)').style('stroke-width', 1)
        .on('pointermove', (ev) => { const [mx, my] = d3.pointer(ev, el); tp.show(n, [{label: m, value: `${T.fmt.n1(r.trips_per_1000)} per 1,000`, color: col[m]}, {label: 'Weekday trips', value: T.fmt.n0(r.weekday_trips)}], mx, my); })
        .on('pointerleave', () => tp.hide());
      x0 += r.trips_per_1000;
    }
    s.append('text').attr('x', x(x0) + 4).attr('y', y(n) + y.bandwidth() / 2).attr('dy', '0.35em').text(T.fmt.n1(x0))
      .style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
  }
});

// ---- the gap: cars vs PT supply by county ----------------------------------------
function txGap() {
  const T = TX, a = T.rows('area_metrics'); if (!a) return null;
  const c = a.filter((r) => r.geo_level === 'County');
  const sup = c.filter((r) => r.metric === 'PT trips per 1,000 residents'); const sy = d3.max(sup, (r) => r.year);
  const cars = c.filter((r) => r.metric === 'Cars per 1,000 residents'); const cy = T.latest(cars);
  const pop = c.filter((r) => r.metric === 'Population'); const py = d3.max(pop.filter((r) => r.year <= cy), (r) => r.year);
  const pts = sup.filter((r) => r.year === sy).map((r) => ({name: r.geography, pt: r.value,
    cars: cars.find((q) => q.year === cy && q.geography === r.geography)?.value,
    pop: pop.find((q) => q.year === py && q.geography === r.geography)?.value})).filter((d) => d.cars != null);
  return {pts, sy, cy};
}
dash.draw('sub-gap', (el) => { const v = txGap(); if (!v) { el.textContent = '—'; return; } TX.text(el, `Counties · cars ${v.cy} · weekday timetable ${v.sy} · bubble size = population · dotted lines = medians · click a county to filter`); });
dash.draw('gap', (el) => {
  const T = TX; if (!T.ready(el, ['area_metrics'])) return;
  el.replaceChildren();
  const v = txGap(); if (!v.pts.length) return; const g = T.geo();
  const H = 420; const {s, w} = T.svg(el, H);
  const x = d3.scaleLinear(d3.extent(v.pts, (d) => d.cars), [56, w - 70]).nice();
  const y = d3.scaleLinear([0, d3.max(v.pts, (d) => d.pt) * 1.1], [H - 40, 14]).nice();
  const r = d3.scaleSqrt([0, d3.max(v.pts, (d) => d.pop)], [3, 26]);
  s.append('g').attr('transform', 'translate(56,0)').call(d3.axisLeft(y).ticks(5).tickSize(-(w - 126))).call(T.grid);
  s.append('g').attr('transform', 'translate(56,0)').call(d3.axisLeft(y).ticks(5).tickSize(0)).call(T.styleAxis).select('.domain').remove();
  s.append('g').attr('transform', `translate(0,${H - 40})`).call(d3.axisBottom(x).ticks(6)).call(T.styleAxis);
  s.append('text').attr('x', w - 70).attr('y', H - 6).attr('text-anchor', 'end').text('Private cars per 1,000 residents').style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
  s.append('text').attr('x', 60).attr('y', 10).text('Weekday PT trips per 1,000 residents').style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
  const mx = d3.median(v.pts, (d) => d.cars), my = d3.median(v.pts, (d) => d.pt);
  s.append('line').attr('x1', x(mx)).attr('x2', x(mx)).attr('y1', 14).attr('y2', H - 40).style('stroke', 'var(--cds-chart-reference)').style('stroke-dasharray', '3 3');
  s.append('line').attr('x1', 56).attr('x2', w - 70).attr('y1', y(my)).attr('y2', y(my)).style('stroke', 'var(--cds-chart-reference)').style('stroke-dasharray', '3 3');
  s.append('text').attr('x', w - 70).attr('y', H - 46).attr('text-anchor', 'end').text('car-dependent, low PT supply').style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
  const tp = T.tip(el);
  const sel = (d) => g.level === 'County' && d.name === g.name;
  s.append('g').selectAll('circle').data([...v.pts].sort((a, b) => b.pop - a.pop)).join('circle')
    .attr('cx', (d) => x(d.cars)).attr('cy', (d) => y(d.pt)).attr('r', (d) => r(d.pop || 0))
    .style('fill', (d) => (sel(d) ? dash.colors[1] : dash.colors[0])).style('fill-opacity', 0.75).style('stroke', (d) => (sel(d) ? 'var(--color-fg)' : 'var(--color-panel)')).style('stroke-width', (d) => (sel(d) ? 2 : 1)).style('cursor', 'pointer')
    .on('pointermove', (ev, d) => { const [px, py] = d3.pointer(ev, el); tp.show(d.name, [{label: 'Cars per 1,000', value: T.fmt.n0(d.cars)}, {label: 'PT trips per 1,000', value: T.fmt.n1(d.pt)}, {label: 'Population', value: T.fmt.n0(d.pop)}], px, py); })
    .on('pointerleave', () => tp.hide())
    .on('click', (ev, d) => dash.setParams({geo: `County|${d.name}`}));
  // labels, skipping ones that would overlap
  const placed = [];
  const lab = [...v.pts].sort((a, b) => (sel(b) - sel(a)) || (b.pop - a.pop));
  for (const d of lab) {
    const lx = x(d.cars), ly = y(d.pt) - r(d.pop || 0) - 4;
    if (placed.some((p) => Math.abs(p[0] - lx) < 46 && Math.abs(p[1] - ly) < 12)) continue;
    placed.push([lx, ly]);
    s.append('text').attr('x', lx).attr('y', ly).attr('text-anchor', 'middle').text(d.name).style('pointer-events', 'none')
      .style('font-size', 'var(--cds-font-size-caption)').style('fill', sel(d) ? 'var(--color-fg)' : 'var(--color-fg-muted)').style('font-weight', sel(d) ? 600 : null);
  }
});
