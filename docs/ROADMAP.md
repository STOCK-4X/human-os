# Human OS — sport & health manager roadmap

Each step builds on published methods (see `src/lib/evidence.ts` and the in-app **Methods & evidence** page).

## Done
- Garmin Personal API sync, plus Apple Health and CSV.
- Training load (TRIMP / sRPE), fitness / fatigue / form, load flag, monotony and strain.
- Daniels VDOT, race predictions and training paces.
- HR zones by %HRmax, HR reserve or lactate-threshold HR; time in zones and the 80/20 split.
- HRV-guided readiness: 7-day ln(HRV) against your normal range.
- Season periodization from a goal race, with a capped ramp, deload weeks and a taper.
- Fuel targets (ISSN / ACSM), sleep debt, PRs.

## Done (round 2)
1. **Workout prescription.** Weekly sessions from season phase, VDOT paces or HR zones, and level. Today's session only ever gets easier with low readiness, injury or illness.
2. **Race log.** Mark runs as races (Garmin race events detected automatically). Races take priority for VDOT. VDOT history by month.
3. **More Garmin data.** Overnight SpO₂, race flag, clear message when the Personal API key is deleted or expired.
4. **Strength programming.** Hard sets per muscle group each week against 10–20, RIR per set, e1RM trend per exercise.
5. **Wellness.** Soreness and stress in the check-in feed Readiness and Trends.
6. **Injury & illness log.** Graded return plans, load ratio before each onset, effects on readiness and sessions.
7. **AI coach with methods.** Receives CTL/ATL/TSB, ACWR, VDOT, HRV trend, season phase, today's session and active conditions.

## Next
1. **Cloud sync and multiple devices.** Supabase Auth and row sync, so phone and desktop share data. Needs Supabase Auth set up on your side.
2. **Garmin extras.** Weight, Body Battery curve and `.FIT` laps, once their Personal API response shapes are verified.
3. **Lap/interval analysis** from `.FIT` files.
