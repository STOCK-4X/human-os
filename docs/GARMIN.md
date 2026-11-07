# Garmin integration — Garmin Connect Personal API

Human OS syncs directly from Garmin using Garmin's **official Personal API**, a self-service option for individuals launched in October 2026. There is no scraping, Garmin password, or third party involved.

## Setup
1. **Create a key.** Garmin Connect (web) → Settings → **Personal API Key**: https://connect.garmin.com/app/settings/personalApiToken
   - Choose an expiry (up to 1 year).
   - The key is shown once. Garmin emails you about a week before it expires.
2. **Add it to the server.** Vercel → Settings → Environment Variables: `GARMIN_PERSONAL_API_KEY` = the key (Production). Then redeploy.
   - The key stays server-side and never reaches the browser.
   - Garmin's API sends no CORS headers, so it can't be called from a browser anyway.
3. **Add the access token in the app.** Profile → Apple Health → **Server access token**: the same value as `COACH_ACCESS_TOKEN`. Garmin should then show **Connected**.

## How it works
- **Server** (`src/lib/server/garmin.ts`)
  - Exchanges the key at `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` (`Authorization: ApiKey <key>`) for a 24-hour bearer JWT.
  - Caches the JWT in memory and refreshes it an hour before expiry.
- **Route** `GET /api/garmin/sync?start&end` (≤31 days, requires the access token)
  - Pulls Garmin data for the range and maps it into app records with `src/lib/garmin-map.ts`.
  - Nothing is stored on the server.
- **App** (`src/lib/garmin-sync.ts`)
  - Backfills 365 days on first sync, in 30-day chunks.
  - After that, refreshes from 3 days before the last sync.
  - Runs on open, when back online and every 30 minutes, plus a **Sync Garmin now** button.
  - Upserts by unique key: re-syncing never duplicates, and your own effort ratings and notes on activities are kept.

## Data mapped

| Endpoint | Stored as |
|---|---|
| `/usersummary-service/v2/dailysummaries` | steps, resting HR, active calories, intensity minutes, average stress (negative "no data" values ignored), Body Battery daily high |
| `/sleep-service/sleep/dailySleepSummariesByDate` | sleep window, time asleep, deep/light/REM/awake, awakenings, **Garmin sleep score** (shown separately from the Human OS score), overnight breathing rate |
| `/hrv-service/hrv/daily/{start}/{end}` | last-night HRV average |
| `/activitylist-service/activities/search/activities` | activities: type, time, duration, distance, avg/max HR, cadence, ascent, calories, HR-zone seconds, training effect, fastest 1k/mile/5k/10k |

Values are labelled **Garmin** and used exactly as Garmin reports them.

**Deliberately not stored:**
- GPS coordinates
- location names
- owner name and profile photos

## Terms
- The Personal API is for personal use: your own data, not commercial multi-user apps.
- Deleting the key in Garmin Connect immediately revokes access. The app then shows the error and stops syncing.

## Other Garmin endpoints available, not yet used
These exist but aren't used yet:
- detailed Body Battery curve
- stress detail
- SpO₂
- weight
- hydration
- menstrual cycle
- fitness age
- heart-rate zones
- `.FIT` downloads

See [garmin/connect-personal-api-python](https://github.com/garmin/connect-personal-api-python).
