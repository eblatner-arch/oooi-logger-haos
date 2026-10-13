## 1.3.0
- Ready for other pilots: no airline is hard-coded. Set an optional **Airline code** in Settings to show it in front of flight numbers (existing installs: enter your code once in Settings).
- The Home Screen web app port (8199) is now **off by default** for new installs. Turn it on in the add-on's Network section, and set `app_password` first.
- Default Gemini model is now `gemini-3.5-flash-lite`. Existing installs keep whatever model is saved in their Configuration.
- Clearer Settings help for the MyFlightbook tail number and model.
- Rewritten documentation and README; MIT license added.

## 1.2.0
- The app is now also served on its own port (**8199**) so it can be added to the iPhone Home Screen from Safari as a full-screen web app with its own icon.
- Optional `app_password` protects that port. Leave it blank for no login.

## 1.1.0
- Settings → **Update airport database** downloads the latest open-source airport list (airportsdata on GitHub) to Home Assistant. The bundled copy stays as a fallback, and a bad or incomplete download is rejected without touching the current list.

## 1.0.0
- First release: OOOI photo scan (Gemini), night time and day/night takeoff/landing, Night tab with route map, MyFlightbook CSVs in /share/oooi_logger and Google Drive.
