# Training analytics — methods

Source: `src/lib/analytics.ts` (tests: `tests/analytics.test.ts`). These are Human OS estimates using published training-science methods. They are not Garmin, TrainingPeaks or WHOOP numbers, and they are not medical advice.

| Metric | Method |
|---|---|
| Session load | **Edwards TRIMP**: Σ minutes in HR zone × zone (1–5), from Garmin's per-activity zone times. Fallbacks: minutes × RPE × 0.4 (session-RPE scaled to the same range), then minutes × 1.5 (assumes easy effort; flagged as an estimate). |
| Fitness (CTL) | 42-day exponentially weighted daily load. Needs ~6 weeks of history to settle. |
| Fatigue (ATL) | 7-day exponentially weighted daily load. |
| Form (TSB) | Yesterday's CTL − ATL (form at the start of the day). Bands: > +25 very fresh · +5…+25 fresh · −10…+5 neutral · −30…−10 absorbing · < −30 deep fatigue. |
| Load flag (ACWR) | Last 7 days ÷ average week of the last 28. Needs 3 weeks of history. < 0.8 low · 0.8–1.3 in range · 1.3–1.5 rising · > 1.5 spike. Spikes are *associated* with injury in studies, not a prediction for you. A spike also counts as one "low signal" in Readiness. |
| Monotony / strain | Foster: mean ÷ SD of the last 7 daily loads; strain = weekly load × monotony. |
| Volume | Hours, sessions and distance per period and per sport. |
| HRmax & zones | Highest max HR seen in the last year (3+ sessions), else Tanaka 208 − 0.7 × age. Zones at 50/60/70/80/90 % HRmax. Time-in-zone from Garmin; easy = Z1–2, hard = Z4–5. |
| PRs | Fastest 1 km / mile / 5 km / 10 km (Garmin's fastest splits within runs), longest run/ride/swim, biggest training week. |
| Sleep debt | Σ shortfall vs your own sleep need over the last 7 logged nights. A surplus doesn't cancel debt. |
