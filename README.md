# OOOI Flight Logger — Home Assistant add-on

For airline pilots who log in [MyFlightbook](https://myflightbook.com): snap a photo of the **ACARS-PREVIOUS OOOI** page on the FMC/CDU, and the add-on reads the times, works out night time and day/night takeoffs and landings, and keeps MyFlightbook-ready import files on your Home Assistant and in Google Drive.

[![Add repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Feblatner-arch%2Foooi-logger-haos)

## Features

- Photo scan of the OOOI page with Google Gemini (optional; manual entry always works)
- Total time CREW→IN; night time from OUT to IN using sun position along the great-circle route
- Day/night takeoff and full-stop landing per 14 CFR 61.57(b) when you were pilot flying
- Night breakdown with a route map for each flight
- **Stats**: totals by period, hours by month and year, top routes, airports and aircraft, records
- **Currency**: 90-day day and night takeoff/landing currency (14 CFR 61.57) at a glance
- **Map**: every airport and route you've flown, with pan, zoom and period filter
- **Import your MyFlightbook history** so Stats and Map cover your whole career, not just flights logged here
- MyFlightbook import CSV of pending flights, plus a full-log CSV and JSON backup, written to `/share/oooi_logger/` and (optionally) Google Drive
- Choose which MyFlightbook columns to export, edit any automatic value per flight, and add your own columns
- Flights are stored in the add-on, so Home Assistant backups include them
- Optional full-screen iPhone Home Screen app

## Install

1. In Home Assistant: **Settings → Add-ons → Add-on Store → ⋮ (top right) → Repositories**, add

   ```
   https://github.com/eblatner-arch/oooi-logger-haos
   ```

   (or click the button above).
2. Install **OOOI Flight Logger**.
3. Fill in the **Configuration** tab (all optional — see the Documentation tab for the Gemini key and Google Drive setup), start the add-on, and open **Flight Log** in the sidebar.
4. In **Flight Log → Settings**, set your MyFlightbook tail number and model, and default seat.

Full setup guide: [`oooi_logger/DOCS.md`](oooi_logger/DOCS.md).

Requires Home Assistant OS or Supervised (add-ons). Runs on aarch64, amd64 and armv7.

## Disclaimer

Not affiliated with any airline, Boeing, MyFlightbook, or Google. The ACARS page layout varies by operator; the scanner was built for the "ACARS-PREVIOUS OOOI" page format. Always verify scanned times and computed values before importing — your logbook is your responsibility.

## License

MIT — see [LICENSE](LICENSE).
