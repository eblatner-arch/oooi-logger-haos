'use strict';
// ---------- Logbook: Stats and Map tabs ----------
// Combines flights logged here with history imported from MyFlightbook (Settings → Logbook history).
// Imported history never goes into the MyFlightbook import CSVs; it only feeds these two tabs.

const LB = { hist: [], histKey: null, unknown: [], unknownN: 0, period: 'all', view: null, sel: null };
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
const fmtNum = (v, d = 0) => (+v || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
// Hours as 3:49 (default) or 3.8, per Settings → Show hours as.
const fmtH = (v) => {
  if (S.cfg.timeFmt === 'dec') return fmtNum(v, 1);
  const m = Math.round((+v || 0) * 60);
  return `${Math.floor(m / 60).toLocaleString('en-US')}:${String(m % 60).padStart(2, '0')}`;
};
const fmtHu = (v) => (S.cfg.timeFmt === 'dec' ? `${fmtH(v)} h` : fmtH(v));   // with a unit only when decimal
const fmtDate = (iso, opts) => (iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...(opts || { month: 'short', day: 'numeric', year: 'numeric' }) }) : '—');
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayIso = () => todayLocal();

async function loadHistory() {
  const info = S.historyInfo, key = info ? info.imported_at : null;
  if (!key) { LB.hist = []; LB.histKey = null; LB.unknown = []; LB.unknownN = 0; return; }
  if (LB.histKey === key) return;
  const j = await api('GET', 'api/history');
  LB.hist = j.entries || []; LB.histKey = key; LB.unknown = j.unknown_airports || []; LB.unknownN = j.unknown_airport_count || 0;
}

// Flights logged in this add-on, in the same shape as imported history (with per-flight edits applied).
function appEntries() {
  const out = [];
  for (const f of S.flights || []) {
    const vals = csvValues(f, S.cfg); if (!vals) continue;
    const ov = f.override || {}, get = (k) => (k in ov ? ov[k] : vals[k]), n = (k) => +get(k) || 0;
    out.push({ d: f.date, r: [apCode(f.from), apCode(f.to)], t: n('Total Flight Time'), pic: n('PIC'), sic: n('SIC'), n: n('Night'), x: n('X-Country'),
      l: n('Landings'), ld: n('FS Day Landings'), ln: n('FS Night Landings'), to: n('Takeoffs (any)'), ton: n('Takeoffs - Night'),
      reg: f.tail || '', m: S.cfg.model, fn: f.flightNumber || '', src: 'app' });
  }
  return out;
}

// All entries, oldest first. A history row on the same date and route as a flight logged here is the
// same flight after it was imported into MyFlightbook, so the logged copy wins.
function allEntries() {
  const app = appEntries(), key = (e) => `${e.d}|${e.r[0] || ''}|${e.r[e.r.length - 1] || ''}`;
  const seen = new Set(app.map(key));
  return LB.hist.filter((e) => !(e.r.length && seen.has(key(e)))).map((e) => ({ ...e, src: 'mfb' })).concat(app)
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

function periodOptions(entries) {
  const years = [...new Set(entries.map((e) => e.d.slice(0, 4)))].sort().reverse();
  return [['all', 'All time'], ['12m', 'Last 12 months'], ['90d', 'Last 90 days'], ...years.map((y) => [y, y])];
}
function inPeriod(entries, p) {
  if (p === 'all') return entries;
  if (p === '12m' || p === '90d') { const from = addDays(todayIso(), p === '12m' ? -365 : -90); return entries.filter((e) => e.d > from); }
  return entries.filter((e) => e.d.startsWith(p));
}
function fillPeriodSelect(sel, entries) {
  const opts = periodOptions(entries);
  if (!opts.some(([v]) => v === LB.period)) LB.period = 'all';
  sel.innerHTML = '';
  for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
  sel.value = LB.period;
}

const legs = (e) => { const out = []; for (let i = 1; i < e.r.length; i++) if (e.r[i] !== e.r[i - 1]) out.push([e.r[i - 1], e.r[i]]); return out; };
const entryNm = (e) => legs(e).reduce((s, [a, b]) => s + (AP[a] && AP[b] ? distNm(AP[a], AP[b]) : 0), 0);

// ---------- Currency (14 CFR 61.57) ----------
// Current through = the date of the 3rd most recent event + 90 days.
function recency(entries, count) {
  const today = todayIso(), from = addDays(today, -90);
  let n = 0, third = null, in90 = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const c = count(entries[i]); if (!c) continue;
    if (entries[i].d > from && entries[i].d <= today) in90 += c;
    if (third == null) { n += c; if (n >= 3) third = entries[i].d; }
  }
  const until = third ? addDays(third, 90) : null;
  return { until, current: !!until && until >= today, in90 };
}
function currencyStatus(entries) {
  const noTo = entries.some((e) => e.to == null && e.l);  // history without a takeoffs column: assume one takeoff per landing
  const to = (e) => (e.to != null ? e.to : e.l), ton = (e) => (e.ton != null ? e.ton : e.ln);
  const day = [recency(entries, to), recency(entries, (e) => e.l)], night = [recency(entries, ton), recency(entries, (e) => e.ln)];
  const merge = ([a, b]) => ({ to: a, ldg: b, until: a.until && b.until ? (a.until < b.until ? a.until : b.until) : null, current: a.current && b.current });
  return { day: merge(day), night: merge(night), noTo };
}
function renderCurrency(box, entries) {
  box.innerHTML = '';
  const c = currencyStatus(entries);
  for (const [label, rule, s, toWord, ldgWord] of [['Day', '61.57(a)', c.day, 'takeoffs', 'landings'], ['Night', '61.57(b)', c.night, 'night takeoffs', 'night full-stop landings']]) {
    const row = document.createElement('div'); row.className = 'cur';
    const head = document.createElement('div'); head.className = 'cur-head';
    const b = document.createElement('b'); b.textContent = `${label} · ${rule}`;
    const chip = document.createElement('span');
    const soon = s.current && s.until <= addDays(todayIso(), 14);
    chip.className = 'chip ' + (s.current ? (soon ? 'pend' : 'ok') : 'unsynced');
    chip.textContent = s.current ? (soon ? '⚠ Expires soon' : '✓ Current') : '✕ Not current';
    head.append(b, chip);
    const p = document.createElement('div'); p.className = 'small';
    const need = (r) => Math.max(0, 3 - r.in90);
    p.textContent = s.current
      ? `Through ${fmtDate(s.until)}. Last 90 days: ${s.to.in90} ${toWord}, ${s.ldg.in90} ${ldgWord}.`
      : `Last 90 days: ${s.to.in90} ${toWord}, ${s.ldg.in90} ${ldgWord}. Needs ${[[need(s.to), toWord], [need(s.ldg), ldgWord]].filter(([n]) => n).map(([n, w]) => `${n} more ${w}`).join(' and ') || '3 within 90 days'}.`;
    row.append(head, p); box.appendChild(row);
  }
  const note = document.createElement('p'); note.className = 'small'; note.style.margin = '0';
  note.textContent = 'Counts every logged takeoff and landing, including simulator sessions, in any aircraft. Your operator\'s rules (for example 14 CFR 121.439) and type requirements may differ, so treat this as a reminder, not a legal determination.'
    + (c.noTo ? ' Some imported flights have no takeoff count, so one takeoff per landing is assumed for those.' : '');
  box.appendChild(note);
}

// ---------- Stats ----------
function totals(es) {
  const t = { flights: 0, sims: 0, total: 0, pic: 0, sic: 0, night: 0, xc: 0, l: 0, ln: 0, nm: 0 };
  const aps = new Set();
  for (const e of es) {
    if (e.sim) t.sims++; else t.flights++;
    t.total += e.t; t.pic += e.pic; t.sic += e.sic; t.night += e.n; t.xc += e.x; t.l += e.l; t.ln += e.ln;
    t.nm += entryNm(e);
    for (const a of e.r) if (AP[a]) aps.add(a);
  }
  t.airports = aps.size;
  return t;
}
function buckets(es, p) {
  // all time → years; a year or 12 months → months; 90 days → weeks are too fiddly, use months
  const byYear = p === 'all';
  const keyOf = (e) => (byYear ? e.d.slice(0, 4) : e.d.slice(0, 7));
  const keys = [];
  if (byYear) { const ys = es.map((e) => +e.d.slice(0, 4)); if (ys.length) for (let y = Math.min(...ys); y <= Math.max(...ys); y++) keys.push(String(y)); }
  else if (/^\d{4}$/.test(p)) { for (let m = 1; m <= 12; m++) keys.push(`${p}-${String(m).padStart(2, '0')}`); }
  else { const n = p === '90d' ? 3 : 12, d = new Date(); for (let i = n - 1; i >= 0; i--) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth() - i, 15)); keys.push(x.toISOString().slice(0, 7)); } }
  const m = new Map(keys.map((k) => [k, []]));
  for (const e of es) { const k = keyOf(e); if (m.has(k)) m.get(k).push(e); }
  return { byYear, rows: keys.map((k) => ({ key: k, label: byYear ? k : fmtDate(k + '-15', { month: 'short' }), full: byYear ? k : fmtDate(k + '-15', { month: 'long', year: 'numeric' }), ...totals(m.get(k)) })) };
}

function drawBars(svgBox, rows) {
  svgBox.innerHTML = '';
  const W = 520, H = 200, padL = 34, padB = 22, padT = 16, padR = 6;
  const max = Math.max(1, ...rows.map((r) => r.total));
  const step = max > 600 ? 200 : max > 300 ? 100 : max > 120 ? 50 : max > 40 ? 20 : max > 16 ? 5 : 2;
  const top = Math.ceil(max / step) * step;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Hours by period' });
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  for (let v = 0; v <= top; v += step) {
    svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: 'var(--line)', 'stroke-width': 1 }));
    svg.appendChild(svgEl('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--muted)', 'font-family': 'var(--f-mono)' }, fmtNum(v)));
  }
  const slot = (W - padL - padR) / rows.length, bw = Math.max(3, Math.min(28, slot - 2));
  const every = Math.ceil(rows.length / 12);
  const tip = $('barTip');
  const best = rows.reduce((a, r) => (r.total > a.total ? r : a), rows[0] || { total: 0 });
  rows.forEach((r, i) => {
    const cx = padL + slot * i + slot / 2, x = cx - bw / 2, h = Math.max(0, y(0) - y(r.total));
    if (h > 0) {
      const rad = Math.min(4, bw / 2, h);
      // rounded data end, square on the baseline
      svg.appendChild(svgEl('path', { d: `M${x},${y(0)}V${y(0) - h + rad}Q${x},${y(0) - h} ${x + rad},${y(0) - h}H${x + bw - rad}Q${x + bw},${y(0) - h} ${x + bw},${y(0) - h + rad}V${y(0)}Z`, fill: 'var(--bar)' }));
    }
    if (i % every === 0) svg.appendChild(svgEl('text', { x: cx, y: H - 6, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--muted)', 'font-family': 'var(--f-display)' }, rows.length > 12 && !/^\d{4}$/.test(r.label) ? r.label.slice(0, 1) : r.label));
    if (r === best && r.total > 0) svg.appendChild(svgEl('text', { x: cx, y: y(r.total) - 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600, fill: 'var(--ink)', 'font-family': 'var(--f-mono)' }, fmtH(r.total)));
    // hit target taller and wider than the bar
    const hit = svgEl('rect', { x: padL + slot * i, y: padT, width: slot, height: H - padT - padB, fill: 'transparent', tabindex: 0, 'aria-label': `${r.full}: ${fmtH(r.total)} hours` });
    const showTip = () => {
      tip.hidden = false; tip.textContent = `${r.full} · ${fmtHu(r.total)} · ${r.flights} flight${r.flights === 1 ? '' : 's'} · ${fmtH(r.night)} night · ${r.l} ldg`;
      for (const s of svg.querySelectorAll('.sel')) s.remove();
      svg.insertBefore(svgEl('rect', { class: 'sel', x: padL + slot * i, y: padT, width: slot, height: H - padT - padB, fill: 'var(--accent-soft)' }), svg.firstChild);
    };
    hit.addEventListener('pointerenter', showTip); hit.addEventListener('click', showTip); hit.addEventListener('focus', showTip);
    svg.appendChild(hit);
  });
  svgBox.appendChild(svg);
}

function topList(box, rows, empty) {
  box.innerHTML = '';
  if (!rows.length) { const p = document.createElement('p'); p.className = 'small'; p.style.margin = '0'; p.textContent = empty; box.appendChild(p); return; }
  const max = rows[0][1];
  for (const [name, n, sub] of rows) {
    const row = document.createElement('div'); row.className = 'toprow';
    const a = document.createElement('span'); a.className = 'mono'; a.textContent = name;
    const meter = document.createElement('span'); meter.className = 'meter'; const fill = document.createElement('i'); fill.style.width = `${Math.max(4, (n / max) * 100)}%`; meter.appendChild(fill);
    const v = document.createElement('span'); v.className = 'num'; v.textContent = sub;
    row.append(a, meter, v); box.appendChild(row);
  }
}

async function renderStats() {
  try { await loadHistory(); } catch (e) { toast(e.message); }
  const all = allEntries();
  $('statsEmpty').hidden = !!all.length; $('statsBody').hidden = !all.length;
  $('statsImportHint').hidden = !!LB.histKey;
  if (!all.length) return;
  fillPeriodSelect($('statPeriod'), all);
  const es = inPeriod(all, LB.period), t = totals(es);
  const nApp = es.filter((e) => e.src === 'app').length;
  $('statSource').textContent = `${fmtNum(es.length)} entr${es.length === 1 ? 'y' : 'ies'}` + (LB.histKey ? ` · ${fmtNum(es.length - nApp)} from MyFlightbook, ${fmtNum(nApp)} logged here` : ' logged here');
  renderCurrency($('curBox'), all);

  const tiles = $('statTiles'); tiles.innerHTML = '';
  for (const [v, l] of [[fmtH(t.total), 'Total hours'], [fmtH(t.pic), 'PIC'], [fmtH(t.sic), 'SIC'],
    [fmtH(t.night), 'Night'], [fmtH(t.xc), 'Cross-country'], [fmtNum(t.flights), 'Flights'],
    [fmtNum(t.l), `Landings · ${fmtNum(t.ln)} night`], [fmtNum(t.airports), 'Airports'], [fmtNum(t.nm), 'Distance nm']]) {
    const s = document.createElement('div'); s.className = 'stat'; const b = document.createElement('b'); b.textContent = v; const sp = document.createElement('span'); sp.textContent = l; s.append(b, sp); tiles.appendChild(s);
  }
  if (t.sims) { const s = $('statSims'); s.hidden = false; s.textContent = `Plus ${t.sims} simulator session${t.sims === 1 ? '' : 's'} (not counted as flights).`; } else $('statSims').hidden = true;

  const bk = buckets(es, LB.period);
  $('barTitle').textContent = bk.byYear ? 'Hours by year' : 'Hours by month';
  $('barTip').hidden = true;
  drawBars($('barChart'), bk.rows);
  const tb = $('barTable'); tb.innerHTML = '';
  const head = document.createElement('tr');
  for (const h of [bk.byYear ? 'Year' : 'Month', 'Flights', 'Total', 'PIC', 'SIC', 'Night', 'Ldg']) { const th = document.createElement('th'); th.textContent = h; head.appendChild(th); }
  tb.appendChild(head);
  for (const r of bk.rows.slice().reverse()) {
    const tr = document.createElement('tr');
    for (const v of [r.full, fmtNum(r.flights), fmtH(r.total), fmtH(r.pic), fmtH(r.sic), fmtH(r.night), fmtNum(r.l)]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
    tb.appendChild(tr);
  }

  // top routes (city pairs, either direction), airports, aircraft types
  const pairs = new Map(), aps = new Map(), types = new Map();
  for (const e of es) {
    if (e.sim) continue;
    for (const [a, b] of legs(e)) { const k = [a, b].sort().join(' – '); const p = pairs.get(k) || { n: 0, h: 0 }; p.n++; p.h += e.t / Math.max(1, legs(e).length); pairs.set(k, p); }
    for (const a of new Set(e.r)) aps.set(a, (aps.get(a) || 0) + 1);
    if (e.m) { const k = e.m; types.set(k, (types.get(k) || 0) + e.t); }
  }
  topList($('topRoutes'), [...pairs].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, p]) => [k, p.n, `${p.n}× · ${fmtHu(p.h)}`]), 'No routes in this period.');
  topList($('topAirports'), [...aps].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k, n, `${fmtNum(n)} visit${n === 1 ? '' : 's'}`]), 'No airports in this period.');
  topList($('topTypes'), [...types].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, h]) => [k, h, `${fmtHu(h)}`]), 'No aircraft in this period.');

  // records
  const rec = $('records'); rec.innerHTML = '';
  const flights = es.filter((e) => !e.sim && e.t > 0);
  const add = (k, v) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; rec.append(dt, dd); };
  if (flights.length) {
    const longest = flights.reduce((a, e) => (e.t > a.t ? e : a));
    const far = flights.map((e) => [e, entryNm(e)]).reduce((a, x) => (x[1] > a[1] ? x : a));
    const months = new Map(); for (const e of flights) months.set(e.d.slice(0, 7), (months.get(e.d.slice(0, 7)) || 0) + e.t);
    const [bm, bh] = [...months].reduce((a, x) => (x[1] > a[1] ? x : a));
    add('Longest flight', `${fmtHu(longest.t)} · ${longest.r.join('–')} · ${fmtDate(longest.d)}`);
    if (far[1] > 0) add('Farthest leg', `${fmtNum(far[1])} nm · ${far[0].r.join('–')} · ${fmtDate(far[0].d)}`);
    add('Busiest month', `${fmtHu(bh)} · ${fmtDate(bm + '-15', { month: 'long', year: 'numeric' })}`);
    add('First flight', `${fmtDate(flights[0].d)} · ${flights[0].r.join('–') || '—'}`);
    add('Most recent', `${fmtDate(flights[flights.length - 1].d)} · ${flights[flights.length - 1].r.join('–') || '—'}`);
  }
}

// ---------- Map ----------
function mapData(es) {
  const aps = new Map(), routes = new Map();
  for (const e of es) {
    if (e.sim) continue;
    for (const a of new Set(e.r)) { if (!AP[a]) continue; const x = aps.get(a) || { n: 0, first: e.d, last: e.d }; x.n++; x.last = e.d; aps.set(a, x); }
    for (const [a, b] of legs(e)) { if (!AP[a] || !AP[b]) continue; const k = [a, b].sort().join('|'); routes.set(k, (routes.get(k) || 0) + 1); }
  }
  return { aps, routes };
}
// The map wraps east–west: the world is drawn at -360°, 0° and +360°, and the view is kept
// within one world-width of the centre copy, so panning never runs off the edge.
const WRAP = [-360, 0, 360];
function fitView(aps) {
  const pts = [...aps.keys()].map((a) => AP[a]);
  if (!pts.length) return clampView({ x: -180, y: -80, w: 360, h: 160, k: 1 });
  const minLat = Math.min(...pts.map((p) => p.lat)), maxLat = Math.max(...pts.map((p) => p.lat));
  // Smallest longitude span that holds every airport, allowing it to cross the date line.
  const L = [...new Set(pts.map((p) => p.lon))].sort((x, y) => x - y);
  let gap = -1, gi = 0;
  for (let i = 0; i < L.length; i++) { const g = (i + 1 < L.length ? L[i + 1] : L[0] + 360) - L[i]; if (g > gap) { gap = g; gi = i; } }
  const minLon = L.length > 1 ? (gi + 1 < L.length ? L[gi + 1] : L[0]) : L[0];
  const maxLon = minLon + (L.length > 1 ? 360 - gap : 0);
  const k = Math.cos(((minLat + maxLat) / 2) * RAD);
  let w = (maxLon - minLon) * k, h = maxLat - minLat;
  const pad = Math.max(2, Math.max(w, h) * 0.1); w += pad * 2; h += pad * 2;
  if (w / h < 1.3) w = h * 1.3; else h = Math.max(h, w / 1.9);
  return clampView({ x: ((minLon + maxLon) / 2) * k - w / 2, y: -(minLat + maxLat) / 2 - h / 2, w, h, k });
}
// Keep the view's centre on the middle world copy, no wider than one world, and inside the poles.
function clampView(v) {
  const period = 360 * v.k;
  if (v.w > period) { const f = period / v.w; v = { ...v, x: v.x + (v.w - period) / 2, y: v.y + (v.h - v.h * f) / 2, w: period, h: v.h * f }; }
  let cx = v.x + v.w / 2;
  while (cx > period / 2) { v.x -= period; cx -= period; }
  while (cx < -period / 2) { v.x += period; cx += period; }
  if (v.h >= 180) v.y = -v.h / 2; else v.y = Math.min(Math.max(v.y, -90), 90 - v.h);
  return v;
}
function arc(a, b) {
  // great-circle samples with continuous longitude (no split at the date line)
  const out = []; let prev = null;
  for (let i = 0; i <= 32; i++) {
    const p = gcPoint(a, b, i / 32); let lon = p.lon;
    if (prev != null) { while (lon - prev > 180) lon -= 360; while (prev - lon > 180) lon += 360; }
    out.push([lon, -p.lat]); prev = lon;
  }
  return out;
}
function drawMapTab() {
  const svg = $('wMap'), d = LB.mapData, v = LB.view;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  const k = v.k;
  const defs = svgEl('defs', {});
  defs.appendChild(svgEl('path', { id: 'wLand', d: LAND_D }));
  svg.appendChild(defs);
  const g = svgEl('g', { transform: `scale(${k} 1)`, fill: 'var(--land)', stroke: 'var(--coast)', 'stroke-width': 0.8 });
  for (const o of WRAP) g.appendChild(svgEl('use', { href: '#wLand', x: o, 'vector-effect': 'non-scaling-stroke' }));
  svg.appendChild(g);
  const maxR = Math.max(1, ...d.routes.values());
  const lines = svgEl('g', { fill: 'none', stroke: 'var(--bar)', 'stroke-linecap': 'round' });
  for (const [key, n] of [...d.routes].sort((a, b) => a[1] - b[1])) {
    const [a, b] = key.split('|');
    const w = 1 + 2.5 * Math.sqrt(n / maxR), op = 0.35 + 0.55 * Math.sqrt(n / maxR);
    const pts = arc(AP[a], AP[b]);
    for (const o of WRAP) lines.appendChild(svgEl('polyline', { points: pts.map(([x, y]) => `${((x + o) * k).toFixed(3)},${y.toFixed(3)}`).join(' '), 'stroke-width': w.toFixed(2), opacity: op.toFixed(2), 'vector-effect': 'non-scaling-stroke' }));
  }
  svg.appendChild(lines);
  const maxN = Math.max(1, ...[...d.aps.values()].map((x) => x.n));
  const unit = v.h / 300;   // one "screen pixel" at a ~300px tall map
  const ranked = [...d.aps].sort((a, b) => b[1].n - a[1].n);
  const labelled = new Set(ranked.slice(0, 10).map(([a]) => a));
  if (LB.sel) labelled.add(LB.sel);
  for (const o of WRAP) {
    for (const [code, x] of ranked.slice().reverse()) {
      const p = AP[code], cx = (p.lon + o) * k, cy = -p.lat, r = unit * (2.5 + 5 * Math.sqrt(x.n / maxN));
      const on = code === LB.sel;
      svg.appendChild(svgEl('circle', { cx, cy, r, fill: on ? 'var(--accent)' : 'var(--ink)', stroke: 'var(--surface)', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
      const hit = svgEl('circle', { cx, cy, r: Math.max(r, unit * 11), fill: 'transparent', 'data-ap': code, tabindex: o === 0 ? 0 : -1, role: 'button', 'aria-label': `${code}, ${x.n} visits` });
      svg.appendChild(hit);
    }
    for (const code of labelled) {
      const p = AP[code]; if (!p || !d.aps.has(code)) continue;
      const fs = unit * 11;
      svg.appendChild(svgEl('text', { x: (p.lon + o) * k + unit * 8, y: -p.lat + fs * 0.35, 'font-size': fs, 'font-weight': 600, fill: 'var(--ink)', 'font-family': 'var(--f-mono)', 'paint-order': 'stroke', stroke: 'var(--water)', 'stroke-width': fs * 0.28, 'pointer-events': 'none' }, code));
    }
  }
}
function selectAirport(code) {
  LB.sel = code;
  const x = code && LB.mapData.aps.get(code), info = $('mapInfo');
  if (!x) { info.textContent = 'Tap an airport for details. Drag to move, pinch or use + − to zoom.'; drawMapTab(); return; }
  const routes = [...LB.mapData.routes].filter(([k]) => k.split('|').includes(code)).length;
  info.textContent = `${code} · ${fmtNum(x.n)} visit${x.n === 1 ? '' : 's'} · ${routes} route${routes === 1 ? '' : 's'} · first ${fmtDate(x.first)} · last ${fmtDate(x.last)}`;
  drawMapTab();
}
async function renderMap() {
  try { await loadHistory(); } catch (e) { toast(e.message); }
  const all = allEntries();
  $('mapEmpty').hidden = !!all.length; $('mapBody').hidden = !all.length;
  $('mapImportHint').hidden = !!LB.histKey;
  if (!all.length) return;
  fillPeriodSelect($('mapPeriod'), all);
  LB.mapData = mapData(inPeriod(all, LB.period));
  LB.view = fitView(LB.mapData.aps);
  if (LB.sel && !LB.mapData.aps.has(LB.sel)) LB.sel = null;
  const n = LB.mapData.aps.size, r = LB.mapData.routes.size;
  $('mapSummary').textContent = `${fmtNum(n)} airport${n === 1 ? '' : 's'} · ${fmtNum(r)} route${r === 1 ? '' : 's'}` + (LB.unknownN ? ` · ${LB.unknownN} airport code${LB.unknownN === 1 ? '' : 's'} not found, so not shown` : '');
  selectAirport(LB.sel);
}
function zoomMap(f, cx, cy) {
  const v = LB.view; if (!v) return;
  const w = Math.min(Math.max(v.w * f, 0.5), 360 * v.k), h = (w / v.w) * v.h;
  const px = cx == null ? 0.5 : cx, py = cy == null ? 0.5 : cy;
  LB.view = clampView({ ...v, x: v.x + (v.w - w) * px, y: v.y + (v.h - h) * py, w, h });
  drawMapTab();
}
function setupMapGestures() {
  const svg = $('wMap'), pts = new Map(); let start = null, moved = false;
  const rel = (e) => { const b = svg.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height]; };
  svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture && svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, rel(e)); start = { view: { ...LB.view }, pts: new Map(pts) }; moved = false; });
  svg.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, rel(e));
    const s = start.view, cur = [...pts.values()], st = [...start.pts.values()];
    if (cur.length === 1 && st.length === 1) {
      const dx = cur[0][0] - st[0][0], dy = cur[0][1] - st[0][1];
      if (Math.abs(dx) + Math.abs(dy) > 0.01) moved = true;
      const nv = clampView({ ...s, x: s.x - dx * s.w, y: s.y - dy * s.h });
      s.x += nv.x - (s.x - dx * s.w);   // carry any wrap shift into the drag's start point
      LB.view = nv;
      $('wMap').setAttribute('viewBox', `${LB.view.x} ${LB.view.y} ${LB.view.w} ${LB.view.h}`);
    } else if (cur.length === 2 && st.length === 2) {
      moved = true;
      const dist = (p) => Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) || 0.001;
      const f = dist(st) / dist(cur), mx = (st[0][0] + st[1][0]) / 2, my = (st[0][1] + st[1][1]) / 2;
      const w = Math.min(Math.max(s.w * f, 0.5), 360 * s.k), h = (w / s.w) * s.h;
      LB.view = clampView({ ...s, x: s.x + (s.w - w) * mx, y: s.y + (s.h - h) * my, w, h });
      $('wMap').setAttribute('viewBox', `${LB.view.x} ${LB.view.y} ${LB.view.w} ${LB.view.h}`);
    }
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (!moved && e.type === 'pointerup') { const t = e.target && e.target.getAttribute && e.target.getAttribute('data-ap'); selectAirport(t || null); return; }
    start = pts.size ? { view: { ...LB.view }, pts: new Map(pts) } : null;
    if (!pts.size) drawMapTab();   // redraw so dots and labels keep their size
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = rel(e); zoomMap(e.deltaY > 0 ? 1.2 : 1 / 1.2, x, y); }, { passive: false });
  svg.addEventListener('keydown', (e) => { const t = e.target.getAttribute && e.target.getAttribute('data-ap'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectAirport(t); } });
  $('mapIn').onclick = () => zoomMap(1 / 1.5); $('mapOut').onclick = () => zoomMap(1.5);
  $('mapFit').onclick = () => { LB.view = fitView(LB.mapData.aps); drawMapTab(); };
}

// ---------- Settings: import ----------
function renderHistoryCard() {
  const h = S.historyInfo, info = $('histInfo');
  $('histRemove').hidden = !h;
  if (!h) { info.textContent = 'No history imported. Your past flights from MyFlightbook can be added to the Stats and Map tabs.'; $('histUnknown').hidden = true; return; }
  info.textContent = `${fmtNum(h.flights)} flights${h.sim_sessions ? ` and ${h.sim_sessions} simulator sessions` : ''}, ${fmtDate(h.first)} to ${fmtDate(h.last)}, ${fmtH(h.total_hours)} hours. Imported ${fmtDate(h.imported_at.slice(0, 10))}${h.file ? ` from ${h.file}` : ''}.`;
  const u = $('histUnknown');
  u.hidden = !h.unknown_airport_count;
  if (h.unknown_airport_count) u.textContent = `${h.unknown_airport_count} airport code${h.unknown_airport_count === 1 ? ' isn\'t' : 's aren\'t'} in the airport list, so ${h.unknown_airport_count === 1 ? 'it doesn\'t' : 'they don\'t'} show on the map: ${h.unknown_airports.join(', ')}${h.unknown_airport_count > h.unknown_airports.length ? ', …' : ''}. Tap Update airport database below to add most of them.`;
}
async function importHistory(file) {
  const b = $('histPick'); b.disabled = true; b.textContent = 'Importing…';
  try {
    const r = await fetch('api/history/import', { method: 'POST', body: file, headers: { 'Content-Type': 'text/csv', 'X-File-Name': encodeURIComponent(file.name || '') } });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { location.replace('./'); return; }
    if (!r.ok) throw new Error(j.error || `Import failed (${r.status})`);
    LB.histKey = null;
    toast(`Imported ${fmtNum(j.history.flights)} flights`);
    await refresh(); renderHistoryCard();
  } catch (e) { toast(e.message); }
  finally { b.disabled = false; b.textContent = S.historyInfo ? 'Replace with a new export' : 'Import MyFlightbook logbook'; $('histFile').value = ''; }
}
function setupHistoryCard() {
  $('histPick').onclick = () => $('histFile').click();
  $('histFile').addEventListener('change', () => { const f = $('histFile').files && $('histFile').files[0]; if (f) importHistory(f); });
  $('histRemove').onclick = async () => {
    const b = $('histRemove');
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to remove'; setTimeout(() => { delete b.dataset.armed; b.textContent = 'Remove imported history'; }, 3000); return; }
    delete b.dataset.armed; b.textContent = 'Remove imported history';
    try { await api('POST', 'api/history/delete'); LB.histKey = null; await refresh(); renderHistoryCard(); toast('Imported history removed'); } catch (e) { toast(e.message); }
  };
  for (const id of ['statPeriod', 'mapPeriod']) $(id).addEventListener('change', (e) => { LB.period = e.target.value; if (id === 'statPeriod') renderStats(); else { LB.sel = null; renderMap(); } });
  for (const id of ['statsGoImport', 'mapGoImport', 'statsGoImport2', 'mapGoImport2']) if ($(id)) $(id).onclick = () => show('set');
  setupMapGestures();
}
