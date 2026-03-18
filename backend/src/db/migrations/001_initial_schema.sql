-- ============================================================================
-- THE EDGE — Database Schema v2
-- Migration 001: Initial Schema with Row-Level Security
-- ============================================================================
-- Run this migration against your Supabase project via the SQL Editor.
-- All tables use RLS to enforce per-user data isolation.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. User Profiles
-- ---------------------------------------------------------------------------
-- Created automatically on auth.signup via trigger.
-- Stores onboarding data, subscription tier, and preferences.

create table if not exists public.user_profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null default '',
  professional_context text not null default '',
  communication_style  text not null default 'Direct and specific',
  experience_level     text not null default 'beginner'
                       check (experience_level in ('beginner', 'intermediate', 'advanced')),
  goals                text[] not null default '{}',
  subscription_tier    text not null default 'free'
                       check (subscription_tier in ('free', 'pro')),
  subscription_expires_at timestamptz,
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

-- Insert profile row on signup via trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop if exists to make migration idempotent
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Sessions
-- ---------------------------------------------------------------------------
-- Tracks the lifecycle of each daily training session.

create table if not exists public.sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  day                  integer not null,
  date                 date not null default current_date,
  phase                text not null default 'lesson'
                       check (phase in ('checkin', 'lesson', 'retrieval', 'roleplay', 'debrief', 'mission', 'complete')),
  concept_id           text,
  character_id         text,
  is_review            boolean not null default false,
  roleplay_transcript  jsonb not null default '[]'::jsonb,
  coach_messages       text[] not null default '{}',
  commands_used        text[] not null default '{}',
  checkin_outcome      text,
  lesson_content       text,
  debrief_content      text,
  scores               jsonb,
  mission              text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_sessions_user_id on public.sessions (user_id);
create index idx_sessions_user_date on public.sessions (user_id, date);

alter table public.sessions enable row level security;

create policy "Users can read own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sessions"
  on public.sessions for update
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Nuance Ledger
-- ---------------------------------------------------------------------------
-- One row per completed session with scores and behavioural analysis.

create table if not exists public.ledger (
  id                          bigint generated always as identity primary key,
  user_id                     uuid not null references auth.users (id) on delete cascade,
  day                         integer not null,
  date                        date not null default current_date,
  concept                     text not null,
  domain                      text not null,
  character                   text not null,
  difficulty                  integer not null default 3 check (difficulty between 1 and 5),
  score_technique_application integer not null check (score_technique_application between 1 and 5),
  score_tactical_awareness    integer not null check (score_tactical_awareness between 1 and 5),
  score_frame_control         integer not null check (score_frame_control between 1 and 5),
  score_emotional_regulation  integer not null check (score_emotional_regulation between 1 and 5),
  score_strategic_outcome     integer not null check (score_strategic_outcome between 1 and 5),
  behavioral_weakness_summary text not null default '',
  key_moment                  text not null default '',
  mission                     text not null default '',
  mission_outcome             text not null default '',
  commands_used               text[] not null default '{}',
  session_completed           boolean not null default true,
  created_at                  timestamptz not null default now()
);

create index idx_ledger_user_id on public.ledger (user_id);
create index idx_ledger_user_day on public.ledger (user_id, day);
create index idx_ledger_user_date on public.ledger (user_id, date);

alter table public.ledger enable row level security;

create policy "Users can read own ledger"
  on public.ledger for select
  using (auth.uid() = user_id);

create policy "Users can insert own ledger"
  on public.ledger for insert
  with check (auth.uid() = user_id);

create policy "Users can update own ledger"
  on public.ledger for update
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Spaced Repetition
-- ---------------------------------------------------------------------------
-- SM-2 tracking per concept per user.

create table if not exists public.spaced_repetition (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  concept_id      text not null,
  last_practiced  date not null default current_date,
  ease_factor     numeric(4,2) not null default 2.50,
  interval        integer not null default 1,
  next_review     date not null default current_date,
  practice_count  integer not null default 0,
  last_score_avg  numeric(3,1) not null default 0.0,
  updated_at      timestamptz not null default now(),
  unique (user_id, concept_id)
);

create index idx_sr_user_id on public.spaced_repetition (user_id);
create index idx_sr_user_review on public.spaced_repetition (user_id, next_review);

alter table public.spaced_repetition enable row level security;

create policy "Users can read own SR data"
  on public.spaced_repetition for select
  using (auth.uid() = user_id);

create policy "Users can insert own SR data"
  on public.spaced_repetition for insert
  with check (auth.uid() = user_id);

create policy "Users can update own SR data"
  on public.spaced_repetition for update
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. Session Usage (weekly rate limiting for free tier)
-- ---------------------------------------------------------------------------

create table if not exists public.session_usage (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  week_start     date not null,
  session_count  integer not null default 0,
  unique (user_id, week_start)
);

create index idx_usage_user_week on public.session_usage (user_id, week_start);

alter table public.session_usage enable row level security;

create policy "Users can read own usage"
  on public.session_usage for select
  using (auth.uid() = user_id);

create policy "Users can insert own usage"
  on public.session_usage for insert
  with check (auth.uid() = user_id);

create policy "Users can update own usage"
  on public.session_usage for update
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. Subscriptions (App Store receipt tracking)
-- ---------------------------------------------------------------------------

create table if not exists public.subscriptions (
  id                    bigint generated always as identity primary key,
  user_id               uuid not null references auth.users (id) on delete cascade unique,
  product_id            text not null,
  original_transaction_id text,
  receipt_data          text,
  status                text not null default 'active'
                        check (status in ('active', 'expired', 'cancelled', 'grace_period')),
  expires_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Subscription inserts/updates are done by the backend service role (bypasses RLS)

-- ---------------------------------------------------------------------------
-- 7. Helper function: auto-update updated_at
-- ---------------------------------------------------------------------------

create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.user_profiles
  for each row execute function public.update_updated_at();

create trigger set_updated_at before update on public.sessions
  for each row execute function public.update_updated_at();

create trigger set_updated_at before update on public.spaced_repetition
  for each row execute function public.update_updated_at();

create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.update_updated_at();
