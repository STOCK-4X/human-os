# How Human OS scores work

Source of truth: `src/lib/scores.ts` (tests: `tests/scores.test.ts`). The same explanation is shown in the app under each score → **How is this calculated?**

These are **custom Human OS estimates**. They are not WHOOP Recovery, not Garmin Body Battery, not Garmin's sleep score, and **not medically validated**. Device values (Body Battery, the device sleep score) are always shown separately and unchanged.

## Shared rules

- Each input becomes a 0–100 sub-score. The score is the weighted average of the inputs that are present. Missing inputs are skipped and the remaining weights re-scaled. Missing data is never treated as zero.
- Physiological inputs are compared with **your own 28-day baseline**: the 28 days before today, with today excluded. A baseline needs at least 7 values. Mapping: `65 + 20 × z`, clipped to 0–100, where z is today's distance from your average in standard deviations. Minimum SDs (HRV 3 ms, RHR 1.5 bpm, breathing 0.5) stop tiny day-to-day noise from swinging the score.
- **Confidence** is high when all inputs are present with established baselines. It is medium when one or two are missing or estimated, and low otherwise.

## Sleep score (0–100)

| Input | Weight | Sub-score |
|---|---|---|
| Duration vs *your* sleep need | 50 | 100 at ≥ need, 0 at 60 % of need |
| Timing vs your previous 7 nights | 25 | 100 = same bed + wake times; 0 = 2 h combined shift (needs 3 prior nights) |
| Efficiency (asleep ÷ in bed) | 15 | 100 at ≥ 90 %, 0 at ≤ 70 % (only with measured time asleep) |
| Your quality rating (1–5) | 10 | linear |

- No sleep record means no score.
- If time asleep wasn't measured, it is estimated as time in bed minus your usual time to fall asleep, and confidence is lowered.
- Sleep stages are not used, because consumer wearables estimate them imprecisely.

## Recovery score (0–100 %)

| Input | Weight | Notes |
|---|---|---|
| HRV vs baseline | 30 | higher is better |
| Resting HR vs baseline | 25 | lower is better |
| Sleep score | 20 | |
| Recent training load | 10 | load = minutes × RPE (default 5). Last 2 days (yesterday + ½ day before) vs your typical session over the past month; needs ≥ 3 sessions |
| Physical tiredness (check-in, 1–10) | 10 | |
| Breathing rate vs baseline | 5 | lower is better; capped at 80 so it only ever pulls down |

**Requirements:**
- HRV or resting HR with an established baseline.
- At least 50 % of the total weight present.

Otherwise the app shows **"Not enough data to calculate a reliable score."**

**Feeling unwell overrides the wearables.** If you mark yourself as unwell, or report illness, fever, chest pain, dizziness or unusual fatigue, the score is capped at 33 %.

**Deliberately excluded:** Garmin stress and Body Battery. Both are derived from heart-rate variability, so adding them would count HRV two or three times.

Bands: ≥ 67 Recovered, 34–66 Moderate, < 34 Low.

## Energy

- **Garmin Body Battery** is shown exactly as Garmin reports it, with the change since yesterday.
- **Human OS Energy (0–100)** is a separate, clearly labelled estimate of how charged you are likely to feel:
  - **With Body Battery:** Body Battery 40 · Sleep score 30 · your energy rating 30. Stress and activity aren't added, because Body Battery already includes them.
  - **Without Body Battery:** Sleep score 35 · your energy rating 35 · training load 15 · inverted device stress 15.
  - Requires Body Battery or a check-in, and at least 60 % of the weight. It is an estimate, not a measurement of energy available to your body.

Intraday Body Battery charge/drain curves need the live Garmin API (see `GARMIN.md`). Today only daily values are stored.

## Readiness

| Level | When |
|---|---|
| Recovery focus (symptom-driven) | Chest pain or dizziness (plus a safety message), or feeling unwell / ill / feverish. Wearable data cannot override this. |
| Recovery focus | 2 or more independent low signals |
| Moderate | Exactly 1 low signal |
| Ready | No low signals **and** at least 2 independent sources (recovery score, sleep score, check-in) |
| Insufficient data | No sources, or only one source and no low signals |

Low signals:
- Recovery < 34
- Sleep score < 50
- Tiredness ≥ 7/10
- Energy ≤ 3/10
- Reported injury or unusual fatigue
- A hard session yesterday (RPE ≥ 8 or ≥ 90 min)

Readiness never relies on one metric alone, and a high score never escalates intensity: "Ready" means the *planned* activity may be appropriate. The training advice in the daily briefing and the Train tab is derived from Readiness, so every screen agrees.

## Trends and "do your wearables match how you feel?"

- Each score is recomputed per day from stored records for the trend charts and weekly/monthly reviews.
- The Trends tab correlates your 1–10 ratings with Body Battery and the scores (Pearson r, minimum 10 paired days), labelled as association, not cause.
