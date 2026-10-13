# Reminders and notifications

## What's implemented

- Reminders are evaluated in the page every minute (`src/lib/notifications.ts`) and shown through the service worker's `showNotification`:
  - wind-down / bedtime
  - morning routine
  - evening prep
  - per-habit reminder times
  - training days
  - hydration
  - weekly review
- Each category can be switched on or off. You can also set quiet hours (bedtime reminders still arrive), active weekdays and the hydration interval.
- Reminders for habits that are already completed are skipped. Each reminder fires at most once per day.

## Platform limits — be aware

| Platform | Works? |
|---|---|
| Android Chrome, desktop Chrome/Edge/Firefox | Yes, while the app or a tab is open or was recently backgrounded |
| iPhone/iPad (iOS 16.4+) | Only after **Add to Home Screen**, then opening from the icon and granting permission from a button tap. Not in a Safari tab. |
| Any platform, app fully closed | **Not yet.** This needs Web Push (below). |

iOS web push has had reports of subscriptions silently lapsing after long inactivity. EU availability has changed over time; check Apple's current documentation.

## Background delivery (next phase)

True background reminders need Web Push:
1. Generate VAPID keys and store them in server env.
2. Subscribe with `pushManager.subscribe` from a user gesture, and save the subscription in Supabase.
3. Run a scheduled server job (for example Vercel Cron or a Supabase scheduled function) that computes due reminders per user. Reuse `dueReminders()` with server-side data, and send them with the `web-push` library.
4. Handle `push` in `public/sw.js`.

Completion state must be synced to the server for the "don't remind if done" rule to hold, which is why this follows cloud sync.
