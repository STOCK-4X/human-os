# Garmin integration — status and path to enable

## Current status (checked October 2026)

**There is no live Garmin connection in Human OS.** The app labels it "Not connected" everywhere.

- The Garmin Connect Developer Program (Health API, Activity API) is the only authorised route to sync data from Garmin's servers.
- **It accepts business applicants only.** Individual and personal-use applications are declined.
- **New applications are currently paused** while Garmin updates the program. Check https://developer.garmin.com/gc-developer-program/ for the current state.
- Approved partners get an evaluation environment first. Auth is OAuth 2.0 with PKCE (older OAuth 1.0a material still circulates; confirm the method with Garmin when approved). Data arrives as push/ping notifications to your server.

Human OS never scrapes Garmin Connect, never asks for your Garmin password, and never stores Garmin tokens in the browser.

## What works today

1. **Garmin activities CSV.** In Garmin Connect (web): Activities → All Activities → Export CSV. Import it in Profile → Data sources. Runs, walks, rides, swims and strength sessions are mapped, with distance, time, HR, cadence and ascent. The `--` placeholders are treated as missing, never zero. Re-importing never duplicates (unique external id per activity).
2. **Sleep / daily metrics.** Garmin has no CSV export for sleep, HRV or Body Battery. Use the Human OS templates (Profile → Data sources → template buttons) to enter them in bulk, or the quick manual entry on Today.
3. **Garmin's full data export** (account settings → Export your data) produces JSON. A parser for it is a sensible next step. It is not implemented yet because its format must be verified against a real export before shipping.

Imported values are labelled **Imported** (source `csv`), never **Garmin**, because they did not come through an authorised live connection.

## Architecture for the live integration

`src/lib/integrations/garmin.ts` defines:
- `garminServerStatus()` reports honest state: `not_configured` → `configured_not_connected` → `connected`.
- `HealthProviderMapper` is the contract a real adapter must satisfy: map provider summaries into `SleepRecord`, `DailyMetric` and `Workout` with `source: "garmin"` and a stable `externalId`.

## Steps once Garmin approves an application

1. Register the app and set `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET` and `GARMIN_REDIRECT_URI` on the server.
2. Enable Supabase Auth and apply `supabase/migrations/0001_init.sql`. Tokens go in `integration_tokens`, which has RLS and no client policy, so only the service role can read it. Encrypt tokens at rest.
3. Add server routes:
   - `GET /api/integrations/garmin/authorize`: create the PKCE verifier, store it server-side, redirect.
   - `GET /api/integrations/garmin/callback`: exchange the code, store the tokens, record a `sync_logs` row.
   - `POST /api/integrations/garmin/webhook`: verify the notification, fetch summaries, map them with a `HealthProviderMapper`, upsert on the unique keys.
4. Request only the scopes needed (sleep, dailies, HRV, activities).
5. Handle delayed and partial data. Garmin can redeliver or update summaries, so upsert rather than insert, and never zero-fill missing fields.
6. Test against the evaluation environment, then flip the UI status to `connected` only when a real sync has succeeded. Show the last successful sync time and a manual refresh where the API allows it.

## Alternatives if you can't get access

Aggregators (Terra, Rook, Open Wearables, and others) hold Garmin partner access and resell it under their terms. Review their privacy terms carefully before sending health data through a third party.
