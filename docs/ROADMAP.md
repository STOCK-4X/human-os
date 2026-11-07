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

## Next
1. **Workout prescription.** Turn the season phase, Readiness and paces into specific sessions (e.g. "T: 3 × 10 min @ 7:43/km"), and swap a session automatically on low-readiness days.
2. **Race log and better VDOT.** Mark a race and use it for VDOT. Track VDOT over time. Add Garmin VO2max / race predictor if exposed.
3. **More Garmin data.** Body Battery curve, SpO₂, weight → body composition trend, `.FIT` laps for interval analysis.
4. **Strength programming.** Weekly hard sets per muscle group (≈10–20, Schoenfeld 2017), RIR-based autoregulation (Zourdos 2016), e1RM trend charts.
5. **Wellness questionnaire.** Hooper-style soreness / stress / sleep / fatigue (1–7), tracked against HRV and load.
6. **Injury & illness log.** Days lost, associated load, return-to-run progression.
7. **AI coach with methods.** Weekly plan review that cites the methods above and explains trade-offs.
8. **Cloud sync and multiple devices.** Supabase Auth and row sync, so phone and desktop share data.
