# OOOI Flight Logger

Log airline flights from the ACARS-PREVIOUS OOOI page and import them into MyFlightbook.

> Not affiliated with any airline, Boeing, MyFlightbook, or Google. Your logbook is your responsibility: check every scanned time and computed value before you import it.

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
| `gemini_model` | Gemini model ID. Default `gemini-3.5-flash-lite`. |
| `google_client_id` | OAuth client ID (type **TVs and Limited Input devices**). Needed for Drive upload. |
| `google_client_secret` | That client's secret. |
| `drive_folder` | Drive folder name. Default `OOOI Logger (Home Assistant)`. |
| `app_password` | Password for the optional Home Screen web app (see below). Strongly recommended if you turn that port on. |

Restart the add-on after changing options.

## First-time settings in the app

Open **Flight Log → Settings** and set:

- **Default seat time**: PIC or SIC.
- **MFB tail number** and **Model**: the aircraft in your MyFlightbook account that every flight imports to (usually an anonymous aircraft). They must match MyFlightbook exactly or the import will not line up.
- **Airline code** (optional): shown in front of flight numbers in the app, for example `UA` → `UA1234`.

## iPhone Home Screen app (optional)

The add-on can also serve the app on its own port, outside the Home Assistant wrapper, so it can live on your Home Screen as a full-screen app. This is **off by default**.

1. Set `app_password` on the Configuration tab. Anyone who can reach the port can read and edit your log without it.
2. In the add-on's **Network** section, enter `8199` for the web app port, save, and restart the add-on.
3. On your iPhone (on your home network or a VPN such as Tailscale), open `http://<your-HA-address>:8199` in **Safari** and log in.
4. Share → **Add to Home Screen**.

Don't forward this port to the internet. To turn it off again, clear the port in the **Network** section.

## Google Drive setup (one time)

1. <https://console.cloud.google.com/> → pick or create a project.
2. **APIs & Services → Library → Google Drive API → Enable.**
3. **OAuth consent screen**: External, app name `OOOI Flight Logger`, your own email as the support and developer contact.
   Scopes: `.../auth/drive.file`, `openid`, `email`.
   **Publishing status: In production.** In Testing, Google expires the sign-in after 7 days.
   `drive.file` is a non-sensitive scope, so no Google review is needed. You'll see an "unverified app" notice once.
4. **Credentials → Create credentials → OAuth client ID → TVs and Limited Input devices.**
   Copy the client ID and secret into the add-on options, then restart.
5. Open **Flight Log → Settings → Connect Google**. Go to google.com/device on any device, enter the code, and approve.

The add-on can only see files it creates in Drive.

## Gemini key (photo scanning)

<https://aistudio.google.com/apikey> → Create API key → paste into `gemini_api_key`.
Free-tier note: Google may use free-tier inputs (your OOOI photos) to improve its products. Use a paid key if that matters to you. Photo scanning is optional; you can always type the times in.
