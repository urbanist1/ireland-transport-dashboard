// ---------------------------------------------------------------------------
// Shared helpers, filters, headline figures and tabs.
// Filters live in dash.params(); every drawing reads them, nothing is fetched.
// ---------------------------------------------------------------------------
window.TX = (() => {
  const NUMS = new Set(['year', 'value', 'share_pct', 'departure_rank', 'share_of_mode_pct', 'trips_per_1000',
    'weekday_trips', 'person_km_bn', 'avg_journey_km', 'value_bn', 'pct', 'households', 'pt_per_100_car',
    'population', 'avg_commute_min']);
  const cache = new WeakMap();
  const MODES = ['Public transport', 'Private car', 'Active travel', 'Other'];
  const SETTLES = ['Highly Urban', 'Urban', 'Rural'];

  // Rows of a dataset with numeric columns converted (CSV cells arrive as text).
  function rows(id) {
    const d = dash.data(id);
    if (d.status !== 'ok' || !Array.isArray(d.data)) return null;
    if (cache.has(d.data)) return cache.get(d.data);
    const out = d.data.map((r) => {
      const o = {...r};
      for (const k in o) if (NUMS.has(k) && o[k] !== '' && o[k] != null) o[k] = Number(o[k]);
      return o;
    });
    cache.set(d.data, out);
    return out;
  }
  const status = (ids) => {
    const st = ids.map((i) => dash.data(i).status);
    if (st.some((s) => s === 'error' || s === 'connect' || s === 'declined' || s === 'missing')) return 'error';
    return st.every((s) => s === 'ok') ? 'ok' : 'loading';
  };
  // Prepare a chart box: returns true when every dataset is ready.
  function ready(el, ids) {
    const s = status(ids);
    if (s === 'ok') { el.classList.remove('dash-skeleton'); return true; }
    el.replaceChildren();
    if (s === 'error') {
      el.classList.remove('dash-skeleton');
      const f = document.createElement('div'); f.className = 'tx-fail';
      f.append(document.createElement('i'), document.createTextNode('Failed to load'));
      el.append(f);
    } else el.classList.add('dash-skeleton');
    return false;
  }
  const P = () => {
    const p = dash.params();
    return {
      geo: p.geo || 'National|Ireland', settle: p.settle || 'All', series: p.series || 'Census commuters',
      share: !!p.share, mapmetric: p.mapmetric || 'PT share of commuters (%)', maplevel: p.maplevel || 'County',
      peaknorm: p.peaknorm !== false, barindex: !!p.barindex, kmview: p.kmview || 'est',
      supview: p.supview || 'Regional', encage: p.encage || '', question: p.question || '',
      from: p.from == null ? null : Number(p.from), to: p.to == null ? null : Number(p.to),
    };
  };
  const geo = () => { const [level, name] = P().geo.split('|'); return {level, name}; };
  // Year range: params, else the span of the loaded data.
  function years() {
    const p = P(); const m = rows('modal') || []; const a = rows('area_metrics') || [];
    const all = m.map((r) => r.year).concat(a.filter((r) => r.metric !== 'Population').map((r) => r.year));
    const lo = all.length ? d3.min(all) : 1986, hi = all.length ? d3.max(all) : 2025;
    let from = p.from ?? lo, to = p.to ?? hi;
    if (from > to) [from, to] = [to, from];
    return {from, to, lo, hi};
  }
  const inRange = (y) => { const r = years(); return y >= r.from && y <= r.to; };
  // Latest year <= the To year, else the latest year there is.
  function latest(rs) {
    if (!rs || !rs.length) return null;
    const r = years(); const ok = rs.filter((x) => x.year <= r.to);
    return d3.max(ok.length ? ok : rs, (x) => x.year);
  }
  const enc = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
  const where = (o) => Object.entries(o).map(([k, v]) => `${k}=${enc(v)}`).join('&');
  // A marked value element: shows `text`, cites one cell of a dataset.
  function mark(tag, source, field, w, text) {
    const e = document.createElement(tag);
    e.dataset.source = source; e.dataset.field = field; e.dataset.where = where(w);
    e.textContent = text; return e;
  }
  const fmt = {
    pct: (v) => (v == null || isNaN(v) ? '—' : `${d3.format('.1f')(v)}%`),
    pct0: (v) => (v == null || isNaN(v) ? '—' : `${d3.format('.0f')(v)}%`),
    n0: (v) => (v == null || isNaN(v) ? '—' : d3.format(',.0f')(v)),
    n1: (v) => (v == null || isNaN(v) ? '—' : d3.format(',.1f')(v)),
    big: (v) => (v == null || isNaN(v) ? '—' : new Intl.NumberFormat('en', {notation: 'compact', maximumFractionDigits: 2}).format(v)),
  };
  const modeColor = (g) => ({ 'Public transport': dash.colors[0], 'Private car': dash.colors[1],
    'Active travel': dash.colors[2] }[g] || 'var(--cds-chart-muted)');
  const settleColor = (s) => ({ 'Highly Urban': dash.colors[0], Urban: dash.colors[3], Rural: dash.colors[4] }[s]
    || 'var(--cds-chart-muted)');
  const settleLabel = (s) => ({ 'Highly Urban': 'Highly urban', Urban: 'Urban', Rural: 'Rural', All: 'All areas' }[s] || s);

  // Tooltip inside a chart box (position: relative). lines: [{label, value, color?}]
  function tip(box) {
    let t = box.querySelector(':scope > .tx-tip');
    if (!t) { t = document.createElement('div'); t.className = 'tx-tip'; t.hidden = true; box.append(t); }
    return {
      show(head, lines, x, y) {
        t.replaceChildren();
        const h = document.createElement('div'); h.className = 'h'; h.textContent = head; t.append(h);
        for (const l of lines) {
          const d = document.createElement('div');
          if (l.color) { const s = document.createElement('span'); s.className = 'sw'; s.style.background = l.color; d.append(s); }
          d.append(document.createTextNode(`${l.label}${l.label ? ': ' : ''}${l.value}`)); t.append(d);
        }
        t.hidden = false;
        const bw = box.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
        t.style.left = `${Math.max(0, Math.min(bw - tw, x + 12))}px`;
        t.style.top = `${Math.max(0, y - th - 8)}px`;
      },
      hide() { t.hidden = true; },
    };
  }
  // An <svg> filling the box width.
  function svg(el, height) {
    const w = Math.max(280, el.clientWidth || 600);
    const s = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${height}`)
      .attr('height', height).attr('role', 'img');
    return {s, w, h: height};
  }
  const styleAxis = (g) => {
    g.attr('font-size', null).attr('font-family', null);
    g.selectAll('text').style('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)');
    g.selectAll('line').style('stroke', 'var(--cds-chart-axis)');
    g.select('.domain').style('stroke', 'var(--cds-chart-axis)');
    return g;
  };
  const grid = (g) => { g.selectAll('line').style('stroke', 'var(--cds-chart-grid)'); g.select('.domain').remove(); g.selectAll('text').remove(); };
  // Text width for margins.
  function textWidth(svgSel, strings) {
    const t = svgSel.append('text').style('font-size', 'var(--cds-font-size-caption)');
    let w = 0; for (const s of strings) { t.text(s); w = Math.max(w, t.node().getComputedTextLength()); }
    t.remove(); return w;
  }
  function legend(el, items) {
    const l = document.createElement('div'); l.className = 'tx-legend';
    for (const [name, color] of items) { const s = document.createElement('span'); s.style.setProperty('--sw', color); s.textContent = name; l.append(s); }
    el.append(l); return l;
  }
  function text(el, ...parts) {
    el.replaceChildren(...parts.map((p) => (typeof p === 'string' ? document.createTextNode(p) : p)));
  }
  const b = (node) => { const x = document.createElement('b'); x.append(node); return x; };
  return {rows, status, ready, P, geo, years, inRange, latest, mark, where, fmt, modeColor, settleColor, settleLabel,
    tip, svg, styleAxis, grid, textWidth, legend, text, b, MODES, SETTLES};
})();

// ---- calculated totals (person-km by year, from the estimate rows)
dash.calc('km_totals', {
  inputs: ['km_estimate'],
  title: 'Person-km totals by year',
  description: 'Estimated person-km summed over modes per survey year, with the private car and public transport shares.',
  fn: (km_estimate) => {
    const by = {};
    for (const r of km_estimate) {
      const y = Number(r.year), v = Number(r.person_km_bn);
      by[y] = by[y] || {year: y, total_bn: 0, car_bn: 0, pt_bn: 0};
      by[y].total_bn += v;
      if (r.mode_group === 'Private car') by[y].car_bn += v;
      if (r.mode_group === 'Public transport') by[y].pt_bn += v;
    }
    return Object.values(by).map((o) => ({year: o.year, total_bn: +o.total_bn.toFixed(2),
      car_share_pct: +(o.car_bn / o.total_bn * 100).toFixed(1), pt_share_pct: +(o.pt_bn / o.total_bn * 100).toFixed(1)}));
  },
});

// ---- year selects (choices come from the data)
for (const [name, key] of [['yfrom', 'from'], ['yto', 'to']]) {
  dash.draw(name, (sel) => {
    const T = TX; const m = T.rows('modal'), a = T.rows('area_metrics');
    if (!m || !a) { sel.replaceChildren(); return; }
    const ys = [...new Set(m.map((r) => r.year).concat(a.filter((r) => r.metric !== 'Population').map((r) => r.year)))].sort((x, y) => x - y);
    sel.replaceChildren(...ys.map((y) => new Option(String(y), String(y))));
    const r = T.years(); sel.value = String(key === 'from' ? r.from : r.to);
    sel.onchange = () => dash.setParams({[key]: Number(sel.value)});
  });
}

// ---- area select: Ireland, regions, counties
dash.draw('geo', (sel) => {
  const a = TX.rows('area_metrics');
  if (!a) { sel.replaceChildren(); return; }
  const opts = [new Option('Ireland (national)', 'National|Ireland')];
  for (const [lvl, label] of [['Regional', 'Regions (NUTS3)'], ['County', 'Counties']]) {
    const g = document.createElement('optgroup'); g.label = label;
    const names = [...new Set(a.filter((r) => r.geo_level === lvl).map((r) => r.geography))].sort();
    names.forEach((n) => g.append(new Option(n, `${lvl}|${n}`)));
    opts.push(g);
  }
  sel.replaceChildren(...opts);
  sel.value = TX.P().geo;
  sel.onchange = () => dash.setParams({geo: sel.value});
});

// ---- static controls: listen, and show the current params
const txBind = (selector, key, isCheck) => {
  document.querySelectorAll(selector).forEach((c) => c.addEventListener('change', () => dash.setParams({[key]: isCheck ? c.checked : c.value})));
};
txBind('.tx-settle', 'settle'); txBind('.tx-series', 'series'); txBind('.tx-share', 'share', true);
txBind('.tx-mapmetric', 'mapmetric'); txBind('.tx-maplevel', 'maplevel'); txBind('.tx-peaknorm', 'peaknorm', true);
txBind('.tx-barindex', 'barindex', true); txBind('.tx-kmview', 'kmview'); txBind('.tx-supview', 'supview');
document.querySelectorAll('.tx-reset').forEach((b) => b.addEventListener('click', () => dash.resetParams()));
dash.onData(() => {
  const p = TX.P();
  const setV = (s, v) => document.querySelectorAll(s).forEach((c) => { c.value = v; });
  const setC = (s, v) => document.querySelectorAll(s).forEach((c) => { c.checked = v; });
  setV('.tx-settle', p.settle); setV('.tx-series', p.series); setC('.tx-share', p.share);
  setV('.tx-mapmetric', p.mapmetric); setV('.tx-maplevel', p.maplevel); setC('.tx-peaknorm', p.peaknorm);
  setC('.tx-barindex', p.barindex); setV('.tx-kmview', p.kmview); setV('.tx-supview', p.supview);
  document.querySelectorAll('.tx-share').forEach((c) => { c.disabled = p.series !== 'Census commuters'; });
});

// ---- tabs (sections are hidden, so their drawings and data wait until shown)
const txShow = (id) => {
  document.querySelectorAll('.tx-page').forEach((s) => { s.hidden = s.dataset.page !== id; });
  document.querySelectorAll('.tx-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
};
document.querySelectorAll('.tx-tab').forEach((t) => t.addEventListener('click', () => { txShow(t.dataset.tab); dash.setLink(t.dataset.tab); }));
{
  const h = location.hash.slice(1);
  const page = document.getElementById(h)?.closest('.tx-page');
  if (page) { txShow(page.dataset.page); if (h !== page.id) document.getElementById(h).scrollIntoView(); }
}

// ---- headline figures --------------------------------------------------------
function txAreaName() { const g = TX.geo(); return g.name; }
function txAreaRow(rs, metric) {
  // rows of area_metrics for the metric at the chosen area (fallback Ireland)
  const g = TX.geo();
  let r = rs.filter((x) => x.metric === metric && x.geo_level === g.level && x.geography === g.name);
  let used = g;
  if (!r.length) { r = rs.filter((x) => x.metric === metric && x.geo_level === 'National'); used = {level: 'National', name: 'Ireland'}; }
  const y = TX.latest(r);
  return {row: r.find((x) => x.year === y), used};
}

dash.draw('k-pt', (el) => {
  const m = TX.rows('modal'); if (!m) { el.textContent = '—'; return; }
  const g = TX.geo();
  let r = m.filter((x) => x.series === 'Census commuters' && x.settlement === 'All' && x.mode_group === 'Public transport'
    && x.geo_level === g.level && x.geography === g.name);
  if (!r.length) r = m.filter((x) => x.series === 'Census commuters' && x.settlement === 'All' && x.mode_group === 'Public transport' && x.geo_level === 'National');
  const y = TX.latest(r); const row = r.find((x) => x.year === y);
  if (!row) { el.textContent = '—'; return; }
  TX.text(el, TX.mark('span', 'modal', 'share_pct', {series: row.series, year: row.year, geo_level: row.geo_level,
    geography: row.geography, settlement: 'All', mode_group: 'Public transport'}, TX.fmt.pct(row.share_pct)));
});
dash.draw('k-pt-s', (el) => {
  const m = TX.rows('modal'); if (!m) { el.textContent = '—'; return; }
  const g = TX.geo();
  let r = m.filter((x) => x.series === 'Census commuters' && x.settlement === 'All' && x.mode_group === 'Public transport'
    && x.geo_level === g.level && x.geography === g.name);
  if (!r.length) r = m.filter((x) => x.series === 'Census commuters' && x.settlement === 'All' && x.mode_group === 'Public transport' && x.geo_level === 'National');
  const yr = TX.years(); const inR = r.filter((x) => x.year >= yr.from && x.year <= yr.to).sort((a, b) => a.year - b.year);
  const last = r.find((x) => x.year === TX.latest(r)); const first = inR[0];
  if (!last) { el.textContent = '—'; return; }
  if (first && first.year !== last.year) {
    TX.text(el, `${last.geography}, ${last.year} · was `, TX.mark('span', 'modal', 'share_pct', {series: first.series, year: first.year,
      geo_level: first.geo_level, geography: first.geography, settlement: 'All', mode_group: 'Public transport'}, TX.fmt.pct(first.share_pct)), ` in ${first.year}`);
  } else TX.text(el, `${last.geography}, Census ${last.year}`);
});
dash.draw('k-cars', (el) => {
  const a = TX.rows('area_metrics'); if (!a) { el.textContent = '—'; return; }
  const {row} = txAreaRow(a, 'Cars per 1,000 residents');
  if (!row) { el.textContent = '—'; return; }
  TX.text(el, TX.mark('span', 'area_metrics', 'value', {metric: row.metric, year: row.year, geo_level: row.geo_level, geography: row.geography}, TX.fmt.n0(row.value)));
});
dash.draw('k-cars-s', (el) => {
  const a = TX.rows('area_metrics'); if (!a) { el.textContent = '—'; return; }
  const {row} = txAreaRow(a, 'Cars per 1,000 residents');
  if (!row) { el.textContent = '—'; return; }
  const nat = a.find((x) => x.metric === row.metric && x.geo_level === 'National' && x.year === row.year);
  if (row.geo_level !== 'National' && nat) TX.text(el, `${row.geography}, ${row.year} · Ireland `, TX.mark('span', 'area_metrics', 'value', {metric: nat.metric, year: nat.year, geo_level: 'National', geography: 'Ireland'}, TX.fmt.n0(nat.value)));
  else TX.text(el, `Ireland, ${row.year}`);
});
dash.draw('k-sup', (el) => {
  const a = TX.rows('area_metrics'); if (!a) { el.textContent = '—'; return; }
  const {row} = txAreaRow(a, 'PT trips per 1,000 residents');
  if (!row) { el.textContent = '—'; return; }
  TX.text(el, TX.mark('span', 'area_metrics', 'value', {metric: row.metric, year: row.year, geo_level: row.geo_level, geography: row.geography}, TX.fmt.n1(row.value)));
});
dash.draw('k-sup-s', (el) => {
  const a = TX.rows('area_metrics'); if (!a) { el.textContent = '—'; return; }
  const {row} = txAreaRow(a, 'PT trips per 1,000 residents');
  if (!row) { el.textContent = '—'; return; }
  const nat = a.find((x) => x.metric === row.metric && x.geo_level === 'National' && x.year === row.year);
  if (row.geo_level !== 'National' && nat) TX.text(el, `${row.geography}, GTFS ${row.year} · Ireland `, TX.mark('span', 'area_metrics', 'value', {metric: nat.metric, year: nat.year, geo_level: 'National', geography: 'Ireland'}, TX.fmt.n1(nat.value)));
  else TX.text(el, `Ireland, GTFS timetable ${row.year}`);
});
dash.draw('k-km', (el) => {
  const k = dash.data('km_totals'); if (k.status !== 'ok' || !k.data.length) { el.textContent = '—'; return; }
  const y = TX.latest(k.data); const r = k.data.find((x) => x.year === y);
  TX.text(el, TX.mark('span', 'km_totals', 'total_bn', {year: r.year}, `${TX.fmt.n1(r.total_bn)} bn`));
});
dash.draw('k-km-s', (el) => {
  const k = dash.data('km_totals'); if (k.status !== 'ok' || !k.data.length) { el.textContent = '—'; return; }
  const y = TX.latest(k.data); const r = k.data.find((x) => x.year === y);
  TX.text(el, `${r.year} · private car `, TX.mark('span', 'km_totals', 'car_share_pct', {year: r.year}, TX.fmt.pct0(r.car_share_pct)),
    ' · public transport ', TX.mark('span', 'km_totals', 'pt_share_pct', {year: r.year}, TX.fmt.pct0(r.pt_share_pct)));
});

// ---- the one-sentence takeaway
dash.draw('lede', (el) => {
  const m = TX.rows('modal'), a = TX.rows('area_metrics');
  if (!m || !a) { el.textContent = '—'; return; }
  const nat = m.filter((x) => x.series === 'Census commuters' && x.geo_level === 'National' && x.settlement === 'All');
  const y = TX.latest(nat);
  const car = nat.find((x) => x.year === y && x.mode_group === 'Private car');
  const pt = nat.find((x) => x.year === y && x.mode_group === 'Public transport');
  const sup = a.filter((x) => x.metric === 'PT trips per 1,000 residents' && x.geo_level === 'Regional');
  const sy = TX.latest(sup); const s = sup.filter((x) => x.year === sy).sort((p, q) => q.value - p.value);
  if (!car || !pt || s.length < 2) { el.textContent = '—'; return; }
  const W = (r) => ({series: r.series, year: r.year, geo_level: 'National', geography: 'Ireland', settlement: 'All', mode_group: r.mode_group});
  const S = (r) => ({metric: r.metric, year: r.year, geo_level: r.geo_level, geography: r.geography});
  const hi = s[0], lo = s[s.length - 1];
  TX.text(el, `The car still carries most trips: in ${y}, `, TX.b(TX.mark('span', 'modal', 'share_pct', W(car), TX.fmt.pct0(car.share_pct))),
    ' of commuters went by private car and ', TX.b(TX.mark('span', 'modal', 'share_pct', W(pt), TX.fmt.pct0(pt.share_pct))),
    ` by public transport. Service levels explain much of the gap: ${hi.geography} has `,
    TX.b(TX.mark('span', 'area_metrics', 'value', S(hi), TX.fmt.n1(hi.value))), ` weekday public transport trips per 1,000 residents, ${lo.geography} `,
    TX.b(TX.mark('span', 'area_metrics', 'value', S(lo), TX.fmt.n1(lo.value))), '.');
});
