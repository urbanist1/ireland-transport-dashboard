// ---------------------------------------------------------------------------
// Stand-alone runtime for the dashboard.
// Provides the small `dash` API the chart scripts use (draw, data, params,
// calc, colors ...) so the same chart code runs on any static host with no
// sign-in. Data comes from data.js; filters live in memory and in the URL,
// so a filtered view can be shared by copying the address bar.
// ---------------------------------------------------------------------------
window.dash = (() => {
  // Categorical palette (validated for colour-blind separation).
  const colors = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

  // ---- datasets
  const store = {};
  for (const [id, text] of Object.entries(window.TX_CSV || {})) store[id] = d3.csvParse(text);
  for (const [id, obj] of Object.entries(window.TX_JSON || {})) store[id] = obj;
  const calcs = {};
  function data(id) {
    if (id in store) return {status: 'ok', data: store[id]};
    if (id in calcs) {
      const c = calcs[id];
      if (!c.done) {
        const ins = c.inputs.map((i) => data(i));
        if (ins.some((d) => d.status !== 'ok')) return {status: 'missing', data: null};
        c.value = c.fn(...ins.map((d) => d.data)); c.done = true;
      }
      return {status: 'ok', data: c.value};
    }
    return {status: 'missing', data: null};
  }
  const calc = (id, spec) => { calcs[id] = {inputs: spec.inputs || [], fn: spec.fn, done: false}; };

  // ---- params (mirrored into the URL query string)
  let params = {};
  try {
    for (const [k, v] of new URLSearchParams(location.search)) {
      params[k] = v === 'true' ? true : v === 'false' ? false : (/^\d{4}$/.test(v) ? Number(v) : v);
    }
  } catch (e) { params = {}; }
  function syncUrl() {
    try {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, String(v));
      const s = q.toString();
      history.replaceState(null, '', `${location.pathname}${s ? `?${s}` : ''}${location.hash}`);
    } catch (e) { /* file:// or sandboxed: keep in memory only */ }
  }
  const getParams = () => ({...params});
  function setParams(patch) {
    for (const [k, v] of Object.entries(patch)) { if (v == null) delete params[k]; else params[k] = v; }
    syncUrl(); schedule();
  }
  function resetParams() { params = {}; syncUrl(); schedule(); }
  function setLink(anchor) {
    try { history.replaceState(null, '', `${location.pathname}${location.search}#${anchor}`); } catch (e) { /* ignore */ }
    schedule(); // a newly shown tab needs drawing at its real width
  }

  // ---- drawings
  const draws = new Map(); const listeners = [];
  const draw = (name, fn) => { draws.set(name, fn); };
  const onData = (fn) => { listeners.push(fn); };
  const isShown = (el) => !el.closest('[hidden]');
  function run() {
    for (const [name, fn] of draws) {
      document.querySelectorAll(`[data-draw="${name}"]`).forEach((el) => {
        const chart = el.classList.contains('tx-chart');
        if (chart && !isShown(el)) { el.dataset.stale = '1'; return; }
        try { fn(el); delete el.dataset.stale; } catch (e) {
          console.error(`draw ${name}`, e);
          if (chart) { el.replaceChildren(); const m = document.createElement('p'); m.className = 'tx-fail';
            m.textContent = 'This chart could not be drawn in this browser. Try reloading the page, or open it in Chrome, Edge or Firefox.'; el.append(m); }
        }
      });
    }
    for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } }
  }
  let queued = false;
  // Draw on the next frame; the timer is a fallback for browsers that pause animation frames.
  function schedule() {
    if (queued) return; queued = true;
    const go = () => { if (!queued) return; queued = false; run(); };
    requestAnimationFrame(go); setTimeout(go, 120);
  }
  document.addEventListener('DOMContentLoaded', schedule);
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastW) < 8) return;
    lastW = window.innerWidth; clearTimeout(run.t); run.t = setTimeout(schedule, 150);
  });

  return {colors, data, calc, params: getParams, setParams, resetParams, setLink, draw, onData};
})();
