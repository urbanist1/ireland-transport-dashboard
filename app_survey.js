// ---------------------------------------------------------------------------
// Voice of the passenger · Urban vs rural · Cars, services & kilometres
// ---------------------------------------------------------------------------
// Horizontal bar chart helper: items [{label, value, color?}], optional dots [{label, value}]
function txHBars(el, items, opts) {
  const T = TX; const rowH = opts.rowH || 26;
  const H = items.length * rowH + 34;
  const {s, w} = T.svg(el, H);
  const ml = Math.min(w * 0.48, T.textWidth(s, items.map((d) => d.label)) + 10);
  const xMax = d3.max(items.concat(opts.dots || []), (d) => d.value) * 1.12 || 1;
  const x = d3.scaleLinear([0, xMax], [ml, w - 10]).nice();
  const y = d3.scaleBand(items.map((d) => d.label), [6, H - 28]).padding(0.28);
  s.append('g').attr('transform', `translate(0,${H - 28})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.floor((w - ml) / 80))).tickFormat(opts.tick)).call(T.styleAxis).select('.domain').remove();
  s.append('g').selectAll('text').data(items).join('text').attr('x', ml - 6).attr('y', (d) => y(d.label) + y.bandwidth() / 2)
    .attr('dy', '0.35em').attr('text-anchor', 'end').text((d) => d.label)
    .style('font-size', 'var(--cds-font-size-caption)').style('fill', (d) => (d.strong ? 'var(--color-fg)' : 'var(--color-fg-muted)'))
    .style('font-weight', (d) => (d.strong ? 600 : null));
  const tp = T.tip(el);
  s.append('g').selectAll('rect').data(items).join('rect').attr('x', ml).attr('y', (d) => y(d.label))
    .attr('height', y.bandwidth()).attr('width', (d) => Math.max(0, x(d.value) - ml)).attr('rx', 2)
    .style('fill', (d) => d.color || dash.colors[0])
    .on('pointermove', (ev, d) => { const [mx, my] = d3.pointer(ev, el); tp.show(d.label, [{label: opts.name, value: opts.fmt(d.value)}].concat(d.extra || []), mx, my); })
    .on('pointerleave', () => tp.hide());
  s.append('g').selectAll('text').data(items).join('text').attr('x', (d) => x(d.value) + 4).attr('y', (d) => y(d.label) + y.bandwidth() / 2)
    .attr('dy', '0.35em').text((d) => opts.fmt(d.value)).style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
  if (opts.dots) {
    s.append('g').selectAll('path').data(opts.dots.filter((d) => y(d.label) != null)).join('path')
      .attr('d', d3.symbol(d3.symbolDiamond, 70)).attr('transform', (d) => `translate(${x(d.value)},${y(d.label) + y.bandwidth() / 2})`)
      .style('fill', dash.colors[1]).style('stroke', 'var(--color-panel)').style('stroke-width', 1.5);
  }
  return {s, w, H};
}

// ---- what would encourage more PT use -------------------------------------------
function txEnc() {
  const e = TX.rows('encourage'); if (!e) return null;
  const y = TX.latest(e); return {year: y, rows: e.filter((r) => r.year === y)};
}
dash.draw('encage', (sel) => {
  const v = txEnc(); if (!v) { sel.replaceChildren(); return; }
  const ages = [...new Set(v.rows.map((r) => r.age_group))].filter((a) => a !== 'All adults').sort();
  sel.replaceChildren(new Option('None', ''), ...ages.map((a) => new Option(a, a)));
  sel.value = TX.P().encage; sel.onchange = () => dash.setParams({encage: sel.value || null});
});
dash.draw('sub-enc', (el) => {
  const v = txEnc(); if (!v) { el.textContent = '—'; return; }
  const none = v.rows.find((r) => r.age_group === 'All adults' && /^none/i.test(r.factor));
  const parts = [`NTA travel survey ${v.year} · % of adults citing each factor`];
  if (none) TX.text(el, ...parts, ' · ', TX.mark('span', 'encourage', 'pct', {year: none.year, age_group: 'All adults', factor: none.factor}, TX.fmt.pct0(none.pct)), ' said none of these');
  else TX.text(el, ...parts);
});
dash.draw('enc', (el) => {
  const T = TX; if (!T.ready(el, ['encourage'])) return;
  el.replaceChildren();
  const v = txEnc(); const age = T.P().encage;
  const all = v.rows.filter((r) => r.age_group === 'All adults' && !/^none/i.test(r.factor)).sort((a, b) => b.pct - a.pct);
  const items = all.map((r) => ({label: r.factor, value: r.pct}));
  const dots = age ? v.rows.filter((r) => r.age_group === age && !/^none/i.test(r.factor)).map((r) => ({label: r.factor, value: r.pct})) : null;
  if (dots) T.legend(el, [['All adults', dash.colors[0]], [age, dash.colors[1]]]);
  txHBars(el, items, {name: 'All adults', fmt: T.fmt.pct0, tick: (x) => `${x}%`, dots});
});

// ---- barriers heatmap ------------------------------------------------------------
function txBar() {
  const b = TX.rows('barriers'); if (!b) return null;
  const qs = [...new Set(b.map((r) => r.question))].sort((a, c) => (a.startsWith('Reasons') === c.startsWith('Reasons') ? a.localeCompare(c) : a.startsWith('Reasons') ? -1 : 1));
  const q = qs.includes(TX.P().question) ? TX.P().question : qs[0];
  const rq = b.filter((r) => r.question === q); const y = TX.latest(rq);
  return {qs, q, year: y, rows: rq.filter((r) => r.year === y), by: rq[0]?.compare_by};
}
dash.draw('question', (sel) => {
  const v = txBar(); if (!v) { sel.replaceChildren(); return; }
  sel.replaceChildren(...v.qs.map((q) => new Option(q, q)));
  sel.value = v.q; sel.onchange = () => dash.setParams({question: sel.value});
});
dash.draw('sub-bar', (el) => {
  const v = txBar(); if (!v) { el.textContent = '—'; return; }
  TX.text(el, `NTA travel survey ${v.year} · % citing each reason · by ${String(v.by).toLowerCase()}${TX.P().barindex ? ' · 100 = the reason’s average across groups' : ''}`);
});
dash.draw('barriers', (el) => {
  const T = TX; if (!T.ready(el, ['barriers'])) return;
  el.replaceChildren();
  const v = txBar(); const idx = T.P().barindex;
  let segs = [...new Set(v.rows.map((r) => r.segment))];
  if (v.by === 'Settlement type') segs = T.SETTLES.filter((x) => segs.includes(x));
  else segs.sort();
  const reasons = [...d3.rollup(v.rows, (g) => d3.mean(g, (r) => r.pct), (r) => r.reason)].sort((a, b) => b[1] - a[1]).map((d) => d[0]);
  const mean = new Map(d3.rollup(v.rows, (g) => d3.mean(g, (r) => r.pct), (r) => r.reason));
  const cell = (r) => (idx ? r.pct / mean.get(r.reason) * 100 : r.pct);
  const rowH = 30; const H = reasons.length * rowH + 50;
  const {s, w} = T.svg(el, H);
  const ml = Math.min(w * 0.42, T.textWidth(s, reasons) + 10);
  // long reasons are shortened to fit; the full text shows on hover
  const fit = (str) => { if (T.textWidth(s, [str]) <= ml - 10) return str; let t = str;
    while (t.length > 4 && T.textWidth(s, [`${t}…`]) > ml - 10) t = t.slice(0, -1); return `${t.trimEnd()}…`; };
  const head = (d) => T.settleLabel(d).replace(/\s*-\s*/, '–').replace(/ years?/, '').replace(/ and over/, '+');
  const x = d3.scaleBand(segs, [ml, w - 4]).padding(0.04);
  const y = d3.scaleBand(reasons, [40, H - 4]).padding(0.06);
  const vals = v.rows.map(cell);
  const color = idx
    ? d3.scaleDiverging([d3.min(vals), 100, d3.max(vals)], (t) => d3.interpolateRdBu(1 - t))
    : d3.scaleSequential([0, d3.max(vals)], (t) => d3.interpolateBlues(0.08 + 0.85 * t));
  s.append('g').selectAll('text').data(segs).join('text').attr('x', (d) => x(d) + x.bandwidth() / 2).attr('y', 30)
    .attr('text-anchor', 'middle').text(head).style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
  s.append('g').selectAll('text').data(reasons).join('text').attr('x', ml - 6).attr('y', (d) => y(d) + y.bandwidth() / 2).attr('dy', '0.35em')
    .attr('text-anchor', 'end').text(fit).style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)')
    .append('title').text((d) => d);
  const tp = T.tip(el);
  const cells = s.append('g').selectAll('g').data(v.rows).join('g').attr('transform', (r) => `translate(${x(r.segment)},${y(r.reason)})`);
  cells.append('rect').attr('width', x.bandwidth()).attr('height', y.bandwidth()).attr('rx', 2).style('fill', (r) => color(cell(r)))
    .on('pointermove', (ev, r) => { const [mx, my] = d3.pointer(ev, el); tp.show(r.reason, [{label: T.settleLabel(r.segment), value: T.fmt.pct(r.pct)}].concat(idx ? [{label: 'Index', value: T.fmt.n0(cell(r))}] : []), mx, my); })
    .on('pointerleave', () => tp.hide());
  if (x.bandwidth() > 26) cells.append('text').attr('x', x.bandwidth() / 2).attr('y', y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'middle')
    .text((r) => T.fmt.n0(cell(r))).style('font-size', 'var(--cds-font-size-caption)').style('pointer-events', 'none')
    .style('fill', (r) => (idx ? 'var(--color-fg)' : (color(cell(r)) && d3.hsl(color(cell(r))).l < 0.55 ? '#fff' : 'var(--color-fg)')));
});

// ---- journey purpose ------------------------------------------------------------
function txPur() {
  const T = TX, p = T.rows('purpose'); if (!p) return null;
  let st = T.P().settle; const notes = [];
  let r = p.filter((x) => x.settlement === st);
  if (!r.length) { r = p.filter((x) => x.settlement === 'All'); if (st !== 'All') notes.push('No purpose split for this settlement type; showing all areas.'); st = 'All'; }
  const y = T.latest(r);
  return {year: y, settle: st, rows: r.filter((x) => x.year === y), notes};
}
dash.draw('sub-pur', (el) => {
  const v = txPur(); if (!v) { el.textContent = '—'; return; }
  TX.text(el, `NTA travel survey ${v.year} · share of journeys · ${TX.settleLabel(v.settle).toLowerCase()}`);
});
dash.draw('note-pur', (el) => {
  const v = txPur(); if (!v) { el.textContent = '—'; return; }
  TX.text(el, [...v.notes, 'Settlement splits exist for 2014–2019 survey waves; later waves are national.'].join(' '));
});
dash.draw('purpose', (el) => {
  const T = TX; if (!T.ready(el, ['purpose'])) return;
  el.replaceChildren();
  const v = txPur();
  const order = ['Commute', 'Education', 'Leisure', 'Shopping', 'Personal business & other'];
  const rows = order.map((o) => v.rows.find((r) => r.purpose === o)).filter(Boolean);
  const col = (k) => (k === 'Personal business & other' ? 'var(--cds-chart-muted)' : dash.colors[order.indexOf(k)]);
  T.legend(el, rows.map((r) => [r.purpose, col(r.purpose)]));
  const H = 290; const {s, w} = T.svg(el, H);
  const R = Math.min(w, H) / 2 - 8;
  const g = s.append('g').attr('transform', `translate(${w / 2},${H / 2})`);
  const arcs = d3.pie().sort(null).value((r) => r.share_pct)(rows);
  const arc = d3.arc().innerRadius(R * 0.6).outerRadius(R).padAngle(0.01).cornerRadius(2);
  const tp = T.tip(el);
  g.selectAll('path').data(arcs).join('path').attr('d', arc).style('fill', (a) => col(a.data.purpose))
    .on('pointermove', (ev, a) => { const [mx, my] = d3.pointer(ev, el); tp.show(a.data.purpose, [{label: 'Share of journeys', value: T.fmt.pct(a.data.share_pct)}], mx, my); })
    .on('pointerleave', () => tp.hide());
  g.selectAll('text.lbl').data(arcs.filter((a) => a.endAngle - a.startAngle > 0.3)).join('text').attr('class', 'lbl')
    .attr('transform', (a) => `translate(${arc.centroid(a)})`).attr('text-anchor', 'middle').attr('dy', '0.35em')
    .text((a) => T.fmt.pct0(a.data.share_pct)).style('font-size', 'var(--cds-font-size-caption)').style('fill', '#fff').style('pointer-events', 'none');
  const c = rows.find((r) => r.purpose === 'Commute');
  if (c) {
    g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.1em').text(T.fmt.pct0(c.share_pct))
      .style('font-family', 'var(--font-anthropic-serif)').style('font-size', 'var(--cds-font-size-title)').style('fill', 'var(--color-fg)');
    g.append('text').attr('text-anchor', 'middle').attr('dy', '1.4em').text('commuting').style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
  }
});

// ---- towns: commute time vs size -----------------------------------------------
function txTowns() {
  const T = TX, t = T.rows('towns'); if (!t) return null;
  const g = T.geo(), st = T.P().settle; const notes = [];
  let r = t;
  if (g.level === 'County') r = t.filter((x) => x.county === g.name);
  if (g.level === 'Regional') r = t.filter((x) => x.region === g.name);
  if (!r.length) { r = t; notes.push(`No Census towns listed for ${g.name}; showing all towns.`); }
  if (st !== 'All') r = r.filter((x) => x.settlement === st);
  return {rows: r, notes};
}
dash.draw('note-towns', (el) => {
  const v = txTowns(); if (!v) { el.textContent = '—'; return; }
  TX.text(el, [...v.notes, 'Cities and suburbs are highly urban; towns of 5,000 or more are urban. The CSO counts every town of 1,500+ as urban, so the 5,000 line is this dashboard’s choice.'].join(' '));
});
dash.draw('towns', (el) => {
  const T = TX; if (!T.ready(el, ['towns'])) return;
  el.replaceChildren();
  const v = txTowns(); if (!v.rows.length) return;
  T.legend(el, T.SETTLES.filter((sx) => v.rows.some((r) => r.settlement === sx)).map((sx) => [T.settleLabel(sx), T.settleColor(sx)]));
  const H = 420; const {s, w} = T.svg(el, H);
  const all = T.rows('towns');
  const x = d3.scaleLog(d3.extent(all, (r) => r.population), [56, w - 16]).nice();
  const y = d3.scaleLinear(d3.extent(all, (r) => r.avg_commute_min), [H - 40, 12]).nice();
  const rr = d3.scaleSqrt([0, d3.max(all, (r) => r.population)], [2.5, 30]);
  s.append('g').attr('transform', 'translate(56,0)').call(d3.axisLeft(y).ticks(5).tickSize(-(w - 72))).call(T.grid);
  s.append('g').attr('transform', 'translate(56,0)').call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${d} min`).tickSize(0)).call(T.styleAxis).select('.domain').remove();
  s.append('g').attr('transform', `translate(0,${H - 40})`).call(d3.axisBottom(x).ticks(5, ',.0f')).call(T.styleAxis);
  s.append('text').attr('x', w - 16).attr('y', H - 6).attr('text-anchor', 'end').text('Town population (log scale)')
    .style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
  const tp = T.tip(el);
  s.append('g').selectAll('circle').data([...v.rows].sort((a, b) => b.population - a.population)).join('circle')
    .attr('cx', (r) => x(r.population)).attr('cy', (r) => y(r.avg_commute_min)).attr('r', (r) => rr(r.population))
    .style('fill', (r) => T.settleColor(r.settlement)).style('fill-opacity', 0.75).style('stroke', 'var(--color-panel)').style('stroke-width', 1)
    .on('pointermove', (ev, r) => { const [mx, my] = d3.pointer(ev, el); tp.show(r.town, [{label: 'Average journey', value: `${T.fmt.n1(r.avg_commute_min)} min`}, {label: 'Population', value: T.fmt.n0(r.population)}, {label: 'Class', value: T.settleLabel(r.settlement)}], mx, my); })
    .on('pointerleave', () => tp.hide());
});

// ---- car ownership per household --------------------------------------------------
function txOwn() { const o = TX.rows('car_ownership'); if (!o) return null; const y = TX.latest(o); return {year: y, rows: o.filter((r) => r.year === y)}; }
dash.draw('sub-own', (el) => { const v = txOwn(); if (!v) { el.textContent = '—'; return; } TX.text(el, `Census ${v.year} · % of households by cars available`); });
dash.draw('own', (el) => {
  const T = TX; if (!T.ready(el, ['car_ownership'])) return;
  el.replaceChildren();
  const v = txOwn(); const cars = ['0', '1', '2', '3+']; const grp = ['Urban', 'Rural'];
  const col = {Urban: dash.colors[0], Rural: dash.colors[4]};
  T.legend(el, grp.map((g) => [g, col[g]]));
  const H = 300; const {s, w} = T.svg(el, H);
  const y = d3.scaleLinear([0, d3.max(v.rows, (r) => r.share_pct) * 1.15], [H - 34, 8]).nice();
  const x0 = d3.scaleBand(cars, [44, w - 6]).paddingInner(0.25); const x1 = d3.scaleBand(grp, [0, x0.bandwidth()]).padding(0.06);
  s.append('g').attr('transform', 'translate(44,0)').call(d3.axisLeft(y).ticks(5).tickSize(-(w - 50))).call(T.grid);
  s.append('g').attr('transform', 'translate(44,0)').call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${d}%`).tickSize(0)).call(T.styleAxis).select('.domain').remove();
  s.append('g').attr('transform', `translate(0,${H - 34})`).call(d3.axisBottom(x0).tickFormat((c) => `${c} car${c === '1' ? '' : 's'}`).tickSize(0)).call(T.styleAxis);
  const tp = T.tip(el);
  const gg = s.append('g').selectAll('g').data(v.rows).join('g').attr('transform', (r) => `translate(${x0(String(r.cars))},0)`);
  gg.append('rect').attr('x', (r) => x1(r.urban_rural)).attr('width', x1.bandwidth()).attr('y', (r) => y(r.share_pct)).attr('height', (r) => y(0) - y(r.share_pct)).attr('rx', 2)
    .style('fill', (r) => col[r.urban_rural])
    .on('pointermove', (ev, r) => { const [mx, my] = d3.pointer(ev, el); tp.show(`${r.cars} car(s)`, [{label: r.urban_rural, value: T.fmt.pct(r.share_pct), color: col[r.urban_rural]}, {label: 'Households', value: T.fmt.n0(r.households)}], mx, my); })
    .on('pointerleave', () => tp.hide());
  if (x1.bandwidth() > 22) gg.append('text').attr('x', (r) => x1(r.urban_rural) + x1.bandwidth() / 2).attr('y', (r) => y(r.share_pct) - 4).attr('text-anchor', 'middle')
    .text((r) => T.fmt.pct0(r.share_pct)).style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
});

