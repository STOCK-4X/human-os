# Apple Health via iOS Shortcuts

A web app can't read Apple Health directly. This bridge gets Garmin data into Human OS automatically:

```
Garmin watch → Garmin Connect app → Apple Health → iOS Shortcut (07:30 daily)
   → POST /api/inbox (token, encrypted at rest) → Human OS collects on open → server copy deleted
```

## What arrives

Garmin shares (per Garmin's list; check Health → Sources → Garmin Connect on your phone):
- sleep
- steps
- heart rate and resting heart rate
- workouts
- active energy

**Body Battery, stress and HRV status are generally not shared.** Those stay manual or come from CSV.

Values are labelled **Apple Health** in the app.

| Data | Counted on |
|---|---|
| Resting HR, HRV, breathing rate | that morning |
| Steps, active energy, exercise minutes | the previous day |

A later delivery for the same day replaces the earlier one, so there are no duplicates.

## One-time server setup

1. **Create a Supabase project** (free tier is enough) at supabase.com.
2. **Create the inbox table.** In SQL Editor, run `supabase/migrations/0002_health_inbox.sql`.
3. **Set Vercel environment variables** (Production) and redeploy:
   - `SUPABASE_URL`: Project Settings → API → Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Project Settings → API → `service_role` secret. Server only.
   - `INBOX_ENCRYPTION_KEY`: generate one with `openssl rand -base64 32`
   - `COACH_ACCESS_TOKEN`: a long random string, if not set already
4. **Enter the token in the app.** Profile → Apple Health → Server access token, same value as `COACH_ACCESS_TOKEN`.

Profile → Apple Health should then show **Server inbox: Ready**.

## The Shortcut

Profile → Apple Health → **Set up Shortcut** shows these steps with copy buttons.

Send `POST` to `https://<your-app>/api/inbox` with these headers:
- `Authorization: Bearer <token>`
- `Content-Type: application/json`

Body: JSON. Every key is optional. Numbers may be strings or use a decimal comma.

| Key | Meaning |
|---|---|
| `day` | `YYYY-MM-DD` morning the report is for (default: day it's sent) |
| `restingHR`, `hrv`, `respiration` | this morning's values |
| `steps`, `activeEnergyKcal`, `exerciseMin` | yesterday's totals |
| `sleepStart`, `sleepEnd` | ISO 8601 times of last night's sleep window |
| `sleepAsleepMin` | measured minutes asleep (optional; otherwise estimated) |
| `sleep` | alternatively `{start, end, asleepMin, deepMin, remMin, coreMin, awakeMin}` |
| `workouts` | `[{type, start, end or durationMin, distanceKm, kcal, avgHR}]` |

Out-of-range values are rejected, not stored. Missing values stay missing.

**iOS note:**
- Set the automation to **Run Immediately**.
- Automations that read Health data may still ask for a tap on some iOS versions. If so, tapping the notification each morning completes the run.
- Garmin can sync to Health late. If last night's sleep isn't there at 07:30, move the automation later.

## Privacy

- **The server can't read your stored data.** It encrypts each delivery with AES-256-GCM before storing it. Supabase only ever holds ciphertext.
- **Only the server can reach the table.** It has RLS enabled with no policies, so only the service role can access it.
- **Copies are deleted quickly.** Rows are removed as soon as the app imports them, and after 30 days regardless.
- **The token is required on every call.** Without it, the inbox endpoint rejects the request.

## Not yet verified

The server, the import into the app, and de-duplication are covered by automated tests. The Shortcut itself hasn't been run on a real iPhone yet:
- Action names can differ slightly between iOS versions.
- Check what Garmin actually writes in your Health → Sources.
