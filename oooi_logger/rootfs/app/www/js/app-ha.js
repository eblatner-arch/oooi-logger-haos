'use strict';
// OOOI Flight Logger — Home Assistant add-on front end. Data lives on the add-on (see server.py).
const api = async (method, path, body, raw) => {
  const opts = { method, headers: {} };
  if (raw) { opts.body = raw; opts.headers['Content-Type'] = raw.type || 'application/octet-stream'; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  let r;
  try { r = await fetch(path, opts); } catch (_) { throw new Error('Cannot reach Home Assistant. Check your connection.'); }
  if (r.status === 401) { location.replace('./'); throw new Error('Log in again.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
};
// ---------- UI helpers ----------
const $ = (id) => document.getElementById(id);
const FIELDS = ['date', 'flightNumber', 'tail', 'from', 'to', 'crew', 'out', 'off', 'on', 'in', 'comments'];
const S = {
  duty: 'PF', seat: 'PIC', editId: null, flights: [],
  cfg: { seat: 'PIC', anonTail: '#002377', model: 'B737' },
  drive: {}, scan: {}, scannedTrip: null, poll: null,
};
const fmtHM = (min) => (min == null || isNaN(min) ? '--:--' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), 3200); }
const fltNo = (n) => `Flt ${n}`;
// Times on screen are hours:minutes (3:10) unless Settings → Show hours as is set to decimal.
// The CSVs always use decimal hours, which is what MyFlightbook imports.
const fmtMin = (min) => {
  const m = Math.max(0, Math.round(+min || 0));
  if (S.cfg.timeFmt === 'dec') return (m / 60).toFixed(2);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
// CSV columns that hold hours (edit boxes show and accept H:MM for these).
const HOUR_SRC = new Set(['X-Country', 'Night', 'SIC', 'PIC', 'Total Flight Time', 'Block Time (OUT to IN)', 'Air Time (OFF to ON)']);
const decToMin = (v) => (/^\d*\.?\d+$/.test(String(v).trim()) ? Math.round(parseFloat(v) * 60) : null);
// "1:16" → "1.27" for the CSV; anything else is kept as typed.
const toCsvHours = (v) => {
  const m = /^(\d+):([0-5]?\d)$/.exec(String(v).trim());
  if (!m) return String(v).trim();
  return (Math.round(((+m[1] * 60 + +m[2]) / 60) * 100) / 100).toFixed(2).replace(/0$/, '').replace(/\.$/, '');
};
const showHours = (v) => { const m = decToMin(v); return m == null ? String(v) : fmtMin(m); };
function setSeg(segId, v) { for (const b of $(segId).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === v)); }

function readForm() {
  const f = {};
  for (const k of FIELDS) f[k] = $(k).value.trim();
  f.from = f.from.toUpperCase(); f.to = f.to.toUpperCase(); f.tail = f.tail.toUpperCase();
  for (const k of ['crew', 'out', 'off', 'on', 'in']) f[k] = f[k].replace(/[^0-9]/g, '');
  f.approaches = 0; f.duty = S.duty; f.seat = S.seat;
  f.extra = {}; f.override = {};
  for (const el of $('customFields').querySelectorAll('input')) {
    const v = el.value.trim(); if (!v) continue;
    if (el.dataset.kind === 'field') f.extra[el.dataset.key] = v; else f.override[el.dataset.key] = HOUR_SRC.has(el.dataset.src) ? toCsvHours(v) : v;
  }
  return f;
}
// Boxes under Comments: added "fill in" columns, plus any column ticked "Edit" in
// Settings → CSV columns. Edit boxes show the automatic value as grey placeholder
// text; typing overrides it for this flight, clearing it goes back to automatic.
function logBoxes() {
  const show = new Set(S.cfg.csvShow || []), off = new Set(S.cfg.csvOff || []), names = S.cfg.csvNames || {}, out = [];
  for (const c of S.csvCols || CSV_COLS) if (show.has(c) && !off.has(c) && !ON_LOG_SCREEN.has(c)) out.push({ kind: 'ov', key: c, label: (names[c] || '').trim() || c });
  for (const x of S.cfg.csvExtra || []) {
    if (x.source === 'field') out.push({ kind: 'field', key: x.id, label: x.name, def: x.text || '' });
    else if (show.has(x.id)) out.push({ kind: 'ov', key: x.id, label: x.name, src: x.source, text: x.text || '' });
  }
  return out;
}
function renderCustomFields() {
  const box = $('customFields'), boxes = logBoxes();
  const sig = JSON.stringify(boxes);
  if (box.dataset.sig === sig) return;           // unchanged: keep whatever is typed
  const keep = {}; for (const el of box.querySelectorAll('input')) keep[el.dataset.kind + ':' + el.dataset.key] = el.value;
  box.dataset.sig = sig; box.innerHTML = ''; box.hidden = !boxes.length;
  for (const b of boxes) {
    const wrap = document.createElement('div'); wrap.className = 'field';
    const id = 'cf_' + b.kind + '_' + b.key.replace(/[^A-Za-z0-9]/g, '_');
    const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = b.label;
    const inp = document.createElement('input'); inp.id = id; inp.autocomplete = 'off';
    inp.dataset.kind = b.kind; inp.dataset.key = b.key;
    if (b.kind === 'field') { inp.dataset.def = b.def; inp.placeholder = b.def ? '' : 'Optional'; }
    else { inp.className = 'mono'; inp.dataset.src = b.src || b.key; if (HOUR_SRC.has(b.src || b.key)) inp.inputMode = 'text'; inp.dataset.text = b.text || ''; inp.dataset.isText = b.src === 'text' ? '1' : ''; }
    const k = b.kind + ':' + b.key;
    inp.value = k in keep ? keep[k] : (b.kind === 'field' && !S.editId ? b.def : '');
    const mark = () => inp.classList.toggle('edited', inp.dataset.kind === 'ov' && !!inp.value.trim());
    inp.addEventListener('input', () => { mark(); update(); }); mark();
    wrap.append(lab, inp); box.appendChild(wrap);
  }
}
function fillCustomFields(f) {
  // f: the flight being edited, or a new-flight stub (no id: fill-in boxes get their defaults)
  const isNew = !f.id, extra = f.extra || {}, ov = f.override || {};
  for (const el of $('customFields').querySelectorAll('input')) {
    if (el.dataset.kind === 'field') el.value = isNew ? el.dataset.def : (extra[el.dataset.key] ?? '');
    else el.value = ov[el.dataset.key] != null ? (HOUR_SRC.has(el.dataset.src) ? showHours(ov[el.dataset.key]) : ov[el.dataset.key]) : '';
    el.classList.toggle('edited', el.dataset.kind === 'ov' && !!el.value.trim());
  }
}
// Keep each edit box's grey placeholder showing the value that will be logged automatically.
// Values that don't depend on the flight (tail number, model, fixed text) show even before it's complete.
function refreshAutoValues(f) {
  const full = csvValues(f, S.cfg), vals = full || { 'Tail Number': S.cfg.anonTail, 'Model': S.cfg.model };
  for (const el of $('customFields').querySelectorAll('input[data-kind="ov"]')) {
    const auto = el.dataset.isText ? el.dataset.text : vals[el.dataset.src];
    el.placeholder = auto != null && auto !== '' ? (HOUR_SRC.has(el.dataset.src) && !el.dataset.isText ? showHours(auto) : String(auto)) : full ? '(blank)' : 'Auto';
  }
}
function fillForm(f) {
  for (const k of FIELDS) $(k).value = f[k] ?? '';
  fillCustomFields(f);
  S.duty = f.duty || 'PF'; S.seat = f.seat || S.cfg.seat; setSeg('dutySeg', S.duty); setSeg('seatSeg', S.seat);
  update();
}
function formIsEmpty() { const f = readForm(); return !f.flightNumber && !f.tail && !f.from && !f.to && !f.out && !f.off && !f.on && !f.in && !f.crew && !f.comments; }
function newFlight(keepDate) {
  S.editId = null; S.scannedTrip = null;
  fillForm({ date: keepDate ? $('date').value || todayLocal() : todayLocal(), duty: 'PF', seat: S.cfg.seat });
  $('photo').value = ''; $('thumb').hidden = true; $('scanMsg').hidden = true;
  $('editBanner').hidden = true; $('delBtn').hidden = true; $('delConfirm').hidden = true;
  $('saveBtn').textContent = 'Save flight';
}
function apLabel(code) {
  if (!code || code.length < 4) return '';
  const a = AP[code];
  return a ? `${a.lat.toFixed(2)}°, ${a.lon.toFixed(2)}°` : 'Unknown airport. Use the 4-letter ICAO code.';
}

function update() {
  const f = readForm();
  $('fromName').textContent = apLabel(f.from);
  $('toName').textContent = apLabel(f.to);
  $('cduRoute').textContent = `${f.from || '----'}/${f.to || '----'}`;
  const r = compute(f), t = r.t;
  const block = t && t.in != null ? Math.round((t.in - t.out) / 60000) : null;
  const air = t && t.on != null && t.off != null ? Math.round((t.on - t.off) / 60000) : null;
  $('blockLine').textContent = `BLOCK ${fmtHM(block)}  AIR ${fmtHM(air)}`;
  const trip = t && t.in != null ? Math.round((t.in - (t.crew ?? t.out)) / 60000) : null;
  const tc = $('tripCheck');
  if (trip != null && S.scannedTrip != null) {
    const ok = S.scannedTrip === trip; tc.innerHTML = '';
    const sp = document.createElement('span'); sp.className = ok ? 'ok' : 'no';
    sp.textContent = ok ? `TRIP ${fmtHM(trip)} ✓ MATCHES ACARS` : `TRIP ${fmtHM(trip)} ≠ ACARS ${fmtHM(S.scannedTrip)}`;
    tc.appendChild(sp);
  } else tc.textContent = `TRIP ${fmtHM(trip)}`;

  refreshAutoValues(f);
  const out = $('calcOut'); out.innerHTML = '';
  if (!r.ok) {
    const p = document.createElement('p'); p.className = 'missing'; p.style.margin = '0'; p.textContent = 'Waiting for ' + r.missing.join(', ') + '.'; out.appendChild(p);
    return r;
  }
  const calc = document.createElement('div'); calc.className = 'calc';
  for (const [v, l] of [[fmtMin(r.totalMin), `Total · ${S.seat} · XC`], [fmtMin(r.nightMin), 'Night'], [`${r.distNm}`, 'Distance nm']]) {
    const s = document.createElement('div'); s.className = 'stat'; const b = document.createElement('b'); b.textContent = v; const sp = document.createElement('span'); sp.textContent = l; s.append(b, sp); calc.appendChild(s);
  }
  const chips = document.createElement('div'); chips.className = 'chips'; chips.style.marginTop = '12px';
  const chip = (txt, cls) => { const c = document.createElement('span'); c.className = 'chip ' + (cls || ''); c.textContent = txt; chips.appendChild(c); };
  if (S.duty === 'PF') { chip(r.nightTO ? 'Night takeoff' : 'Day takeoff', r.nightTO ? 'night' : 'day'); chip(r.nightLdg ? 'Night FS landing' : 'Day FS landing', r.nightLdg ? 'night' : 'day'); }
  else chip('PM · no takeoff or landing');
  if (f.flightNumber) chip(fltNo(f.flightNumber));
  if (f.tail) chip(f.tail);
  out.append(calc, chips);
  return r;
}

// ---------- Tabs ----------
function show(view) {
  for (const v of ['log', 'list', 'stats', 'map', 'night', 'set']) $('view-' + v).hidden = v !== view;
  for (const v of ['log', 'list', 'stats', 'map', 'set']) $('tab-' + v).setAttribute('aria-selected', String(v === view || (view === 'night' && v === 'log')));
  $('savebar').hidden = view !== 'log';
  if (view === 'log') update();
  if (view === 'list') renderList();
  if (view === 'night') renderNight();
  if (view === 'stats') renderStats();
  if (view === 'map') renderMap();
  if (view === 'set') renderSettings();
  window.scrollTo(0, 0);
}
for (const v of ['log', 'list', 'stats', 'map', 'set']) $('tab-' + v).onclick = () => show(v);
$('nightBack').onclick = () => show('log');
$('showWork').onclick = () => show('night');
for (const k of FIELDS) $(k).addEventListener('input', update);
$('date').addEventListener('change', update);
$('dutySeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.duty = b.dataset.v; setSeg('dutySeg', S.duty); update(); };
$('seatSeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.seat = b.dataset.v; setSeg('seatSeg', S.seat); update(); };
$('defSeatSeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; setSeg('defSeatSeg', b.dataset.v); };
$('cancelEdit').onclick = () => newFlight(false);


// ---------- Scan (Gemini runs on the add-on) ----------
function downscale(file, max) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
    img.src = url;
  });
}
const blobToB64 = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(b); });


async function scanViaAddon(file) {
  const blob = await downscale(file, 1600);
  return api('POST', 'api/scan', undefined, blob);
}
$('photo').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const msg = $('scanMsg');
  try { $('thumb').src = URL.createObjectURL(file); $('thumb').hidden = false; } catch (_) {}
  if (!S.scan.configured) { msg.className = 'msg warn'; msg.textContent = 'Add gemini_api_key in the add-on Configuration tab to scan. You can type the times in below.'; msg.hidden = false; return; }
  msg.className = 'msg'; msg.textContent = 'Reading the ACARS page…'; msg.hidden = false;
  try {
    const d = await scanViaAddon(file);
    const clean = (v, re) => (v == null ? '' : String(v).replace(/Ø/g, '0').toUpperCase().replace(re, ''));
    const got = {
      flightNumber: clean(d.flightNumber, /[^0-9]/g), from: clean(d.from, /[^A-Z0-9]/g).slice(0, 4), to: clean(d.to, /[^A-Z0-9]/g).slice(0, 4),
      crew: clean(d.crew, /[^0-9]/g), out: clean(d.out, /[^0-9]/g), off: clean(d.off, /[^0-9]/g), on: clean(d.on, /[^0-9]/g), in: clean(d.in, /[^0-9]/g),
    };
    let filled = 0;
    for (const [k, v] of Object.entries(got)) if (v) { $(k).value = v; filled++; }
    const tm = /^(\d{1,2}):?(\d{2})$/.exec(String(d.trip || '').replace(/Ø/g, '0'));
    S.scannedTrip = tm ? +tm[1] * 60 + +tm[2] : null;
    const r = update();
    if (!filled) { msg.className = 'msg bad'; msg.textContent = d.notes ? `No OOOI values found: ${d.notes}` : 'No OOOI values found in that photo.'; return; }
    const trip = r.t && r.t.in != null ? Math.round((r.t.in - (r.t.crew ?? r.t.out)) / 60000) : null;
    const tripOk = trip != null && S.scannedTrip === trip;
    if (tripOk && d.confidence !== 'low') { msg.className = 'msg good'; msg.textContent = 'Read the page. CREW→IN matches the TRIP time, so the times check out. Add the registration and set PF or PM.'; }
    else { msg.className = 'msg warn'; msg.textContent = (S.scannedTrip != null && trip != null && !tripOk ? 'CREW→IN does not match the TRIP time on the page. ' : '') + 'Check every value against the screen before saving.' + (d.notes ? ' ' + d.notes : ''); }
    if (!$('tail').value) $('tail').focus({ preventScroll: true });
  } catch (err) { msg.className = 'msg bad'; msg.textContent = (err && err.message) || 'The scan did not finish. Try again, or type the times in.'; }
});


// ---------- Flights ----------
function validate(f, r) {
  if (!f.date) return 'Pick the date.';
  if (!r.ok) return 'Missing ' + r.missing.join(', ') + '.';
  if (r.blockMin <= 0 || r.blockMin > 20 * 60) return 'Block time looks wrong. Check OUT and IN.';
  if (r.airMin <= 0 || r.airMin > r.blockMin) return 'Air time looks wrong. Check OFF and ON.';
  if (!f.tail) return 'Add the aircraft registration.';
  return null;
}


$('saveBtn').onclick = async () => {
  const f = readForm(), r = compute(f), err = validate(f, r);
  if (err) { toast(err); return; }
  $('saveBtn').disabled = true;
  try {
    const id = S.editId || `${f.date}_${f.flightNumber || 'x'}_${f.out}_${Math.random().toString(36).slice(2, 6)}`;
    await api('PUT', 'api/flights/' + encodeURIComponent(id), f);
    const wasEdit = !!S.editId;
    toast(wasEdit ? 'Flight updated' : 'Flight saved');
    await refresh();
    newFlight(true);
    if (wasEdit) show('list');
    watchSync();
  } catch (e) { toast(e.message); }
  finally { $('saveBtn').disabled = false; }
};
$('delBtn').onclick = () => { $('delConfirm').hidden = false; $('delConfirm').scrollIntoView({ block: 'center' }); };
$('delNo').onclick = () => { $('delConfirm').hidden = true; };
$('delYes').onclick = async () => {
  try { await api('DELETE', 'api/flights/' + encodeURIComponent(S.editId)); toast('Flight deleted'); await refresh(); newFlight(false); show('list'); watchSync(); }
  catch (e) { toast(e.message); }
};
function editFlight(id) {
  const f = S.flights.find((x) => x.id === id); if (!f) return;
  S.editId = id; S.scannedTrip = null; fillForm(f);
  $('photo').value = ''; $('thumb').hidden = true; $('scanMsg').hidden = true; $('delConfirm').hidden = true;
  $('editBanner').hidden = false; $('editWhat').textContent = `${f.date} ${f.from}–${f.to}`;
  $('delBtn').hidden = false; $('saveBtn').textContent = 'Save changes';
  show('log');
}

function renderList() {
  const list = $('list'); list.innerHTML = '';
  const fl = S.flights.slice().sort((a, b) => (b.date + (b.out || '')).localeCompare(a.date + (a.out || '')));
  const pending = fl.filter((x) => !x.imported);
  const sumM = (arr) => arr.reduce((s, x) => { const r = compute(x); return s + (r.ok ? r.totalMin : 0); }, 0);
  const sm = $('summary'); sm.innerHTML = '';
  for (const [v, l] of [[String(pending.length), 'Pending import'], [fmtMin(sumM(pending)), 'Pending hours'], [String(fl.length), 'Flights logged']]) {
    const s = document.createElement('div'); s.className = 'stat'; const b = document.createElement('b'); b.textContent = v; const sp = document.createElement('span'); sp.textContent = l; s.append(b, sp); sm.appendChild(s);
  }
  $('markImported').disabled = !pending.length; $('saveCsv').disabled = !pending.length;
  if (!fl.length) { list.innerHTML = '<div class="empty"><b>No flights yet</b><span>Scan an OOOI page on the Log tab. Saved flights show up here, in /share/oooi_logger, and in Drive.</span></div>'; return; }
  let month = '';
  for (const f of fl) {
    const d = new Date(f.date + 'T12:00:00Z');
    const m = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (m !== month) { month = m; const h = document.createElement('div'); h.className = 'month'; h.textContent = m; list.appendChild(h); }
    const r = compute(f);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'flight';
    const left = document.createElement('div');
    const route = document.createElement('div'); route.className = 'route'; route.textContent = `${f.from}–${f.to}`;
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = `${d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })} · ${f.flightNumber ? fltNo(f.flightNumber) : '—'} · ${f.tail || 'no reg'}`;
    left.append(route, meta);
    const tm = document.createElement('div'); tm.className = 'time'; tm.textContent = r.ok ? fmtMin(r.totalMin) : '—';
    const chips = document.createElement('div'); chips.className = 'chips';
    const chip = (t, c) => { const s = document.createElement('span'); s.className = 'chip ' + (c || ''); s.textContent = t; chips.appendChild(s); };
    chip(f.duty || 'PF', f.duty === 'PM' ? '' : 'pf');
    if (r.ok && r.nightMin) chip(`Night ${fmtMin(r.nightMin)}`, 'night');
    if (r.ok && f.duty === 'PF' && r.nightLdg) chip('Night ldg', 'night');
    chip(f.imported ? 'Imported' : 'Pending', f.imported ? 'ok' : 'pend');
    b.append(left, tm, chips);
    b.onclick = () => editFlight(f.id);
    list.appendChild(b);
  }
}


$('markImported').onclick = () => { const n = S.flights.filter((x) => !x.imported).length; $('impText').textContent = `Mark ${n} pending flight${n === 1 ? '' : 's'} as imported? Do this after MyFlightbook accepts the pending CSV.`; $('impConfirm').hidden = false; };
$('impNo').onclick = () => { $('impConfirm').hidden = true; };
$('impYes').onclick = async () => {
  $('impConfirm').hidden = true;
  try { const j = await api('POST', 'api/flights/mark-imported'); toast(`${j.count} marked imported`); await refresh(); renderList(); watchSync(); }
  catch (e) { toast(e.message); }
};
$('saveCsv').onclick = async () => {
  try {
    const r = await fetch('api/csv/pending'); const blob = await r.blob();
    const name = `MyFlightbook Import ${todayLocal()}.csv`;
    const file = new File([blob], name, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  } catch (_) { toast('Could not get the CSV. It is also in /share/oooi_logger.'); }
};

// ---------- Drive status ----------
function setSync(state, text) { $('syncDot').className = 'dot ' + state; $('syncText').textContent = text; }
function statusLine() {
  const d = S.drive;
  if (!d.configured) return setSync('warn', 'Saved on Home Assistant · Drive not set up');
  if (!d.connected) return setSync('warn', 'Saved on Home Assistant · Connect Google');
  if (d.syncing) return setSync('', 'Syncing to Drive…');
  if (d.last_error) return setSync('bad', 'Drive sync failed · see Settings');
  if (d.last_sync) return setSync('ok', 'Drive synced ' + new Date(d.last_sync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
  return setSync('', 'Connected to Drive');
}
async function refresh() {
  const st = await api('GET', 'api/state');
  const before = histCacheKey(), wasWaiting = !$('statsLoading').hidden || !$('mapLoading').hidden;
  applyState(st);
  S.loaded = true;
  PC.set('state', st);
  // First load finished, or history changed on Home Assistant (new import or airport update):
  // redraw an open Stats or Map. Otherwise leave them alone so a search being typed isn't reset.
  if (wasWaiting || histCacheKey() !== before) {
    if (!$('view-stats').hidden) renderStats();
    if (!$('view-map').hidden) renderMap();
  }
  return st;
}
function applyState(st) {
  S.flights = st.flights || [];
  S.drive = st.drive || {}; S.scan = st.scan || {}; S.airports = st.airports || {};
  S.historyInfo = st.history || null;
  const s = st.settings || {};
  S.cfg = { seat: s.seat || 'PIC', anonTail: s.anon_tail || '#002377', model: s.model || 'B737', csvNames: s.csv_names || {}, csvOff: s.csv_off || [], csvExtra: s.csv_extra || [], csvShow: s.csv_show || [], timeFmt: s.time_fmt === 'dec' ? 'dec' : 'hm' };
  S.csvCols = st.csv_columns || CSV_COLS;
  renderCustomFields();
  if (!$('view-log').hidden) update(); S.csvSources = st.csv_sources || CSV_SOURCES;
  statusLine();
  if (!$('view-set').hidden) renderSettings();
  if (!$('view-list').hidden) renderList();
}
// After a change the add-on uploads to Drive a couple of seconds later; check back briefly.
function watchSync() {
  let n = 0; clearInterval(S.watch);
  S.watch = setInterval(async () => { n++; try { await refresh(); } catch (_) {} if (n >= 6 || (!S.drive.syncing && n >= 3)) clearInterval(S.watch); }, 1500);
}
$('syncNow').onclick = async () => {
  if (!S.drive.connected) { show('set'); toast('Connect Google first.'); return; }
  setSync('', 'Syncing to Drive…');
  try { await api('POST', 'api/drive/sync'); toast('Drive files updated'); } catch (e) { toast(e.message); }
  refresh().catch(() => {});
};
$('syncDrive2').onclick = () => $('syncNow').onclick();

// ---------- Settings ----------
function renderSettings() {
  renderColumns(); renderHistoryCard();
  $('histPick').textContent = S.historyInfo ? 'Replace with a new export' : 'Import MyFlightbook logbook';
  setSeg('defSeatSeg', S.cfg.seat); setSeg('timeFmtSeg', S.cfg.timeFmt); $('anonTail').value = S.cfg.anonTail; $('model').value = S.cfg.model;
  const d = S.drive, info = $('driveInfo'); info.innerHTML = '';
  const p = d.pending;
  $('devCode').hidden = !p;
  $('cancelCode').hidden = !p;
  if (p) { $('devUser').textContent = p.user_code; $('devUrl').href = p.verification_url || 'https://www.google.com/device'; $('devUrl').textContent = (p.verification_url || 'https://www.google.com/device').replace(/^https?:\/\//, ''); $('devWait').textContent = p.error || 'Waiting for you to approve…'; }
  if (!d.configured) {
    info.textContent = 'To upload to Drive, add google_client_id and google_client_secret in the add-on Configuration tab, then restart the add-on. Files are still written to /share/oooi_logger.';
    $('connectGoogle').hidden = true; $('signOut').hidden = true; $('syncDrive2').hidden = true;
  } else if (d.connected) {
    info.textContent = `Connected${d.email ? ' as ' + d.email : ''}. Files go to the "${d.folder}" folder in your Drive. ` + (d.last_sync ? `Last synced ${new Date(d.last_sync).toLocaleString()}.` : 'Not synced yet.') + (d.last_error ? ' ' + d.last_error : '');
    if (d.folder_id) { info.append(' '); const a = document.createElement('a'); a.href = `https://drive.google.com/drive/folders/${encodeURIComponent(d.folder_id)}`; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open folder'; info.appendChild(a); }
    $('connectGoogle').hidden = !!p; $('connectGoogle').textContent = 'Reconnect Google'; $('signOut').hidden = !!p; $('syncDrive2').hidden = !!p;
  } else {
    info.textContent = (d.last_error ? d.last_error + ' ' : '') + 'Connect your Google account once and the add-on uploads the CSVs to Drive after every change. It can only see files it creates.';
    $('connectGoogle').hidden = !!p; $('connectGoogle').textContent = 'Connect Google'; $('signOut').hidden = true; $('syncDrive2').hidden = true;
  }
  const ap = S.airports || {};
  $('airportInfo').textContent = ap.source === 'updated'
    ? `${(ap.count || 0).toLocaleString()} airports, updated ${new Date(ap.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Downloads the latest open-source airport list (airportsdata on GitHub) to your Home Assistant.`
    : `${(ap.count || 0).toLocaleString()} airports from the copy built into the add-on. Update to download the latest open-source airport list (airportsdata on GitHub) to your Home Assistant.`;
  $('scanInfo').textContent = S.scan.configured
    ? `Gemini is set up in the add-on Configuration (model ${S.scan.model}). Photos go from Home Assistant to Gemini; the key never reaches your phone.`
    : 'Add gemini_api_key (and optionally gemini_model) in the add-on Configuration tab, then restart the add-on to turn on photo scanning.';
  $('aboutLine').textContent = 'Flights are stored on your Home Assistant (included in backups), written to /share/oooi_logger, and uploaded to Google Drive when connected.';
}
// Takes effect immediately; it only changes how Stats shows hours, never the CSVs.
for (const b of $('timeFmtSeg').querySelectorAll('button')) b.onclick = async () => {
  const v = b.dataset.v; setSeg('timeFmtSeg', v); S.cfg.timeFmt = v; renderHistoryCard(); update();
  try { await api('PUT', 'api/settings', { time_fmt: v }); } catch (e) { toast(e.message); }
};
$('saveSettings').onclick = async () => {
  const seat = $('defSeatSeg').querySelector('[aria-pressed="true"]').dataset.v;
  try {
    await api('PUT', 'api/settings', { seat, anon_tail: $('anonTail').value.trim() || '#002377', model: $('model').value.trim() || 'B737' });
    await refresh();
    if (!S.editId) { S.seat = seat; setSeg('seatSeg', seat); update(); }
    toast('Settings saved'); watchSync();
  } catch (e) { toast(e.message); }
};
// ---------- CSV columns ----------
function renderColumns(force) {
  const cfg = S.cfg, box = $('csvCols');
  if (!force && (S.colsDirty || $('csvCard').contains(document.activeElement))) return; // don't wipe unsaved edits
  S.colsDirty = false;
  box.innerHTML = '';
  const off = new Set(cfg.csvOff || []), names = cfg.csvNames || {}, show = new Set(cfg.csvShow || []);
  for (const c of S.csvCols || CSV_COLS) {
    const row = document.createElement('div'); row.className = 'colrow';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !off.has(c); cb.dataset.col = c;
    cb.setAttribute('aria-label', `Include ${c}`);
    const inp = document.createElement('span'); inp.className = 'colname'; inp.textContent = c;
    let vis;
    if (ON_LOG_SCREEN.has(c)) { vis = document.createElement('span'); vis.className = 'onscreen'; vis.textContent = '✓'; vis.title = 'Already on the Log screen'; }
    else { vis = document.createElement('input'); vis.type = 'checkbox'; vis.className = 'showcb'; vis.checked = show.has(c); vis.dataset.show = c; vis.setAttribute('aria-label', `Edit ${c} on the Log screen`); }
    const sync = () => { row.classList.toggle('off', !cb.checked); if (vis.tagName === 'INPUT') vis.disabled = !cb.checked; }; cb.onchange = sync; sync();
    row.append(cb, inp, vis); box.appendChild(row);
  }
  const ex = $('csvExtra'); ex.innerHTML = '';
  for (const x of cfg.csvExtra || []) addExtraRow(x);
}
function addExtraRow(x) {
  x = x || { name: '', source: 'field', text: '' };
  const row = document.createElement('div'); row.className = 'extrarow';
  row.dataset.cid = x.id || 'c' + Math.random().toString(16).slice(2, 10);
  const showLab = document.createElement('label'); showLab.className = 'x-show';
  const showCb = document.createElement('input'); showCb.type = 'checkbox'; showCb.checked = (S.cfg.csvShow || []).includes(row.dataset.cid);
  showLab.append(showCb, document.createTextNode(' Editable on the Log screen'));
  const name = document.createElement('input'); name.type = 'text'; name.className = 'x-name'; name.value = x.name || '';
  name.placeholder = 'Header name'; name.autocomplete = 'off'; name.spellcheck = false; name.setAttribute('aria-label', 'Header name');
  const src = document.createElement('select'); src.className = 'x-src'; src.setAttribute('aria-label', 'Value');
  const o = (v, t, parent) => { const e = document.createElement('option'); e.value = v; e.textContent = t; (parent || src).appendChild(e); };
  o('field', 'Fill in on the Log screen');
  o('text', 'Same text on every flight');
  const g = document.createElement('optgroup'); g.label = 'Copy a value'; src.appendChild(g);
  for (const c of S.csvSources || CSV_SOURCES) o(c, c, g);
  src.value = x.source || 'text';
  const text = document.createElement('input'); text.type = 'text'; text.className = 'x-text'; text.value = x.text || '';
  text.placeholder = 'Text, e.g. IFR'; text.autocomplete = 'off'; text.setAttribute('aria-label', 'Text for every flight');
  const del = document.createElement('button'); del.type = 'button'; del.className = 'btn x-del'; del.textContent = 'Remove';
  del.onclick = () => { row.remove(); S.colsDirty = true; syncMoveButtons(); };
  const move = (dir) => {
    const sib = dir < 0 ? row.previousElementSibling : row.nextElementSibling; if (!sib) return;
    if (dir < 0) sib.before(row); else sib.after(row);
    S.colsDirty = true; syncMoveButtons(); (dir < 0 ? up : down).focus();
  };
  const up = document.createElement('button'); up.type = 'button'; up.className = 'btn x-up'; up.textContent = '↑'; up.setAttribute('aria-label', 'Move up'); up.onclick = () => move(-1);
  const down = document.createElement('button'); down.type = 'button'; down.className = 'btn x-down'; down.textContent = '↓'; down.setAttribute('aria-label', 'Move down'); down.onclick = () => move(1);
  const sync = () => {
    showLab.hidden = src.value === 'field';   // fill-in columns already have their own box on the Log screen
    text.hidden = src.value !== 'text' && src.value !== 'field';
    text.placeholder = src.value === 'field' ? 'Pre-filled value (optional)' : 'Text, e.g. IFR';
    text.setAttribute('aria-label', src.value === 'field' ? 'Pre-filled value' : 'Text for every flight');
  }; src.onchange = () => { sync(); S.colsDirty = true; }; sync();
  const tools = document.createElement('div'); tools.className = 'x-tools'; tools.append(up, down, del);
  row.append(name, src, text, showLab, tools); $('csvExtra').appendChild(row);
  syncMoveButtons();
  return row;
}
function syncMoveButtons() {
  const rows = [...$('csvExtra').querySelectorAll('.extrarow')];
  rows.forEach((r, i) => { r.querySelector('.x-up').disabled = i === 0; r.querySelector('.x-down').disabled = i === rows.length - 1; });
}
function readColumns() {
  const csvNames = {}, csvOff = [], csvShow = [];   // standard headers are fixed to MyFlightbook's names
  for (const el of $('csvCols').querySelectorAll('.colrow input')) {
    const c = el.dataset.col;
    if (el.dataset.show) { if (el.checked) csvShow.push(el.dataset.show); continue; }
    if (!el.checked) csvOff.push(c);
  }
  const csvExtra = [...$('csvExtra').querySelectorAll('.extrarow')].map((r) => ({
    id: r.dataset.cid || '', name: r.querySelector('.x-name').value.trim(), source: r.querySelector('.x-src').value, text: r.querySelector('.x-text').value,
  }));
  for (const r of $('csvExtra').querySelectorAll('.extrarow')) if (r.querySelector('.x-show input').checked && r.querySelector('.x-src').value !== 'field') csvShow.push(r.dataset.cid);
  return { csvNames, csvOff, csvExtra, csvShow };
}
async function saveColumns(c) {
  try {
    await api('PUT', 'api/settings', { csv_names: c.csvNames, csv_off: c.csvOff, csv_extra: c.csvExtra, csv_show: c.csvShow });
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    S.colsDirty = false; await refresh(); renderColumns(true); toast('CSV columns saved'); watchSync();
  } catch (e) { toast(e.message); }
}
$('saveCols').onclick = () => saveColumns(readColumns());
$('csvCard').addEventListener('input', () => { S.colsDirty = true; });
$('addCol').onclick = () => { S.colsDirty = true; addExtraRow().querySelector('.x-name').focus(); };
$('resetCols').onclick = () => {
  const b = $('resetCols');
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to reset'; setTimeout(() => { delete b.dataset.armed; b.textContent = 'Reset to defaults'; }, 3000); return; }
  delete b.dataset.armed; b.textContent = 'Reset to defaults';
  saveColumns({ csvNames: {}, csvOff: [], csvExtra: [], csvShow: [] });
};

$('connectGoogle').onclick = async () => {
  try {
    await api('POST', 'api/drive/connect');
    await refresh(); renderSettings();
    clearInterval(S.poll);
    S.poll = setInterval(async () => {
      try { await refresh(); renderSettings(); } catch (_) {}
      if (!S.drive.pending || S.drive.pending.error) { clearInterval(S.poll); if (S.drive.connected && !S.drive.pending) { toast('Google Drive connected'); watchSync(); } }
    }, 3000);
  } catch (e) { toast(e.message); }
};
$('updateAirports').onclick = async () => {
  const b = $('updateAirports'); b.disabled = true; b.textContent = 'Downloading…';
  try {
    const j = await api('POST', 'api/airports/update');
    toast(`Airport database updated: ${j.count.toLocaleString()} airports`);
    setTimeout(() => location.reload(), 1200);   // reload so this page uses the new list too
  } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Update airport database'; }
};
$('copyCode').onclick = async () => { try { await navigator.clipboard.writeText($('devUser').textContent); toast('Code copied'); } catch (_) { toast('Select the code and copy it.'); } };
$('cancelCode').onclick = async () => { clearInterval(S.poll); await api('POST', 'api/drive/cancel').catch(() => {}); await refresh(); renderSettings(); };
$('signOut').onclick = async () => { try { await api('POST', 'api/drive/disconnect'); await refresh(); renderSettings(); toast('Disconnected from Google'); } catch (e) { toast(e.message); } };

// ---------- Boot ----------
(async function boot() {
  setupHistoryCard();
  newFlight(false);
  // Draw from the copy on the phone first, then bring it up to date from Home Assistant.
  try {
    const cached = await PC.get('state');
    if (cached && !S.loaded) { applyState(cached); S.loaded = true; statusLine(); if (!S.editId) { S.seat = S.cfg.seat; setSeg('seatSeg', S.seat); update(); } loadHistory().catch(() => {}); }
  } catch (_) {}
  try { await refresh(); if (!S.editId) { S.seat = S.cfg.seat; setSeg('seatSeg', S.seat); update(); } }
  catch (e) { setSync('bad', 'Cannot reach the add-on'); toast(e.message); }
  setInterval(() => { if (document.visibilityState === 'visible') refresh().catch(() => {}); }, 60000);
})();
