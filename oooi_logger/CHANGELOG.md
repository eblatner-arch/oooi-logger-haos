## 2.3.0
- **Stats → Search**, laid out like Flight Tracker's History search: a search box (flight, airport, tail, type, month, weekday, night, or `>5` for time), quick chips (night time, night landing, PF, PM, PIC, SIC, logged here, from MyFlightbook), More filters (year, month, from, to, either airport, route one way or both, aircraft, registration, day, time range, since, sort), a running total of what matches, and results by month.
- Top routes now read **KEWR ⇄ KFLL** with the split by direction underneath (for example 29 KEWR→KFLL · 29 KFLL→KEWR), since the count covers both ways.
- Top routes, airports, aircraft types and the PIC, SIC, Night, Flights and Landings figures open Search filtered to those flights.

## 2.2.0
- Hours:minutes everywhere: the Log screen (total and night), the Flights list (each flight, night chip, pending hours), and the night breakdown now show `3:10` instead of `3.17`.
- Edit boxes for hour columns show the automatic value as hours:minutes and accept `1:16`; the CSV still gets decimal hours (`1.27`) for MyFlightbook.
- The setting is now **Settings → Show hours as** and applies to the whole app, not just Stats.

## 2.1.3
- New icon in the same style as FAR 117 Tracker: a logbook clipboard with the airliner, on blue.

## 2.1.2
- The "airport code isn't in the airport list" note under Settings → Logbook history is now checked against the current airport list each time, so it no longer lists KPBI (now counted as KDJT) or codes fixed by Update airport database. No need to re-import.

## 2.1.1
- Map wraps east–west: drag past the date line and the world continues, and routes across the Pacific draw as one unbroken arc.
- Fit centres on the shortest span that holds all your airports, so a logbook with Asia and Europe frames the right way round.
- Zooming out stops at one full world, and the view stays between the poles.

## 2.1.0
- Stats now show hours as hours:minutes (`3:49`). Prefer decimal? **Settings → Show hours on Stats as → 3.8**. The CSVs are unchanged.

## 2.0.2
- Palm Beach International's old code KPBI (and PBI) now counts as its new code KDJT, so older flights show on the map and in Stats as one airport. Your logged and imported flights keep the code as written.

## 2.0.1
- Fixed: a Drive file you deleted (moved to Drive's trash) kept being updated in the trash instead of being recreated. The add-on now makes a fresh copy in the folder on the next sync.

## 2.0.0
- **Stats tab**: totals for any period (all time, last 12 months, last 90 days, or a year), hours by year or month with a table view, top routes, airports and aircraft types, and records.
- **Currency**: day and night 90-day takeoff and landing currency (14 CFR 61.57) with the date you're current through.
- **Map tab**: every airport and route you've flown, sized by how often, with pan, zoom, and tap-for-details.
- **Import your MyFlightbook history** (Settings → Logbook history) so Stats and Map cover your whole logbook. Imported history never goes into your import CSVs.
- **Update airport database** now keeps small airports too, and recognizes 3-letter IATA and FAA codes.
- The tab bar is now Log, Flights, Stats, Map, Settings. The night breakdown opens from **Show night work →** on the Log screen.

## 1.13.0
- Made for MyFlightbook: standard CSV column names are now fixed to MyFlightbook's names, so an import can't break from a renamed header. Any renamed headers go back to MyFlightbook's names. Your own added columns can still be named anything.

## 1.12.1
- Fixed the Use / Header / Edit headings in Settings → CSV columns being clipped.

## 1.12.0
- The CSV logs five times: Crew Start Time (CREW), Block Out Time (OUT), Flight Start (OFF), Flight End (ON), and Block In Time (IN). Removed Engine Start and Engine End, which only repeated OUT and IN.

## 1.11.0
- Removed the Airline code setting. Flight numbers show as `Flt 1234`.

## 1.10.0
- **Settings → CSV columns → Edit** (was Show): ticked columns now get an editable box on the Log screen, pre-filled in grey with the automatic value. Type over it to change that flight's value; clear it to go back to automatic. Works for Night, Landings, PIC/SIC, Total, tail number, model, and your own added columns.
- Fixed: with any added column, the Settings column list failed to draw.
- Fixed: the Log screen now picks up settings changes as soon as you switch back to it.

## 1.9.0
- The Log screen's summary box is now called **Will also log automatically**.
- **Settings → CSV columns → Show**: tick any column (standard or added) to see its value in that box while you log. Columns already on the Log screen are marked ✓.

## 1.8.0
- Reorder your added columns with ↑ ↓ in Settings. The order applies to the CSV and the Log screen.
- Fill-in columns on the Log screen sit two per row.

## 1.7.0
- The CSV now contains only the columns the app fills in. Removed the always-empty Approaches, Hold, IMC, Simulated Instrument, Ground Simulator, Dual Received, and CFI columns. To log any of them, add your own column in **Settings → CSV columns** set to **Fill in on the Log screen**.

## 1.6.0
- Added columns can now be **filled in on the Log screen**: each one gets its own box under Comments, with an optional pre-filled value for new flights.
- Clearer explanation of the three kinds of added column in Settings.

## 1.5.0
- **Settings → CSV columns → + Add column**: add your own columns at the end of the CSV, filled with fixed text or a copy of any value the app works out (including block time, air time, departure, arrival, and PF/PM).

## 1.4.0
- New **Settings → CSV columns**: rename any CSV header or leave columns out. Defaults are unchanged.
- Default Gemini model is now `gemini-3.5-flash-lite`. Existing installs keep whatever model is saved in their Configuration.
- Settings explains how to find your MyFlightbook anonymous aircraft tail number.
- Expanded Google Drive setup guide.

## 1.3.0
- Ready for other pilots: no airline is hard-coded. Set an optional **Airline code** in Settings to show it in front of flight numbers (existing installs: enter your code once in Settings).
- The Home Screen web app port (8199) is now **off by default** for new installs. Turn it on in the add-on's Network section, and set `app_password` first.
- Clearer Settings help for the MyFlightbook tail number and model.
- Rewritten documentation and README; MIT license added.

## 1.2.0
- The app is now also served on its own port (**8199**) so it can be added to the iPhone Home Screen from Safari as a full-screen web app with its own icon.
- Optional `app_password` protects that port. Leave it blank for no login.

## 1.1.0
- Settings → **Update airport database** downloads the latest open-source airport list (airportsdata on GitHub) to Home Assistant. The bundled copy stays as a fallback, and a bad or incomplete download is rejected without touching the current list.

## 1.0.0
- First release: OOOI photo scan (Gemini), night time and day/night takeoff/landing, Night tab with route map, MyFlightbook CSVs in /share/oooi_logger and Google Drive.
