-- Human OS — cloud schema (mirrors the local IndexedDB store in src/lib/db.ts).
-- Not used yet: the current build is local-first. Apply this when enabling
-- Supabase Auth + sync. Every table is owned by a user and locked with RLS.
--
-- Conventions:
--   * instants are timestamptz (UTC); calendar days are `date` in the user's zone
--   * `source` preserves provenance: manual | garmin | csv | device
--   * unique constraints make imports idempotent (no duplicates)
--   * AI output lives only in ai_summaries — never mixed with measurements

create extension if not exists "pgcrypto";

create type data_source as enum ('manual', 'garmin', 'csv', 'device');

create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  birth_year int check (birth_year between 1900 and 2100),
  height_cm numeric check (height_cm between 50 and 260),
  units text not null default 'metric' check (units in ('metric', 'imperial')),
  time_zone text not null default 'UTC',
  settings jsonb not null default '{}'::jsonb,       -- goals, routines, notification prefs, hidden metrics
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  metric text not null check (metric in ('rhr','hrv','hrvStatus','bodyBattery','stress','steps','activeMin','calories','respiration')),
  value numeric not null,
  source data_source not null,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day, metric, source)
);

create table sleep_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  day date not null,                                  -- wake-up day
  bedtime timestamptz not null,
  wake_time timestamptz not null check (wake_time > bedtime),
  asleep_min int check (asleep_min >= 0),             -- null = unknown (never 0)
  score int check (score between 0 and 100),          -- device score, kept as-is
  deep_min int, light_min int, rem_min int, awake_min int, latency_min int, awakenings int,
  quality smallint check (quality between 1 and 5),
  alertness smallint check (alertness between 1 and 5),
  notes text,
  source data_source not null,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day, source)
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  start_at timestamptz not null,
  type text not null,
  title text,
  duration_min numeric not null check (duration_min > 0),
  distance_km numeric, avg_hr int, max_hr int, cadence int, elevation_m numeric, calories int,
  rpe smallint check (rpe between 1 and 10),
  sets jsonb,                                          -- [{exercise, reps, weightKg, restSec}]
  notes text,
  source data_source not null,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_id)
);

create table body_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  weight_kg numeric, waist_cm numeric, body_fat_pct numeric, muscle_kg numeric,
  notes text,
  source data_source not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  category text not null,
  description text,
  frequency jsonb not null,                            -- {type:'daily'} | {type:'days',days:[]} | {type:'weekly',timesPerWeek}
  target numeric, unit text, minimum_version text, criteria text,
  reminder_time time, routine text check (routine in ('morning','evening')),
  scheduled_time time, duration_min int,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  habit_id uuid not null references habits on delete cascade,
  day date not null,
  status text not null check (status in ('done','partial','skipped','rest')),
  value numeric, note text,
  updated_at timestamptz not null default now(),
  unique (habit_id, day)
);

create table checkins (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  energy smallint check (energy between 1 and 10),
  fatigue smallint check (fatigue between 1 and 10),
  focus smallint check (focus between 1 and 10),
  mood smallint check (mood between 1 and 10),
  unwell boolean,
  symptoms text[] not null default '{}',
  intention text, note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table lifestyle_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  at timestamptz not null,
  kind text not null check (kind in ('water','caffeine','alcohol','meal','outdoors','morningLight','screenBeforeBed')),
  amount numeric, label text, note text,
  created_at timestamptz not null default now()
);

create table experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null, question text, behavior text not null,
  metrics text[] not null,
  baseline_days int not null,
  start_day date not null, end_day date not null check (end_day >= start_day),
  status text not null check (status in ('planned','active','completed','abandoned')),
  conclusion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table experiment_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  experiment_id uuid not null references experiments on delete cascade,
  day date not null,
  adhered boolean not null,
  note text,
  unique (experiment_id, day)
);

create table challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  start_day date not null,
  habit_ids uuid[] not null,
  intentions text,
  status text not null check (status in ('active','completed','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  kind text not null check (kind in ('daily','weekly','monthly','challenge')),
  ref text not null,
  worked text, difficult text, change text, body text,
  updated_at timestamptz not null default now()
);

create table ai_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('daily','weekly','chat')),
  day date not null,
  question text,
  content text not null,
  model text not null,
  correction text,
  created_at timestamptz not null default now()
);

create table coach_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  body text not null check (length(body) <= 300),
  created_at timestamptz not null default now()
);

create table achievements (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  category text not null,
  title text not null,
  achieved_on date not null,
  unlocked_at timestamptz not null default now(),
  seen boolean not null default false,
  snapshot jsonb not null,                              -- headline, message, description, verified stats
  poster jsonb,
  primary key (user_id, key)
);

create table custom_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null, description text,
  category text not null, kind text not null,
  habit_id uuid references habits on delete set null,
  activity text, target numeric, completed_on date,
  created_at timestamptz not null default now()
);

create table sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  at timestamptz not null default now(),
  status text not null check (status in ('ok','partial','error')),
  message text not null,
  inserted int not null default 0,
  skipped int not null default 0
);

-- Provider tokens: server only. No RLS policy for `authenticated` at all, so the
-- browser can never read them; only the service role (server functions) can.
create table integration_tokens (
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  access_token_encrypted bytea not null,
  refresh_token_encrypted bytea,
  expires_at timestamptz,
  scopes text[],
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

-- Row-level security: each user sees only their own rows.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','daily_metrics','sleep_records','workouts','body_entries','habits','habit_logs',
    'checkins','lifestyle_logs','experiments','experiment_logs','challenges','reflections',
    'ai_summaries','coach_memory','achievements','custom_achievements','sync_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own rows" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
alter table integration_tokens enable row level security;

create index on daily_metrics (user_id, metric, day);
create index on sleep_records (user_id, day);
create index on workouts (user_id, day);
create index on habit_logs (user_id, day);
create index on lifestyle_logs (user_id, day);
