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
- **Settings → Update airport database** downloads the latest airport list to Home Assistant (kept in the add-on's data folder; the copy built into the add-on is the fallback). The downloaded list includes small airports and recognizes 3-letter IATA and FAA codes, so run it once if your history has GA flying.

## Stats, Map and currency

The **Stats** and **Map** tabs cover flights logged here plus any history you import from MyFlightbook (below). Choose a period at the top: all time, the last 12 months, the last 90 days, or a single year.

- Hours on Stats show as hours:minutes (`3:49`) by default. Switch to decimal (`3.8`) under **Settings → Show hours on Stats as**. This only changes the display; the CSVs always use decimal hours, which MyFlightbook expects.
- **Stats** shows your totals (total, PIC, SIC, night, cross-country, flights, landings, airports, distance), a chart of hours by year or month (tap a bar for details, or open it as a table), your top routes, airports and aircraft, and records such as your longest flight.
- **Currency** at the top of Stats checks 14 CFR 61.57: three takeoffs and three landings in the last 90 days (day), and three night takeoffs and three night full-stop landings (night). It shows the date you're current through and turns amber two weeks before. It counts every logged takeoff and landing, including simulator sessions, in any aircraft. Your operator's recency rules (for example 14 CFR 121.439) and type requirements may differ, so use it as a reminder, not a legal determination.
- **Map** draws every airport you've visited (bigger dots for more visits) and every route (thicker lines for more flights). Drag to move, pinch or use **+ −** to zoom, **Fit** to reset, and tap an airport for its visits and dates.
- The **Night** breakdown for a flight is under **Show night work →** on the Log screen.

## Importing your MyFlightbook history (optional)

1. On the MyFlightbook website, open **Logbook → Download** and choose **CSV**.
2. In **Flight Log → Settings → Logbook history**, tap **Import MyFlightbook logbook** and pick that file.

The add-on reads only the columns it needs (date, route, times, landings, takeoffs, aircraft), so it doesn't matter how many other columns your logbook has. Imported history is used only for Stats and Map. It is never added to the CSVs you import into MyFlightbook, so nothing gets imported twice. A flight that's both in the history and logged here (same date and route) is counted once.

Importing again replaces the old history, so download a fresh export whenever you want the totals brought up to date. **Remove imported history** deletes it. Airports the airport list doesn't know are listed in Settings and left off the map; **Update airport database** fixes most of them, with no need to re-import.

## Configuration

| Option | What it is |
|---|---|
| `gemini_api_key` | Key from Google AI Studio. Needed for photo scanning. Stays on your HA box. |
| `gemini_model` | Gemini model ID. Default `gemini-3.5-flash-lite`. |
| `google_client_id` | OAuth client ID for Drive upload (optional). See **Google Drive setup** below. |
| `google_client_secret` | That client's secret. |
| `drive_folder` | Drive folder name. Default `OOOI Logger (Home Assistant)`. |
| `app_password` | Password for the optional Home Screen web app (see below). Strongly recommended if you turn that port on. |

Restart the add-on after changing options.

## First-time settings in the app

Open **Flight Log → Settings** and set:

- **Default seat time**: PIC or SIC.
- **MFB tail number** and **Model**: the MyFlightbook aircraft every flight imports to. See below.

## Changing the CSV columns (optional)

The CSVs are made for MyFlightbook's import and use its column names, which can't be changed. They include only the columns the app fills in. To log something else, such as IMC or approaches, add your own column (below) set to **Fill in on the Log screen** and name it exactly as MyFlightbook does, for example `IMC` or `Approaches`. To change them, open **Flight Log → Settings → CSV columns**:

- **Untick** a column to leave it out of the CSV.
- Tick **Edit** to get a box for that column on the Log screen, for example Night or Landings. The box shows the automatic value in grey. Type over it to change the value for that flight only (the box turns highlighted), or clear it to go back to automatic. Columns marked ✓ already have a box on the Log screen. Added columns have the same option.
- **+ Add column** adds your own column at the end of the CSV. Use **↑ ↓** to change the order of your added columns; it sets both their order in the CSV and on the Log screen. Give each one a header name and choose where its value comes from:
  - **Fill in on the Log screen**: a box with that name appears under Comments (two per row), so you can type a value for each flight (for example an `Approach Type` column). You can give it a pre-filled value for new flights. Renaming the column later keeps the values you've already typed.
  - **Same text on every flight**: for example a `Flight Rules` column set to `IFR`.
  - **Copy a value**: any standard column (for example a `Multi-Pilot Time` column copying Total Flight Time), or one of these extras: Block Time (OUT to IN), Air Time (OFF to ON), Departure, Arrival, Pilot Duty (PF/PM).
- Tap **Save columns**. **Reset to defaults** (tap twice) puts every name back, turns all columns on, and removes added columns.

Changes apply to every CSV the add-on writes, in `/share/oooi_logger/` and Drive. Two columns can't share the same name, and at least one must stay on.

## Finding your MyFlightbook tail number

Airline pilots fly many tails of the same type, so the add-on logs every flight against one **anonymous aircraft** in MyFlightbook and puts the real registration in the Aircraft Registration property.

1. In MyFlightbook, add an aircraft for your type (for example a Boeing 737) and make it **Anonymous** instead of entering a registration.
2. Go to **My Aircraft** and click that **Anonymous** aircraft.
3. On its page, under **Tail Number**, you'll see a code starting with `#`, for example `#002377`, with the note "This tailnumber is used internally; you do not need it unless you are importing flights for this aircraft." Importing is exactly what you're doing, so you need it.
4. In **Flight Log → Settings**, enter that code (including the `#`) as **MFB tail number**, set **Model** to match the aircraft (for example `B737`), and tap **Save settings**.

If the tail number doesn't match, MyFlightbook's import will try to create a new aircraft instead of using yours.

## iPhone Home Screen app (optional)

The add-on can also serve the app on its own port, outside the Home Assistant wrapper, so it can live on your Home Screen as a full-screen app. This is **off by default**.

1. Set `app_password` on the Configuration tab. Anyone who can reach the port can read and edit your log without it.
2. In the add-on's **Network** section, enter `8199` for the web app port, save, and restart the add-on.
3. On your iPhone (on your home network or a VPN such as Tailscale), open `http://<your-HA-address>:8199` in **Safari** and log in.
4. Share → **Add to Home Screen**.

Don't forward this port to the internet. To turn it off again, clear the port in the **Network** section.

## Google Drive setup (optional, one time, about 15 minutes)

Drive upload is optional. Without it, the CSVs are still written to `/share/oooi_logger/` on your Home Assistant.

You're creating your own small Google "app" that only you use. It lets the add-on put files in your Drive. It can only see the files it creates, never the rest of your Drive.

Menu names below match the Google Cloud console as of October 2026. Google renames things occasionally; if a label doesn't match, look for the closest one.

### Part A — Create a project and turn on the Drive API

1. On a computer, go to <https://console.cloud.google.com/> and sign in with the Google account whose Drive should get the files.
2. Click the **project picker** at the top left (next to the Google Cloud logo) → **New project**.
   Name it `OOOI Flight Logger` → **Create**. Wait a few seconds, then make sure that project is selected in the picker.
3. Open the menu (☰) → **APIs & Services → Library**.
4. Search for **Google Drive API**, click it, and click **Enable**.

### Part B — Set up Google Auth Platform

Everything in this part happens in **Google Auth Platform**. Open it from the search bar at the top (type `Google Auth Platform`) or from ☰ → **APIs & Services → OAuth consent screen**. Its left sidebar has **Overview, Branding, Audience, Clients, Data Access, Verification Center, Settings**. You'll use **Audience**, **Data Access** and **Clients**.

5. The first time you open it, click **Get started** and fill in:
   - **App name:** `OOOI Flight Logger`
   - **User support email:** your email
   - **Audience:** **External**
   - **Contact information:** your email

   Agree to the policy and click **Create**. You can change these later under **Branding**. Skip the logo, home page and privacy-policy fields.

6. **Data Access** (left sidebar) → **Add or remove scopes**. The add-on needs these three:

   | Scope (full URL) | Shown in the list as | What it allows |
   |---|---|---|
   | `https://www.googleapis.com/auth/drive.file` | `.../auth/drive.file` (Google Drive API) | Create and update only the files this app makes. It can't see anything else in your Drive. |
   | `openid` | `openid` | Confirm it's you when you sign in. |
   | `https://www.googleapis.com/auth/userinfo.email` | `.../auth/userinfo.email` | Read your email address, so Settings can show which account is connected. |

   The quickest way: scroll to **Manually add scopes** at the bottom of the panel, paste all three lines below, and click **Add to table**:

   ```
   https://www.googleapis.com/auth/drive.file
   openid
   https://www.googleapis.com/auth/userinfo.email
   ```

   Check that all three are ticked in the table, click **Update**, then **Save** at the bottom of the Data Access page. They should now appear under **Your non-sensitive scopes**.

7. **Audience** (left sidebar). Under **Publishing status**, click **Publish app** → **Confirm**. It should then read **In production**, with a **Back to testing** button under it, and **User type: External**.

   Don't skip this. While the app is in **Testing**, Google cancels your sign-in after 7 days and Drive uploads stop.
   The **OAuth user cap** on this page (for example "0 users / 100 user cap") only counts sensitive or restricted scopes. `drive.file` is neither, so it doesn't apply, and you don't need to submit anything under **Verification Center**.

### Part C — Create the client ID and secret

8. **Clients** (left sidebar) → **Create client**.
9. **Application type:** **TVs and Limited Input devices**. This type matters: it gives you the type-a-code sign-in the add-on uses. Name it anything, for example `Home Assistant`, and click **Create**.
10. A box shows the **Client ID** (ends in `.apps.googleusercontent.com`) and **Client secret**. Copy both. If the box closes, click the client's name under **Clients** to see them again.

### Part D — Put them in Home Assistant

11. In Home Assistant: **Settings → Add-ons → OOOI Flight Logger → Configuration**.
    Paste the ID into `google_client_id` and the secret into `google_client_secret`. Change `drive_folder` if you want a different folder name. **Save**.
12. Go to the add-on's **Info** tab and click **Restart**.

### Part E — Connect your Google account

13. Open **Flight Log → Settings → Connect Google**. The app shows a short code and a link, `google.com/device`.
14. On your phone or any computer, open <https://www.google.com/device>, enter the code, and pick the same Google account as in step 1.
15. Google warns **"Google hasn't verified this app."** That's expected, because it's your own app. Click **Advanced → Go to OOOI Flight Logger (unsafe)**.
16. Allow the permissions and finish. Within a few seconds, Flight Log Settings shows **Connected as** your email.

The add-on creates the folder in your Drive and uploads the files after every change. Tap **Open folder** in Settings to see them.

### If something goes wrong

| What you see | Fix |
|---|---|
| Settings says to add `google_client_id` and `google_client_secret` | They're missing, or the add-on wasn't restarted after you saved them. |
| "Google refused the sign-in request" | The client isn't the **TVs and Limited Input devices** type (step 9), or the ID or secret was pasted wrong. Create a new client of the right type. |
| "Error 403: access_denied" on the Google page | The app is still in **Testing** and your account isn't a test user. Publish it under **Audience** (step 7). |
| Worked for a week, then "sign-in expired or was revoked" | The app was left in **Testing**. Publish it under **Audience** (step 7), then **Connect Google** again. |
| "Drive sync failed (403) … API has not been used … or it is disabled" | The Drive API isn't turned on for this project (step 4). |
| The code expired | You have about 30 minutes to enter it. Tap **Connect Google** again for a new code. |

## Gemini key (photo scanning)

<https://aistudio.google.com/apikey> → Create API key → paste into `gemini_api_key`.
Free-tier note: Google may use free-tier inputs (your OOOI photos) to improve its products. Use a paid key if that matters to you. Photo scanning is optional; you can always type the times in.
