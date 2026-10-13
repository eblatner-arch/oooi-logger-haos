// ---- Flight math (pure functions) ----
const AP = (() => {
  const m = {};
  for (const e of AP_RAW.split(';')) {
    const [lat, lon, tz] = e.slice(4).split(',');
    m[e.slice(0, 4)] = { lat: +lat, lon: +lon, tz: AP_TZ[+tz] };
  }
  return m;
})();

const RAD = Math.PI / 180;

function sunAlt(ms, lat, lon) {
  const n = ms / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  const H = (gmst + lon) * RAD - ra;
  return Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(H)) / RAD;
}

function gcPoint(a, b, f) {
  const la1 = a.lat * RAD, lo1 = a.lon * RAD, la2 = b.lat * RAD, lo2 = b.lon * RAD;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (d < 1e-9) return a;
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lon: Math.atan2(y, x) / RAD };
}

function distNm(a, b) {
  const la1 = a.lat * RAD, la2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dl / 2) ** 2));
  return d * 3440.065;
}

// Night = sun below -6° (end of evening civil twilight to start of morning civil twilight),
// sampled each minute from block out to block in. Aircraft sits at origin until OFF,
// moves along the great circle OFF→ON, then sits at destination until IN.
function nightMinutes(t, a, b) {
  let n = 0;
  const span = t.on - t.off;
  for (let s = t.out; s < t.in; s += 60000) {
    const m = s + 30000;
    const f = span > 0 ? Math.min(Math.max((m - t.off) / span, 0), 1) : 0;
    const p = gcPoint(a, b, f);
    if (sunAlt(m, p.lat, p.lon) < -6) n++;
  }
  return n;
}

// FAA 61.57(b): 1 hr after sunset to 1 hr before sunrise.
function isNightOp(ms, ap) {
  const H = 3600000;
  return sunAlt(ms - H, ap.lat, ap.lon) < -0.833 && sunAlt(ms + H, ap.lat, ap.lon) < -0.833;
}

// Local calendar date (YYYY-MM-DD) of a UTC instant in an IANA zone.
function localDate(ms, tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch (e) {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function hhmm(v) {
  const s = String(v || '').replace(/[^0-9]/g, '');
  if (s.length < 3 || s.length > 4) return null;
  const p = s.padStart(4, '0'), h = +p.slice(0, 2), m = +p.slice(2);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

// Turn the logged date (local date at the departure airport) + HHMM UTC strings into instants.
function resolveTimes(f) {
  const out = hhmm(f.out);
  if (!f.date || out == null) return null;
  const dep = AP[f.from];
  const base = Date.parse(f.date + 'T00:00:00Z');
  let outMs = base + out * 60000;
  if (dep) {
    // pick the UTC day whose local date at the origin matches the logged date
    for (const d of [0, 1, -1]) {
      const c = base + d * 86400000 + out * 60000;
      if (localDate(c, dep.tz) === f.date) { outMs = c; break; }
    }
  }
  const after = (prev, v) => { if (v == null) return null; let c = prev - (prev % 86400000) + v * 60000; while (c < prev) c += 86400000; return c; };
  const t = { out: outMs };
  t.off = after(t.out, hhmm(f.off));
  t.on = t.off != null ? after(t.off, hhmm(f.on)) : null;
  t.in = after(t.on ?? t.off ?? t.out, hhmm(f.in));
  const crew = hhmm(f.crew);
  if (crew != null) { let c = t.out - (t.out % 86400000) + crew * 60000; while (c > t.out) c -= 86400000; t.crew = c; }
  return t;
}

const hrs = (min) => Math.round(min / 60 * 100) / 100;

function compute(f) {
  const t = resolveTimes(f);
  const a = AP[f.from], b = AP[f.to];
  const r = { ok: false, t, missing: [] };
  if (!a) r.missing.push('departure airport');
  if (!b) r.missing.push('arrival airport');
  if (!t || t.off == null || t.on == null || t.in == null) r.missing.push('OOOI times');
  if (r.missing.length) return r;
  const startMs = t.crew ?? t.out;
  r.totalMin = Math.round((t.in - startMs) / 60000);
  r.blockMin = Math.round((t.in - t.out) / 60000);
  r.airMin = Math.round((t.on - t.off) / 60000);
  r.total = hrs(r.totalMin);
  r.nightMin = nightMinutes(t, a, b);
  r.night = hrs(r.nightMin);
  r.nightTO = isNightOp(t.off, a);
  r.nightLdg = isNightOp(t.on, b);
  r.distNm = Math.round(distNm(a, b));
  const pf = f.duty === 'PF';
  r.landings = pf ? 1 : 0;
  r.fsNight = pf && r.nightLdg ? 1 : 0;
  r.fsDay = pf && !r.nightLdg ? 1 : 0;
  r.takeoffs = pf ? 1 : 0;
  r.nightTakeoffs = pf && r.nightTO ? 1 : 0;
  r.ok = true;
  return r;
}

// ---- MyFlightbook CSV ----
const CSV_COLS = ['Date', 'Tail Number', 'Model', 'Approaches', 'Hold', 'Landings', 'FS Night Landings', 'FS Day Landings', 'X-Country', 'Night', 'IMC', 'Simulated Instrument', 'Ground Simulator', 'Dual Received', 'CFI', 'SIC', 'PIC', 'Total Flight Time', 'Route', 'Comments', 'Aircraft Registration', 'Flight Number', 'Crew Start Time (UTC)', 'Block Out Time', 'Engine Start', 'Flight Start', 'Flight End', 'Engine End', 'Block In Time', 'Takeoffs (any)', 'Takeoffs - Night'];

function mfbTime(ms) {
  if (ms == null) return '';
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function mfbDate(iso) { const [y, m, d] = iso.split('-'); return `${+m}/${+d}/${y}`; }
const num = (v) => (v ? String(v) : '');

function csvRow(f, cfg) {
  const r = compute(f);
  if (!r.ok) return null;
  const t = r.t, tot = r.total.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
  const seat = f.seat || cfg.seat || 'PIC';
  const row = {
    'Date': mfbDate(f.date), 'Tail Number': cfg.anonTail, 'Model': cfg.model,
    'Approaches': String(f.approaches || 0), 'Landings': String(r.landings),
    'FS Night Landings': String(r.fsNight), 'FS Day Landings': String(r.fsDay),
    'X-Country': tot, 'Night': r.nightMin ? r.night.toFixed(2).replace(/0$/, '').replace(/\.$/, '') : '',
    'SIC': seat === 'SIC' ? tot : '', 'PIC': seat === 'PIC' ? tot : '', 'Total Flight Time': tot,
    'Route': `${f.from} ${f.to}`, 'Comments': f.comments || '',
    'Aircraft Registration': f.tail || '', 'Flight Number': f.flightNumber || '',
    'Crew Start Time (UTC)': mfbTime(t.crew), 'Block Out Time': mfbTime(t.out), 'Engine Start': mfbTime(t.out),
    'Flight Start': mfbTime(t.off), 'Flight End': mfbTime(t.on), 'Engine End': mfbTime(t.in), 'Block In Time': mfbTime(t.in),
    'Takeoffs (any)': num(r.takeoffs), 'Takeoffs - Night': num(r.nightTakeoffs),
  };
  return csvLayout(cfg).cols.map((c) => csvCell(row[c] ?? '')).join(',');
}
const csvCell = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
// Columns to write and their header text (cfg.csvOff / cfg.csvNames); defaults to CSV_COLS as-is.
function csvLayout(cfg) {
  const off = new Set(cfg.csvOff || []), names = cfg.csvNames || {};
  const cols = CSV_COLS.filter((c) => !off.has(c));
  return { cols, headers: cols.map((c) => (names[c] || '').trim() || c) };
}

function buildCsv(flights, cfg) {
  const rows = flights.slice().sort((a, b) => (a.date + (a.out || '')).localeCompare(b.date + (b.out || ''))).map((f) => csvRow(f, cfg)).filter(Boolean);
  return csvLayout(cfg).headers.map(csvCell).join(',') + '\n' + rows.join('\n') + (rows.length ? '\n' : '');
}
