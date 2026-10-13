# OOOI Flight Logger

Log airline flights from the ACARS-PREVIOUS OOOI page and import them into MyFlightbook.

- **Flight Log** appears in the Home Assistant sidebar (and the Companion app).
- Scan the OOOI page with your phone camera. Gemini reads it on the add-on side, and the TRIP check confirms CREW→IN.
- Total = CREW→IN. Night = minutes from OUT to IN with the sun below −6° along the great-circle route.
  PF logs a takeoff and a full-stop landing, marked day or night per 14 CFR 61.57(b).
- Every change writes these files to `/share/oooi_logger/` and, when connected, to Google Drive:
  - `MyFlightbook Import – pending.csv`: flights not yet imported
  - `Flight Log – all flights.csv`: everything
  - `flights.json`: full backup
- Flights live in the add-on's data folder, so Home Assistant backups include them.
- **Settings → Update airport database** downloads the latest airport list to Home Assistant (kept in the add-on's data folder; the copy built into the add-on is the fallback).

## Configuration

| Option | What it is |
|---|---|
| `gemini_api_key` | Key from Google AI Studio. Needed for photo scanning. Stays on your HA box. |
| `gemini_model` | Gemini model ID. Default `gemini-3.8-flash`. |
| `google_client_id` | OAuth client ID (type **TVs and Limited Input devices**). Needed for Drive upload. |
| `google_client_secret` | That client's secret. |
| `drive_folder` | Drive folder name. Default `OOOI Logger (Home Assistant)`. |
| `app_password` | Optional password for the direct web app on port 8199. Blank = no login. |

Restart the add-on after changing options.

## iPhone Home Screen app (Safari)

The add-on also serves the app on its own port, **8199**, outside the Home Assistant wrapper.

1. On your iPhone (on home Wi-Fi or Tailscale), open `http://<your-HA-address>:8199` in **Safari**.
   With Tailscale that is your HA machine's Tailscale name or IP, for example `http://homeassistant:8199`.
2. Log in if you set `app_password`.
3. Share → **Add to Home Screen**. You get the OOOI icon and it opens full-screen like an app.

Port 8199 is reachable from anything on your home network or tailnet. Set `app_password` if that matters to you.
To turn the port off, clear it under the add-on's **Network** section.

## Google Drive setup (one time)

1. <https://console.cloud.google.com/> → pick or create a project.
2. **APIs & Services → Library → Google Drive API → Enable.**
3. **OAuth consent screen**: External, app name `OOOI Flight Logger`, your email.
   Scopes: `.../auth/drive.file`, `openid`, `email`.
   **Publishing status: In production.** In Testing, Google expires the sign-in after 7 days.
   `drive.file` is a non-sensitive scope, so no Google review is needed. You'll see an "unverified app" notice once.
4. **Credentials → Create credentials → OAuth client ID → TVs and Limited Input devices.**
   Copy the client ID and secret into the add-on options, then restart.
5. Open **Flight Log → Settings → Connect Google**. Go to google.com/device on any device, enter the code, and approve.

The add-on can only see files it creates in Drive.

## Gemini key (photo scanning)

<https://aistudio.google.com/apikey> → Create API key → paste into `gemini_api_key`.
Free-tier note: Google may use free-tier inputs to improve its products.
