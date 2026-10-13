"""Flight math for the OOOI logger: night time, day/night takeoffs and landings,
and the MyFlightbook import CSV. Mirrors www/js/core.js exactly."""
import csv
import io
import math
import os
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

RAD = math.pi / 180
_HERE = os.path.dirname(os.path.abspath(__file__))


def _load_airports():
    src = open(os.path.join(_HERE, 'www', 'js', 'airports.js'), encoding='utf-8').read()
    tzs = __import__('json').loads(re.search(r'const AP_TZ=(\[.*?\]);', src, re.S).group(1))
    raw = re.search(r'const AP_RAW="(.*?)";', src, re.S).group(1)
    out = {}
    for e in raw.split(';'):
        lat, lon, tz = e[4:].split(',')
        out[e[:4]] = {'lat': float(lat), 'lon': float(lon), 'tz': tzs[int(tz)]}
    return out


AP = _load_airports()


def sun_alt(ms, lat, lon):
    n = ms / 86400000 + 2440587.5 - 2451545.0
    L = (280.460 + 0.9856474 * n) % 360
    g = ((357.528 + 0.9856003 * n) % 360) * RAD
    lam = (L + 1.915 * math.sin(g) + 0.020 * math.sin(2 * g)) * RAD
    eps = (23.439 - 0.0000004 * n) * RAD
    ra = math.atan2(math.cos(eps) * math.sin(lam), math.cos(lam))
    dec = math.asin(math.sin(eps) * math.sin(lam))
    gmst = (280.46061837 + 360.98564736629 * n) % 360
    H = (gmst + lon) * RAD - ra
    return math.asin(math.sin(lat * RAD) * math.sin(dec) + math.cos(lat * RAD) * math.cos(dec) * math.cos(H)) / RAD


def gc_point(a, b, f):
    la1, lo1, la2, lo2 = a['lat'] * RAD, a['lon'] * RAD, b['lat'] * RAD, b['lon'] * RAD
    d = 2 * math.asin(math.sqrt(math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2))
    if d < 1e-9:
        return a
    A, B = math.sin((1 - f) * d) / math.sin(d), math.sin(f * d) / math.sin(d)
    x = A * math.cos(la1) * math.cos(lo1) + B * math.cos(la2) * math.cos(lo2)
    y = A * math.cos(la1) * math.sin(lo1) + B * math.cos(la2) * math.sin(lo2)
    z = A * math.sin(la1) + B * math.sin(la2)
    return {'lat': math.atan2(z, math.hypot(x, y)) / RAD, 'lon': math.atan2(y, x) / RAD}


def dist_nm(a, b):
    la1, la2, dl = a['lat'] * RAD, b['lat'] * RAD, (b['lon'] - a['lon']) * RAD
    d = 2 * math.asin(math.sqrt(math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dl / 2) ** 2))
    return d * 3440.065


def night_minutes(t, a, b):
    n, span = 0, t['on'] - t['off']
    s = t['out']
    while s < t['in']:
        m = s + 30000
        f = min(max((m - t['off']) / span, 0), 1) if span > 0 else 0
        p = gc_point(a, b, f)
        if sun_alt(m, p['lat'], p['lon']) < -6:
            n += 1
        s += 60000
    return n


def is_night_op(ms, ap):
    H = 3600000
    return sun_alt(ms - H, ap['lat'], ap['lon']) < -0.833 and sun_alt(ms + H, ap['lat'], ap['lon']) < -0.833


def hhmm(v):
    s = re.sub(r'[^0-9]', '', str(v or ''))
    if len(s) < 3 or len(s) > 4:
        return None
    p = s.zfill(4)
    h, m = int(p[:2]), int(p[2:])
    return h * 60 + m if h < 24 and m < 60 else None


def _local_date(ms, tz):
    try:
        return datetime.fromtimestamp(ms / 1000, ZoneInfo(tz)).strftime('%Y-%m-%d')
    except Exception:
        return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime('%Y-%m-%d')


def resolve_times(f):
    out = hhmm(f.get('out'))
    if not f.get('date') or out is None:
        return None
    base = int(datetime.strptime(f['date'], '%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp() * 1000)
    dep = AP.get(f.get('from'))
    out_ms = base + out * 60000
    if dep:
        for d in (0, 1, -1):
            c = base + d * 86400000 + out * 60000
            if _local_date(c, dep['tz']) == f['date']:
                out_ms = c
                break

    def after(prev, v):
        if v is None:
            return None
        c = prev - (prev % 86400000) + v * 60000
        while c < prev:
            c += 86400000
        return c

    t = {'out': out_ms}
    t['off'] = after(t['out'], hhmm(f.get('off')))
    t['on'] = after(t['off'], hhmm(f.get('on'))) if t['off'] is not None else None
    base_in = t['on'] if t['on'] is not None else (t['off'] if t['off'] is not None else t['out'])
    t['in'] = after(base_in, hhmm(f.get('in')))
    crew = hhmm(f.get('crew'))
    t['crew'] = None
    if crew is not None:
        c = t['out'] - (t['out'] % 86400000) + crew * 60000
        while c > t['out']:
            c -= 86400000
        t['crew'] = c
    return t


def compute(f):
    t = resolve_times(f)
    a, b = AP.get(f.get('from')), AP.get(f.get('to'))
    r = {'ok': False, 't': t, 'missing': []}
    if not a:
        r['missing'].append('departure airport')
    if not b:
        r['missing'].append('arrival airport')
    if not t or t['off'] is None or t['on'] is None or t['in'] is None:
        r['missing'].append('OOOI times')
    if r['missing']:
        return r
    start = t['crew'] if t['crew'] is not None else t['out']
    r['total_min'] = round((t['in'] - start) / 60000)
    r['total'] = round(r['total_min'] / 60 * 100) / 100
    r['night_min'] = night_minutes(t, a, b)
    r['night'] = round(r['night_min'] / 60 * 100) / 100
    r['night_to'] = is_night_op(t['off'], a)
    r['night_ldg'] = is_night_op(t['on'], b)
    pf = f.get('duty', 'PF') == 'PF'
    r['landings'] = 1 if pf else 0
    r['fs_night'] = 1 if pf and r['night_ldg'] else 0
    r['fs_day'] = 1 if pf and not r['night_ldg'] else 0
    r['takeoffs'] = 1 if pf else 0
    r['night_takeoffs'] = 1 if pf and r['night_to'] else 0
    r['ok'] = True
    return r


CSV_COLS = ['Date', 'Tail Number', 'Model', 'Approaches', 'Hold', 'Landings', 'FS Night Landings', 'FS Day Landings', 'X-Country', 'Night', 'IMC', 'Simulated Instrument', 'Ground Simulator', 'Dual Received', 'CFI', 'SIC', 'PIC', 'Total Flight Time', 'Route', 'Comments', 'Aircraft Registration', 'Flight Number', 'Crew Start Time (UTC)', 'Block Out Time', 'Engine Start', 'Flight Start', 'Flight End', 'Engine End', 'Block In Time', 'Takeoffs (any)', 'Takeoffs - Night']


def _mfb_time(ms):
    if ms is None:
        return ''
    d = datetime.fromtimestamp(ms / 1000, timezone.utc)
    return f'{d.month}/{d.day}/{d.year} {d:%H:%M}'


def _dec(v):
    s = f'{v:.2f}'
    if s.endswith('0'):
        s = s[:-1]
    if s.endswith('.'):
        s = s[:-1]
    return s


def csv_row(f, cfg):
    r = compute(f)
    if not r['ok']:
        return None
    t, tot = r['t'], _dec(r['total'])
    seat = f.get('seat') or cfg.get('seat') or 'PIC'
    y, m, d = f['date'].split('-')
    return {
        'Date': f'{int(m)}/{int(d)}/{y}', 'Tail Number': cfg.get('anon_tail', '#002377'), 'Model': cfg.get('model', 'B737'),
        'Approaches': str(f.get('approaches') or 0), 'Landings': str(r['landings']),
        'FS Night Landings': str(r['fs_night']), 'FS Day Landings': str(r['fs_day']),
        'X-Country': tot, 'Night': _dec(r['night']) if r['night_min'] else '',
        'SIC': tot if seat == 'SIC' else '', 'PIC': tot if seat == 'PIC' else '', 'Total Flight Time': tot,
        'Route': f"{f['from']} {f['to']}", 'Comments': f.get('comments') or '',
        'Aircraft Registration': f.get('tail') or '', 'Flight Number': f.get('flightNumber') or '',
        'Crew Start Time (UTC)': _mfb_time(t['crew']), 'Block Out Time': _mfb_time(t['out']), 'Engine Start': _mfb_time(t['out']),
        'Flight Start': _mfb_time(t['off']), 'Flight End': _mfb_time(t['on']), 'Engine End': _mfb_time(t['in']), 'Block In Time': _mfb_time(t['in']),
        'Takeoffs (any)': str(r['takeoffs']) if r['takeoffs'] else '', 'Takeoffs - Night': str(r['night_takeoffs']) if r['night_takeoffs'] else '',
    }


def build_csv(flights, cfg):
    rows = sorted(flights, key=lambda f: f.get('date', '') + (f.get('out') or ''))
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CSV_COLS, lineterminator='\n', extrasaction='ignore')
    w.writeheader()
    for f in rows:
        row = csv_row(f, cfg)
        if row:
            w.writerow(row)
    return buf.getvalue()
