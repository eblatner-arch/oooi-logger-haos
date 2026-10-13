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
| `google_client_id` | OAuth client ID for Drive upload (optional). See **Google Drive setup** below. |
| `google_client_secret` | That client's secret. |
| `drive_folder` | Drive folder name. Default `OOOI Logger (Home Assistant)`. |
| `app_password` | Password for the optional Home Screen web app (see below). Strongly recommended if you turn that port on. |

Restart the add-on after changing options.

## First-time settings in the app

Open **Flight Log → Settings** and set:

- **Default seat time**: PIC or SIC.
- **MFB tail number** and **Model**: the MyFlightbook aircraft every flight imports to. See below.
- **Airline code** (optional): shown in front of flight numbers in the app, for example `UA` → `UA1234`.

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

Google renames these menus now and then. If a label below doesn't match exactly, look for the closest one.

### Part A — Create a project and turn on the Drive API

1. On a computer, go to <https://console.cloud.google.com/> and sign in with the Google account whose Drive should get the files.
2. Click the **project picker** at the top left (next to the Google Cloud logo) → **New project**.
   Name it `OOOI Flight Logger` → **Create**. Wait a few seconds, then make sure that project is selected in the picker.
3. Open the menu (☰) → **APIs & Services → Library**.
4. Search for **Google Drive API**, click it, and click **Enable**.

### Part B — Set up the sign-in screen

This is the screen you'll see when you approve the add-on. Google calls it the **OAuth consent screen** (newer consoles show it as **Google Auth Platform**).

5. Menu (☰) → **APIs & Services → OAuth consent screen**. If you see **Get started**, click it.
6. Fill in:
   - **App name:** `OOOI Flight Logger`
   - **User support email:** your email
   - **Audience / User type:** **External**
   - **Contact information:** your email

   Agree to the policy and click **Create** (or **Save and continue** through each page on older consoles). You can skip the logo, home page, and privacy-policy fields.
7. Add the permissions the add-on asks for. Open **Data Access** (older consoles: the **Scopes** page) → **Add or remove scopes**, and tick these three:
   - `.../auth/drive.file` — see, edit, create and delete only the Drive files this app uses
   - `openid`
   - `.../auth/userinfo.email` (shown as `email`)

   If `drive.file` isn't in the list, paste `https://www.googleapis.com/auth/drive.file` into **Manually add scopes** → **Add to table**. Click **Update**, then **Save**.
8. **Publish the app.** Open **Audience** (older consoles: the consent screen's main page) and under **Publishing status** click **Publish app** → **Confirm**. It should now say **In production**.

   Don't skip this. While the app is in **Testing**, Google cancels your sign-in after 7 days and Drive uploads stop.
   You don't need to submit anything to Google for review. `drive.file` is a non-sensitive permission, so production apps for personal use work right away.

### Part C — Create the client ID and secret

9. Open **Clients** (older consoles: **APIs & Services → Credentials → Create credentials → OAuth client ID**) → **Create client**.
10. **Application type:** **TVs and Limited Input devices**. This type matters: it gives you the type-a-code sign-in the add-on uses. Name it anything, for example `Home Assistant`, and click **Create**.
11. A box shows the **Client ID** (ends in `.apps.googleusercontent.com`) and **Client secret**. Copy both. If the box closes, click the client's name in the list to see them again.

### Part D — Put them in Home Assistant

12. In Home Assistant: **Settings → Add-ons → OOOI Flight Logger → Configuration**.
    Paste the ID into `google_client_id` and the secret into `google_client_secret`. Change `drive_folder` if you want a different folder name. **Save**.
13. Go to the add-on's **Info** tab and click **Restart**.

### Part E — Connect your Google account

14. Open **Flight Log → Settings → Connect Google**. The app shows a short code and a link, `google.com/device`.
15. On your phone or any computer, open <https://www.google.com/device>, enter the code, and pick the same Google account as in step 1.
16. Google warns **"Google hasn't verified this app."** That's expected, because it's your own app. Click **Advanced → Go to OOOI Flight Logger (unsafe)**.
17. Allow the permissions and finish. Within a few seconds, Flight Log Settings shows **Connected as** your email.

The add-on creates the folder in your Drive and uploads the files after every change. Tap **Open folder** in Settings to see them.

### If something goes wrong

| What you see | Fix |
|---|---|
| Settings says to add `google_client_id` and `google_client_secret` | They're missing, or the add-on wasn't restarted after you saved them. |
| "Google refused the sign-in request" | The client isn't the **TVs and Limited Input devices** type (step 10), or the ID or secret was pasted wrong. Create a new client of the right type. |
| "Error 403: access_denied" on the Google page | The app is still in **Testing** and your account isn't a test user. Publish it (step 8). |
| Worked for a week, then "sign-in expired or was revoked" | The app was left in **Testing**. Publish it (step 8), then **Connect Google** again. |
| "Drive sync failed (403) … API has not been used … or it is disabled" | The Drive API isn't turned on for this project (step 4). |
| The code expired | You have about 30 minutes to enter it. Tap **Connect Google** again for a new code. |

## Gemini key (photo scanning)

<https://aistudio.google.com/apikey> → Create API key → paste into `gemini_api_key`.
Free-tier note: Google may use free-tier inputs (your OOOI photos) to improve its products. Use a paid key if that matters to you. Photo scanning is optional; you can always type the times in.
