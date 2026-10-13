# Human OS

**Become your best self, backed by data.** A private, mobile-first PWA for sleep, recovery, training, habits and long-term personal development.

## Architecture

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router) + React 19 + TypeScript | One codebase for UI and secure server routes |
| Styling | Tailwind CSS v4 with design tokens (`src/app/globals.css`) | Calm light/dark themes from one token set |
| Data | **Local-first IndexedDB** via Dexie (`src/lib/db.ts`) | Works offline and survives refreshes. Health data stays on the device. Unique indexes make imports idempotent. |
| Cloud (next phase) | Supabase Postgres + Auth + RLS (`supabase/migrations/0001_init.sql`) | Multi-device sync and multi-user, without a rewrite |
| AI | Claude via `/api/coach` (server only, `@anthropic-ai/sdk`) | Key never reaches the browser. Minimised, schema-validated payload. |
| Charts | Recharts | Lightweight, themeable |
| Hosting | **Vercel** (recommended) | Native Next.js support, HTTPS (required for PWA/service workers), env-var secrets, cron for future push |

**Data provenance is explicit everywhere.** Each value carries a label:
- **You**: manual entries
- **Imported**: CSV
- **Garmin / Device**: measured by a device
- **Calculated**: Human OS scores, averages and baselines
- **AI**: coach text

Missing data shows as "—", never as zero.

## Features

- **Today:**
  - Energy, Recovery and Sleep rings plus Readiness, each with trend, baseline, contributing factors, a next step and "How is this calculated?"
  - Garmin Body Battery and the device sleep score shown separately and unchanged
  - 1–10 morning energy check-in (skippable), day progress, focus and one small action
  - Habits, quick lifestyle logging (water, caffeine, light, alcohol, screens), tonight's bedtime plan
- **Health:**
  - Sleep: duration, weekly averages, bed/wake consistency, stages, a bedtime planner with gradual wake-time shifting, evidence-based tips linked to experiments
  - Recovery: HRV, RHR, Body Battery, stress and breathing, each against your personal baseline band
  - Body: optional, hideable, measured vs estimated
  - Trends: score history, "do your wearables match how you feel?", and a relationship explorer (association ≠ cause)
- **Train:**
  - A readiness-adjusted weekly plan, run/walk and easy-run guidance, pace and HR trends
  - Strength sets with progressive overload and an estimated 1RM, swimming, workout history
- **Habits:**
  - Daily, specific-day or ×-per-week habits with a minimum version
  - Partial completion, rest and skipped days, forgiving "never miss twice" streaks
  - Morning and evening routines, 28-day consistency
- **45-day challenge:** three phases, no resets, reflections and a final report.
- **Experiment lab:** baseline vs experiment, adherence, limitations and a suggested next step.
- **Achievements:**
  - Data-verified milestones across sleep, fitness, recovery, habits, growth, personal bests and custom goals
  - Celebration preferences, and a timeline that quietly adds milestones found in imported history
  - Canvas-rendered PNG posters (1080×1920 / 1080×1080 / 1080×1350) with three themes, with health details hidden by default; native share or download
- **Coach:**
  - AI morning briefing, chat and weekly review, with corrections and approved memory
  - Falls back to labelled calculated guidance when the server isn't configured or you're offline
- **Review:** weekly and monthly reports with stable-band comparisons, reflections and a Markdown download.
- **Profile:**
  - Settings, units, time zone, theme and hidden metrics
  - Reminders with quiet hours and weekdays
  - Data sources: Garmin status and CSV import
  - AI data preview, export, restore, delete-all, and install instructions

## Getting started

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. In development, onboarding offers **"load demo data"**. It is clearly bannered as synthetic and is unavailable in production builds.

To enable the AI coach, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`. Without it, the app is fully usable and says so.

| Command | What |
|---|---|
| `npm test` | Unit tests (Vitest + fake IndexedDB): dates/time zones, stats, sleep, habits, reports, scores, readiness, achievements, CSV, store |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build` | Production build |
| `npm run icons` | Regenerate PWA icons |

## Deploying (Vercel)

1. Push to a Git repo and import it in Vercel. The defaults work as-is.
2. Set the env vars from `.env.example`:
   - `ANTHROPIC_API_KEY`
   - `COACH_ACCESS_TOKEN`: required in practice for a public URL. Enter the same token in Profile → AI coach.
3. Deploy, open the URL on your phone and **Add to Home Screen**.

Because data is local-first, each device has its own data until cloud sync ships. Use Profile → Export / Restore to move it.

## Platform notes

- **Garmin:** not connected. The program is business-only and applications are paused. See [docs/GARMIN.md](docs/GARMIN.md).
- **Notifications:** foreground and recent-background only for now. On iOS they require the installed PWA. See [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md).
- **Scores:** full method in [docs/SCORES.md](docs/SCORES.md).
- **PWA:** the service worker (`public/sw.js`) caches the app shell. It is network-first for pages, cache-first for hashed assets, and never caches `/api`. User data lives in IndexedDB, and the app requests persistent storage so the browser won't evict it.

## Privacy and security

- No ads, analytics or third-party trackers. Health data is stored on-device.
- The AI key is server-only. The coach endpoint validates input with Zod, caps body size, rate-limits and supports an access token.
- Only minimised aggregates are sent to the AI. Name, age, body measurements and notes are never sent. Profile shows the exact payload.
- Export, restore and delete-all are in Profile. The Supabase schema enables RLS on every table, and provider tokens have no client policy at all.

## Roadmap

1. **Cloud sync:**
   - Supabase Auth and sync of the IndexedDB tables, using `updatedAt` last-write-wins plus an outbox
   - Device migration via import
2. **Web Push** for background reminders (VAPID + scheduled job).
3. **Garmin live sync** once Garmin approves an application, plus a parser for Garmin's full JSON data export.
4. **More tests:** Playwright end-to-end tests for core flows, and accessibility audits.
