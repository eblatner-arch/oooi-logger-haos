// ---------- Night work tab ----------
const SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, text) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
const zt = (ms) => { const d = new Date(ms); return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`; };

function trackSamples(t, a, b) {
  const out = [], span = t.on - t.off;
  for (let s = t.out; s < t.in; s += 60000) {
    const m = s + 30000;
    const f = span > 0 ? Math.min(Math.max((m - t.off) / span, 0), 1) : 0;
    const p = gcPoint(a, b, f);
    out.push({ m, lat: p.lat, lon: p.lon, alt: sunAlt(m, p.lat, p.lon) });
  }
  return out;
}

// Sunrise/sunset crossings (sun's upper edge, -0.833°) within 30 h either side.
function crossings(ms, ap) {
  const H0 = -0.833, step = 60000, res = { setBefore: null, riseBefore: null, setAfter: null, riseAfter: null };
  let prev = sunAlt(ms, ap.lat, ap.lon);
  for (let s = ms - step; s > ms - 30 * 3600000; s -= step) {
    const v = sunAlt(s, ap.lat, ap.lon);
    if (v >= H0 && prev < H0 && res.setBefore == null) res.setBefore = s;
    if (v < H0 && prev >= H0 && res.riseBefore == null) res.riseBefore = s;
    if (res.setBefore != null && res.riseBefore != null) break;
    prev = v;
  }
  prev = sunAlt(ms, ap.lat, ap.lon);
  for (let s = ms + step; s < ms + 30 * 3600000; s += step) {
    const v = sunAlt(s, ap.lat, ap.lon);
    if (prev >= H0 && v < H0 && res.setAfter == null) res.setAfter = s;
    if (prev < H0 && v >= H0 && res.riseAfter == null) res.riseAfter = s;
    if (res.setAfter != null && res.riseAfter != null) break;
    prev = v;
  }
  return res;
}

function renderNight() {
  const f = readForm(), r = compute(f);
  $('nightEmpty').hidden = r.ok; $('nightBody').hidden = !r.ok;
  if (!r.ok) return;
  const a = AP[f.from], b = AP[f.to], t = r.t;
  const smp = trackSamples(t, a, b);
  $('nRoute').textContent = `${f.from}–${f.to}${f.flightNumber ? ' · UA' + f.flightNumber : ''}`;
  $('nDate').textContent = new Date(f.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  const st = $('nStats'); st.innerHTML = '';
  for (const [v, l] of [[fmtHM(r.nightMin), `Night · ${r.night.toFixed(2)} hrs`], [fmtHM(r.blockMin), 'Block, OUT→IN'], [`${r.distNm}`, 'Great circle nm']]) {
    const d = document.createElement('div'); d.className = 'stat'; const bb = document.createElement('b'); bb.textContent = v; const sp = document.createElement('span'); sp.textContent = l; d.append(bb, sp); st.appendChild(d);
  }
  // night segments
  const segs = []; let cur = null;
  for (const s of smp) { const n = s.alt < -6; if (n && !cur) cur = { start: s.m - 30000, end: s.m + 30000 }; else if (n) cur.end = s.m + 30000; else if (cur) { segs.push(cur); cur = null; } }
  if (cur) segs.push(cur);
  const phase = (ms) => (ms <= t.off ? `at ${f.from}` : ms >= t.on ? `at ${f.to}` : 'en route');
  $('nSegs').textContent = segs.length
    ? 'Night ' + segs.map((g) => `${zt(g.start)} (${phase(g.start)}) to ${zt(g.end)} (${phase(g.end - 1)}), ${fmtHM(Math.round((g.end - g.start) / 60000))}`).join('; ') + '.'
    : 'The sun stays above −6° for the whole block, so no night time is logged.';

  drawChart(smp, t);
  drawMap(smp, a, b, f, t);
  drawOps(f, r, t, a, b);
}

function drawChart(smp, t) {
  const svg = $('nChart'); svg.innerHTML = '';
  const W = 340, H = 190, L = 34, R = 8, T = 22, B = 26;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  let lo = Math.min(-10, ...smp.map((s) => s.alt)), hi = Math.max(5, ...smp.map((s) => s.alt));
  lo = Math.floor(lo / 5) * 5; hi = Math.ceil(hi / 5) * 5;
  const x = (ms) => L + (ms - t.out) / (t.in - t.out) * (W - L - R);
  const y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  const css = (n) => `var(${n})`;
  // night band
  svg.appendChild(el('rect', { x: L, y: y(-6), width: W - L - R, height: y(lo) - y(-6), fill: css('--night-soft') }));
  svg.appendChild(el('rect', { x: L, y: y(-0.833), width: W - L - R, height: y(-6) - y(-0.833), fill: css('--twi-soft') }));
  // grid lines
  const ticks = []; for (let v = lo; v <= hi; v += (hi - lo > 40 ? 10 : 5)) ticks.push(v);
  for (const v of ticks) {
    svg.appendChild(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: css('--line'), 'stroke-width': 1 }));
    svg.appendChild(el('text', { x: L - 5, y: y(v) + 3.5, 'text-anchor': 'end', 'font-size': 10, fill: css('--muted'), 'font-family': 'var(--f-mono)' }, `${v}°`));
  }
  svg.appendChild(el('line', { x1: L, x2: W - R, y1: y(-6), y2: y(-6), stroke: css('--night'), 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }));
  svg.appendChild(el('text', { x: W - R - 2, y: y(-6) + 12, 'text-anchor': 'end', 'font-size': 10, fill: css('--night'), 'font-family': 'var(--f-mono)' }, '−6° night'));
  // OFF / ON markers
  for (const [ms, lab] of [[t.off, 'OFF ' + zt(t.off)], [t.on, 'ON ' + zt(t.on)]]) {
    svg.appendChild(el('line', { x1: x(ms), x2: x(ms), y1: T - 4, y2: H - B, stroke: css('--muted'), 'stroke-width': 1, 'stroke-dasharray': '2 3' }));
  }
  const offX = x(t.off), onX = x(t.on);
  svg.appendChild(el('text', { x: Math.max(offX, L), y: 12, 'text-anchor': 'start', 'font-size': 10, fill: css('--ink'), 'font-family': 'var(--f-mono)' }, 'OFF ' + zt(t.off)));
  svg.appendChild(el('text', { x: Math.min(onX, W - R), y: 12, 'text-anchor': 'end', 'font-size': 10, fill: css('--ink'), 'font-family': 'var(--f-mono)' }, 'ON ' + zt(t.on)));
  svg.appendChild(el('text', { x: L, y: H - 8, 'text-anchor': 'start', 'font-size': 10, fill: css('--muted'), 'font-family': 'var(--f-mono)' }, 'OUT ' + zt(t.out)));
  svg.appendChild(el('text', { x: W - R, y: H - 8, 'text-anchor': 'end', 'font-size': 10, fill: css('--muted'), 'font-family': 'var(--f-mono)' }, 'IN ' + zt(t.in)));
  // elevation line, colored by state
  const col = (v) => (v < -6 ? '--night' : v < -0.833 ? '--twi' : '--day');
  let run = [], runCol = null;
  const flush = () => { if (run.length > 1) svg.appendChild(el('polyline', { points: run.join(' '), fill: 'none', stroke: css(runCol), 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })); };
  for (const s of smp) {
    const c = col(s.alt), pt = `${x(s.m).toFixed(1)},${y(s.alt).toFixed(1)}`;
    if (c !== runCol) { if (run.length) { run.push(pt); flush(); } run = [run.length ? run[run.length - 1] : pt, pt]; runCol = c; if (run[0] === run[1]) run = [pt]; }
    else run.push(pt);
  }
  flush();
}

function drawMap(smp, a, b, f, t) {
  const svg = $('nMap'); svg.innerHTML = '';
  const minLon = Math.min(...smp.map((s) => s.lon)), maxLon = Math.max(...smp.map((s) => s.lon));
  const minLat = Math.min(...smp.map((s) => s.lat)), maxLat = Math.max(...smp.map((s) => s.lat));
  const k = Math.cos((minLat + maxLat) / 2 * RAD);
  let w = (maxLon - minLon) * k, h = maxLat - minLat;
  const pad = Math.max(1.5, Math.max(w, h) * 0.18);
  w += pad * 2; h += pad * 2;
  if (w / h < 1.25) w = h * 1.25; else if (w / h > 1.8) h = w / 1.8;   // keep a landscape frame
  const leftX = (minLon + maxLon) / 2 * k - w / 2, top = -(minLat + maxLat) / 2 - h / 2;
  svg.setAttribute('viewBox', `${leftX} ${top} ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const g = el('g', { transform: `scale(${k} 1)` });
  g.appendChild(el('path', { d: LAND_D, fill: 'var(--land)', stroke: 'var(--coast)', 'stroke-width': 0.8, 'vector-effect': 'non-scaling-stroke' }));
  // graticule every 5°
  for (let lon = Math.ceil((leftX / k) / 5) * 5; lon < (leftX + w) / k; lon += 5) g.appendChild(el('line', { x1: lon, x2: lon, y1: top, y2: top + h, stroke: 'var(--coast)', 'stroke-width': 0.5, 'stroke-dasharray': '2 4', 'vector-effect': 'non-scaling-stroke', opacity: 0.6 }));
  for (let lat = Math.ceil(-(top + h) / 5) * 5; lat < -top; lat += 5) g.appendChild(el('line', { x1: leftX / k, x2: (leftX + w) / k, y1: -lat, y2: -lat, stroke: 'var(--coast)', 'stroke-width': 0.5, 'stroke-dasharray': '2 4', 'vector-effect': 'non-scaling-stroke', opacity: 0.6 }));
  // route colored by sun state
  const col = (v) => (v < -6 ? '--night' : v < -0.833 ? '--twi' : '--day');
  let run = [], c0 = null;
  const flush = () => { if (run.length > 1) g.appendChild(el('polyline', { points: run.join(' '), fill: 'none', stroke: `var(${c0})`, 'stroke-width': 3.5, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' })); };
  const air = smp.filter((s) => s.m >= t.off && s.m <= t.on);
  const pts = air.length ? air : smp;
  for (const s of pts) {
    const c = col(s.alt), pt = `${s.lon.toFixed(3)},${(-s.lat).toFixed(3)}`;
    if (c !== c0) { if (run.length) { run.push(pt); flush(); } run = [pt]; c0 = c; } else run.push(pt);
  }
  flush();
  svg.appendChild(g);
  // airports (drawn outside the scaled group so circles and text stay round)
  const fs = h / 22, rr = h / 70;
  for (const [ap, code] of [[a, f.from], [b, f.to]]) {
    const cx = ap.lon * k, cy = -ap.lat;
    svg.appendChild(el('circle', { cx, cy, r: rr, fill: 'var(--surface)', stroke: 'var(--ink)', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
    const right = cx < leftX + w * 0.75;
    const txt = el('text', { x: cx + (right ? rr * 1.8 : -rr * 1.8), y: cy + fs * 0.35, 'text-anchor': right ? 'start' : 'end', 'font-size': fs, 'font-weight': 600, fill: 'var(--ink)', 'font-family': 'var(--f-mono)', 'paint-order': 'stroke', stroke: 'var(--water)', 'stroke-width': fs * 0.25 }, code);
    svg.appendChild(txt);
  }
}

function drawOps(f, r, t, a, b) {
  const box = $('nOps'); box.innerHTML = '';
  const H = 3600000;
  for (const [kind, ms, ap, code, isNight] of [['Takeoff', t.off, a, f.from, r.nightTO], ['Landing', t.on, b, f.to, r.nightLdg]]) {
    const c = crossings(ms, ap);
    const card = document.createElement('div'); card.className = 'op';
    const head = document.createElement('div'); head.className = 'op-head';
    const hb = document.createElement('b'); hb.textContent = `${kind} · ${code} · ${zt(ms)}`;
    const chip = document.createElement('span'); chip.className = 'chip ' + (isNight ? 'night' : 'day'); chip.textContent = isNight ? 'Night' : 'Day';
    head.append(hb, chip);
    const dl = document.createElement('dl');
    const add = (k, v) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); };
    if (isNight) {
      add('Sunset', c.setBefore ? zt(c.setBefore) : '—');
      add('Night ops from', c.setBefore ? zt(c.setBefore + H) : '—');
      add('Sunrise', c.riseAfter ? zt(c.riseAfter) : '—');
      add('Night ops until', c.riseAfter ? zt(c.riseAfter - H) : '—');
    } else {
      const sunDown = c.setBefore && (!c.riseBefore || c.setBefore > c.riseBefore);
      if (!sunDown) {
        add('Sunrise', c.riseBefore ? zt(c.riseBefore) : '—');
        add('Sunset', c.setAfter ? zt(c.setAfter) : '—');
        add('Night ops from', c.setAfter ? zt(c.setAfter + H) : '—');
      } else if (c.setBefore && ms < c.setBefore + H) {
        add('Sunset', zt(c.setBefore));
        add('Night ops from', zt(c.setBefore + H) + ' (after this)');
      } else {
        add('Sunrise', c.riseAfter ? zt(c.riseAfter) : '—');
        add('Night ops until', c.riseAfter ? zt(c.riseAfter - H) + ' (before this)' : '—');
      }
    }
    add('Sun at ' + kind.toLowerCase(), `${sunAlt(ms, ap.lat, ap.lon).toFixed(1)}°`);
    const note = document.createElement('div'); note.className = 'small';
    note.textContent = f.duty === 'PF' ? (isNight ? `Logged as a night ${kind.toLowerCase()}.` : `Logged as a day ${kind.toLowerCase()}.`) : `You were PM, so no ${kind.toLowerCase()} is logged.`;
    card.append(head, dl, note);
    box.appendChild(card);
  }
}
