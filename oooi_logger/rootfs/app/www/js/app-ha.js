'use strict';
// OOOI Flight Logger — Home Assistant add-on front end. Data lives on the add-on (see server.py).
const api = async (method, path, body, raw) => {
  const opts = { method, headers: {} };
  if (raw) { opts.body = raw; opts.headers['Content-Type'] = raw.type || 'application/octet-stream'; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  let r;
  try { r = await fetch(path, opts); } catch (_) { throw new Error('Cannot reach Home Assistant. Check your connection.'); }
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
function setSeg(segId, v) { for (const b of $(segId).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === v)); }

function readForm() {
  const f = {};
  for (const k of FIELDS) f[k] = $(k).value.trim();
  f.from = f.from.toUpperCase(); f.to = f.to.toUpperCase(); f.tail = f.tail.toUpperCase();
  for (const k of ['crew', 'out', 'off', 'on', 'in']) f[k] = f[k].replace(/[^0-9]/g, '');
  f.approaches = 0; f.duty = S.duty; f.seat = S.seat;
  return f;
}
function fillForm(f) {
  for (const k of FIELDS) $(k).value = f[k] ?? '';
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

  const out = $('calcOut'); out.innerHTML = '';
  if (!r.ok) { const p = document.createElement('p'); p.className = 'missing'; p.style.margin = '0'; p.textContent = 'Waiting for ' + r.missing.join(', ') + '.'; out.appendChild(p); return r; }
  const calc = document.createElement('div'); calc.className = 'calc';
  for (const [v, l] of [[r.total.toFixed(2), `Total · ${S.seat} · XC`], [r.nightMin ? r.night.toFixed(2) : '0', 'Night'], [`${r.distNm}`, 'Distance nm']]) {
    const s = document.createElement('div'); s.className = 'stat'; const b = document.createElement('b'); b.textContent = v; const sp = document.createElement('span'); sp.textContent = l; s.append(b, sp); calc.appendChild(s);
  }
  const chips = document.createElement('div'); chips.className = 'chips'; chips.style.marginTop = '12px';
  const chip = (txt, cls) => { const c = document.createElement('span'); c.className = 'chip ' + (cls || ''); c.textContent = txt; chips.appendChild(c); };
  if (S.duty === 'PF') { chip(r.nightTO ? 'Night takeoff' : 'Day takeoff', r.nightTO ? 'night' : 'day'); chip(r.nightLdg ? 'Night FS landing' : 'Day FS landing', r.nightLdg ? 'night' : 'day'); }
  else chip('PM · no takeoff or landing');
  if (f.flightNumber) chip('UA' + f.flightNumber);
  if (f.tail) chip(f.tail);
  out.append(calc, chips);
  return r;
}

// ---------- Tabs ----------
function show(view) {
  for (const v of ['log', 'list', 'night', 'set']) { $('view-' + v).hidden = v !== view; $('tab-' + v).setAttribute('aria-selected', String(v === view)); }
  $('savebar').hidden = view !== 'log';
  if (view === 'list') renderList();
  if (view === 'night') renderNight();
  if (view === 'set') renderSettings();
  window.scrollTo(0, 0);
}
for (const v of ['log', 'list', 'night', 'set']) $('tab-' + v).onclick = () => show(v);
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
  const sumH = (arr) => arr.reduce((s, x) => { const r = compute(x); return s + (r.ok ? r.total : 0); }, 0);
  const sm = $('summary'); sm.innerHTML = '';
  for (const [v, l] of [[String(pending.length), 'Pending import'], [sumH(pending).toFixed(1), 'Pending hours'], [String(fl.length), 'Flights logged']]) {
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
    meta.textContent = `${d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })} · UA${f.flightNumber || '—'} · ${f.tail || 'no reg'}`;
    left.append(route, meta);
    const tm = document.createElement('div'); tm.className = 'time'; tm.textContent = r.ok ? r.total.toFixed(2) : '—';
    const chips = document.createElement('div'); chips.className = 'chips';
    const chip = (t, c) => { const s = document.createElement('span'); s.className = 'chip ' + (c || ''); s.textContent = t; chips.appendChild(s); };
    chip(f.duty || 'PF', f.duty === 'PM' ? '' : 'pf');
    if (r.ok && r.nightMin) chip(`Night ${r.night.toFixed(2)}`, 'night');
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
  S.flights = st.flights || [];
  S.drive = st.drive || {}; S.scan = st.scan || {};
  const s = st.settings || {};
  S.cfg = { seat: s.seat || 'PIC', anonTail: s.anon_tail || '#002377', model: s.model || 'B737' };
  statusLine();
  if (!$('view-set').hidden) renderSettings();
  if (!$('view-list').hidden) renderList();
  return st;
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
  setSeg('defSeatSeg', S.cfg.seat); $('anonTail').value = S.cfg.anonTail; $('model').value = S.cfg.model;
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
  $('scanInfo').textContent = S.scan.configured
    ? `Gemini is set up in the add-on Configuration (model ${S.scan.model}). Photos go from Home Assistant to Gemini; the key never reaches your phone.`
    : 'Add gemini_api_key (and optionally gemini_model) in the add-on Configuration tab, then restart the add-on to turn on photo scanning.';
  $('aboutLine').textContent = 'Flights are stored on your Home Assistant (included in backups), written to /share/oooi_logger, and uploaded to Google Drive when connected.';
}
$('saveSettings').onclick = async () => {
  const seat = $('defSeatSeg').querySelector('[aria-pressed="true"]').dataset.v;
  try {
    await api('PUT', 'api/settings', { seat, anon_tail: $('anonTail').value.trim() || '#002377', model: $('model').value.trim() || 'B737' });
    await refresh();
    if (!S.editId) { S.seat = seat; setSeg('seatSeg', seat); update(); }
    toast('Settings saved'); watchSync();
  } catch (e) { toast(e.message); }
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
$('copyCode').onclick = async () => { try { await navigator.clipboard.writeText($('devUser').textContent); toast('Code copied'); } catch (_) { toast('Select the code and copy it.'); } };
$('cancelCode').onclick = async () => { clearInterval(S.poll); await api('POST', 'api/drive/cancel').catch(() => {}); await refresh(); renderSettings(); };
$('signOut').onclick = async () => { try { await api('POST', 'api/drive/disconnect'); await refresh(); renderSettings(); toast('Disconnected from Google'); } catch (e) { toast(e.message); } };

// ---------- Boot ----------
(async function boot() {
  newFlight(false);
  try { await refresh(); if (!S.editId) { S.seat = S.cfg.seat; setSeg('seatSeg', S.seat); update(); } }
  catch (e) { setSync('bad', 'Cannot reach the add-on'); toast(e.message); }
  setInterval(() => { if (document.visibilityState === 'visible') refresh().catch(() => {}); }, 60000);
})();
