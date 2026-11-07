/**
 * The research and coaching literature behind each Human OS feature.
 * Shown in-app at /evidence. Keep entries to well-established sources.
 */

export interface Source {
  cite: string;
  note?: string;
}

export interface Method {
  id: string;
  area: "Training load" | "Running" | "Heart rate" | "Recovery & HRV" | "Season planning" | "Injury & illness" | "Fuel" | "Sleep" | "Strength" | "Habits";
  title: string;
  inApp: string;
  how: string;
  caveat?: string;
  sources: Source[];
}

export const METHODS: Method[] = [
  {
    id: "trimp",
    area: "Training load",
    title: "Session load (TRIMP / session-RPE)",
    inApp: "Train → Analytics: Load, Fitness, Fatigue",
    how: "Each session's load = minutes in each heart-rate zone × zone number (1–5). Without heart-rate data: minutes × effort (RPE) scaled to the same range.",
    sources: [
      { cite: "Edwards S. The Heart Rate Monitor Book. 1993." },
      { cite: "Foster C, et al. A new approach to monitoring exercise training. J Strength Cond Res. 2001." },
    ],
  },
  {
    id: "pmc",
    area: "Training load",
    title: "Fitness, fatigue and form (impulse-response model)",
    inApp: "Train → Analytics: CTL / ATL / TSB chart",
    how: "Fitness = 42-day and fatigue = 7-day exponentially weighted load; form = fitness − fatigue. Performance tends to be best when fitness is high and fatigue has fallen.",
    caveat: "A model of averages: individual responses differ, and it ignores sleep, stress and illness.",
    sources: [{ cite: "Banister EW, et al. A systems model of training for athletic performance. Aust J Sports Med. 1975." }],
  },
  {
    id: "acwr",
    area: "Training load",
    title: "Load spikes, monotony and strain",
    inApp: "Train → Analytics: Load flag; also a Readiness signal",
    how: "This week's load vs your average week (acute:chronic ratio). Monotony = mean ÷ SD of daily load; strain = weekly load × monotony.",
    caveat: "The ratio is debated as an injury predictor; Human OS uses it only as a prompt to avoid sudden jumps.",
    sources: [
      { cite: "Gabbett TJ. The training–injury prevention paradox. Br J Sports Med. 2016." },
      { cite: "Impellizzeri FM, et al. Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. Int J Sports Physiol Perform. 2020." },
      { cite: "Foster C. Monitoring training in athletes with reference to overtraining syndrome. Med Sci Sports Exerc. 1998." },
    ],
  },
  {
    id: "polarized",
    area: "Training load",
    title: "Intensity distribution (≈80/20)",
    inApp: "Train → Analytics: time in zones",
    how: "Successful endurance athletes do most sessions easy and a minority hard; the app shows your easy vs hard share.",
    sources: [{ cite: "Seiler S. What is best practice for training intensity and duration distribution in endurance athletes? Int J Sports Physiol Perform. 2010." }],
  },
  {
    id: "vdot",
    area: "Running",
    title: "VDOT, race predictions and training paces",
    inApp: "Train → Analytics: Running fitness",
    how: "VDOT is calculated from your fastest 5 km / 10 km efforts using Daniels & Gilbert's oxygen-cost equations, then used to predict race times and set Easy/Marathon/Threshold/Interval/Repetition paces.",
    caveat: "Fast segments of training runs usually underestimate race fitness, so predictions are conservative until you log a real race.",
    sources: [
      { cite: "Daniels J, Gilbert J. Oxygen Power: Performance Tables for Distance Runners. 1979." },
      { cite: "Daniels J. Daniels' Running Formula, 3rd ed. Human Kinetics; 2014." },
      { cite: "Riegel PS. Athletic records and human endurance. American Scientist. 1981.", note: "classic alternative prediction formula" },
    ],
  },
  {
    id: "zones",
    area: "Heart rate",
    title: "Heart-rate zones: %HRmax, heart-rate reserve, lactate threshold",
    inApp: "Profile → Performance; Train → Analytics: zones",
    how: "Choose %HRmax, Karvonen heart-rate reserve (uses your resting HR) or Friel's lactate-threshold zones. HRmax = highest seen in the last year, else Tanaka's 208 − 0.7 × age.",
    caveat: "Garmin's time-in-zone uses the zones set on your watch.",
    sources: [
      { cite: "Karvonen MJ, Kentala E, Mustala O. The effects of training on heart rate. Ann Med Exp Biol Fenn. 1957." },
      { cite: "Tanaka H, Monahan KD, Seals DR. Age-predicted maximal heart rate revisited. J Am Coll Cardiol. 2001." },
      { cite: "Friel J. The Triathlete's Training Bible. VeloPress." },
    ],
  },
  {
    id: "hrv",
    area: "Recovery & HRV",
    title: "HRV-guided training",
    inApp: "Health → Recovery and Train → Analytics: HRV trend; Readiness",
    how: "Uses the 7-day rolling average of ln(HRV) against your normal range (60-day mean ± 0.5 SD), plus day-to-day variation, rather than single readings.",
    caveat: "Lifestyle stress, alcohol and illness move HRV too; it is one input among several.",
    sources: [
      { cite: "Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M. Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring. Sports Med. 2013." },
      { cite: "Kiviniemi AM, et al. Endurance training guided individually by daily heart rate variability measurements. Eur J Appl Physiol. 2007." },
      { cite: "Buchheit M. Monitoring training status with HR measures: do all roads lead to Rome? Front Physiol. 2014." },
    ],
  },
  {
    id: "wellness",
    area: "Recovery & HRV",
    title: "Subjective wellness check-in",
    inApp: "Today → morning check-in; Recovery and Readiness",
    how: "How you feel (energy, tiredness, focus, muscle soreness, stress, symptoms) is combined with device data; high soreness or stress counts as a readiness signal, and feeling unwell always outranks a good score.",
    sources: [{ cite: "Hooper SL, Mackinnon LT. Monitoring overtraining in athletes. Sports Med. 1995." }],
  },
  {
    id: "periodization",
    area: "Season planning",
    title: "Periodization and taper",
    inApp: "Train → Week: season plan from your goal race",
    how: "Base → Build → Peak → Taper → Race, with a lighter week every fourth loading week and gradual load growth. Taper cuts volume ≈40–60% over about two weeks while keeping some intensity.",
    sources: [
      { cite: "Bompa TO, Haff GG. Periodization: Theory and Methodology of Training. Human Kinetics." },
      { cite: "Mujika I, Padilla S. Scientific bases for precompetition tapering strategies. Med Sci Sports Exerc. 2003." },
      { cite: "Bosquet L, et al. Effects of tapering on performance: a meta-analysis. Med Sci Sports Exerc. 2007." },
    ],
  },
  {
    id: "prescription",
    area: "Season planning",
    title: "Workout prescription",
    inApp: "Today → Today's session; Train → Week",
    how: "Each week mixes mostly easy sessions with one or two quality sessions (threshold, intervals or race pace depending on the phase), a long session at the weekend and strength 1–2×. Targets come from your VDOT paces or heart-rate zones. Today's session is only ever made easier — never harder — by low readiness, injury or illness.",
    sources: [
      { cite: "Daniels J. Daniels' Running Formula, 3rd ed. Human Kinetics; 2014." },
      { cite: "Seiler S. What is best practice for training intensity and duration distribution in endurance athletes? Int J Sports Physiol Perform. 2010." },
      { cite: "Friel J. The Triathlete's Training Bible. VeloPress." },
    ],
  },
  {
    id: "conditions",
    area: "Injury & illness",
    title: "Injury & illness log and return to training",
    inApp: "Health → Injury",
    how: "Active injuries and illnesses change readiness and today's session. Illness with below-the-neck symptoms means rest; return gradually once symptom-free. Injuries follow pain-guided, graded run/walk progression. The log shows your load ratio before each onset.",
    caveat: "General guidance, not a diagnosis or treatment plan. Severe or persistent problems need a clinician.",
    sources: [
      { cite: "Soligard T, et al. How much is too much? (Part 1) IOC consensus statement on load in sport and risk of injury. Br J Sports Med. 2016." },
      { cite: "Schwellnus M, et al. How much is too much? (Part 2) IOC consensus statement on load in sport and risk of illness. Br J Sports Med. 2016." },
    ],
  },
  {
    id: "fuel",
    area: "Fuel",
    title: "Protein, carbohydrate and fluid targets",
    inApp: "Train → Analytics: Fuel today",
    how: "Protein 1.4–2.0 g/kg/day; carbohydrate scaled to training time (≈3–5 g/kg light days up to 8–12 g/kg very long days). Ranges to support training — never a restriction.",
    sources: [
      { cite: "Thomas DT, Erdman KA, Burke LM. Nutrition and athletic performance (ACSM/AND/DC joint position). Med Sci Sports Exerc. 2016." },
      { cite: "Jäger R, et al. ISSN position stand: protein and exercise. J Int Soc Sports Nutr. 2017." },
      { cite: "Morton RW, et al. A systematic review, meta-analysis and meta-regression of protein supplementation and resistance training. Br J Sports Med. 2018." },
      { cite: "Guest NS, et al. ISSN position stand: caffeine and exercise performance. J Int Soc Sports Nutr. 2021.", note: "caffeine timing guidance" },
    ],
  },
  {
    id: "sleep",
    area: "Sleep",
    title: "Sleep need, regularity and debt",
    inApp: "Health → Sleep; Sleep score; sleep debt",
    how: "Personal sleep need (adults generally 7+ h), consistent timing, and the running shortfall over recent nights.",
    sources: [
      { cite: "Watson NF, et al. Recommended amount of sleep for a healthy adult (AASM/SRS). Sleep. 2015." },
      { cite: "Phillips AJK, et al. Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing. Sci Rep. 2017." },
      { cite: "Mah CD, et al. The effects of sleep extension on the athletic performance of collegiate basketball players. Sleep. 2011." },
    ],
  },
  {
    id: "strength",
    area: "Strength",
    title: "Estimated 1RM and progressive overload",
    inApp: "Train → Strength",
    how: "Estimated one-rep max (Epley) trend per exercise; weekly hard sets per muscle group against a 10–20 set range; sets logged with reps in reserve (RIR) — sets with RIR above 4 don't count as hard.",
    sources: [
      { cite: "Epley B. Poundage Chart. Boyd Epley Workout; 1985." },
      { cite: "Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass. J Sports Sci. 2017." },
      { cite: "Zourdos MC, et al. Novel resistance training-specific RPE scale measuring repetitions in reserve. J Strength Cond Res. 2016." },
    ],
  },
  {
    id: "habits",
    area: "Habits",
    title: "Habit formation",
    inApp: "Habits, routines, 45-day challenge",
    how: "Small, cue-linked habits with a minimum version; missing a day doesn't reset progress. Habits take weeks to months to become automatic.",
    sources: [
      { cite: "Lally P, et al. How are habits formed: modelling habit formation in the real world. Eur J Soc Psychol. 2010." },
      { cite: "Gollwitzer PM. Implementation intentions: strong effects of simple plans. Am Psychol. 1999." },
    ],
  },
];
