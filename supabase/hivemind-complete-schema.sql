-- =============================================================================
-- HiveMind — Complete Supabase schema (paste into SQL Editor)
--
-- Trouble signing in / sign up shows Postgres "does not exist" or "guardian_…"?
-- Usually the project schema is incomplete or points at the wrong DB. Apply this
-- file to the same Supabase project as VITE_SUPABASE_URL (not a blank project).
--
-- CODEBASE SURFACE (today):
--   profiles, watchlists, watchlist_tokens, token_reports, guardian_alerts,
--   tracked_tokens  →  src/lib/supabaseData.ts; profiles.paid_plan also
--   stripe webhook  →  api/webhook.ts (service role upserts profiles)
--
-- Also defined here (not referenced in app code yet — future / admin / webhook):
--   subscriptions  — Stripe subscription rows per user
--   token_scans      — persisted Watcher / token scan events (“scans”)
--
-- Service role bypasses RLS. Anon key cannot read private user data; RLS gates
-- authenticated access. Re-runnable: drops named policies before recreate.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles  (auth-linked; paid_plan used by app + Stripe webhook)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  display_name text,
  paid_plan text not null default 'FREE' check (paid_plan in ('FREE', 'BASIC', 'PRO')),
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists paid_plan text not null default 'FREE';
alter table public.profiles drop constraint if exists profiles_paid_plan_check;
alter table public.profiles
  add constraint profiles_paid_plan_check check (paid_plan in ('FREE', 'BASIC', 'PRO'));

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. watchlists
-- ---------------------------------------------------------------------------

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My Watchlist',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. watchlist_tokens
-- ---------------------------------------------------------------------------

create table if not exists public.watchlist_tokens (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists (id) on delete cascade,
  token_symbol text not null,
  token_name text not null,
  token_address text,
  created_at timestamptz not null default now(),
  unique (watchlist_id, token_symbol)
);

-- ---------------------------------------------------------------------------
-- 4. token_reports  (in-app “reports” from TokenCard / Pulse — table name in code)
-- ---------------------------------------------------------------------------

create table if not exists public.token_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_symbol text not null,
  token_name text,
  token_address text,
  reason text not null,
  details text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. guardian_alerts
-- ---------------------------------------------------------------------------

create table if not exists public.guardian_alerts (
  id uuid primary key default gen_random_uuid(),
  token_symbol text not null,
  severity text not null check (severity in ('SAFE', 'WARNING', 'DANGER')),
  title text not null,
  message text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. tracked_tokens  (shared registry; app upserts & lists)
-- ---------------------------------------------------------------------------

create table if not exists public.tracked_tokens (
  id uuid primary key default gen_random_uuid(),
  token_symbol text not null,
  token_name text not null,
  token_address text,
  chain text not null default 'solana',
  price numeric,
  volume_24h numeric,
  liquidity numeric,
  market_cap numeric,
  guardian_score integer check (guardian_score between 0 and 100),
  guardian_status text check (guardian_status in ('SAFE', 'WARNING', 'DANGER')),
  updated_at timestamptz not null default now(),
  unique (token_symbol, chain)
);

-- ---------------------------------------------------------------------------
-- 7. subscriptions  (Stripe — not in TS client yet; for webhook expansion / UI)
-- ---------------------------------------------------------------------------

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('BASIC', 'PRO')),
  status text not null default 'active'
    check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. token_scans  (“scans” — not in TS client yet; for Watcher audit trail)
-- ---------------------------------------------------------------------------

create table if not exists public.token_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_symbol text not null,
  token_name text,
  mint_address text,
  chain text not null default 'solana',
  risk_score integer check (risk_score between 0 and 100),
  guardian_status text check (guardian_status in ('SAFE', 'WARNING', 'DANGER')),
  scan_source text not null default 'app' check (scan_source in ('app', 'pulse', 'feed', 'detail', 'watcher', 'api')),
  raw jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_profiles_paid_plan on public.profiles (paid_plan);
create index if not exists idx_watchlists_user_id on public.watchlists (user_id);
create index if not exists idx_watchlist_tokens_watchlist_id on public.watchlist_tokens (watchlist_id);
create index if not exists idx_token_reports_user_created on public.token_reports (user_id, created_at desc);
create index if not exists idx_guardian_alerts_active_created on public.guardian_alerts (active, created_at desc) where active = true;
create index if not exists idx_tracked_tokens_updated on public.tracked_tokens (updated_at desc);
create index if not exists idx_subscriptions_user_id on public.subscriptions (user_id);
create index if not exists idx_subscriptions_stripe_subscription on public.subscriptions (stripe_subscription_id);
create index if not exists idx_token_scans_user_created on public.token_scans (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Auto-create profile row on signup (server-side; optional if you only upsert client)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_raw text;
  slug_pref text;
  local_part text;
  slug_email text;
  short_id text;
  uname text;
  dname text;
  use_pref boolean := false;
begin
  short_id := substring(replace(new.id::text, '-', '') from 1 for 8);

  meta_raw := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  slug_pref := lower(regexp_replace(meta_raw, '[^a-zA-Z0-9_]', '_', 'g'));
  slug_pref := regexp_replace(slug_pref, '_+', '_', 'g');
  slug_pref := trim(both '_' from slug_pref);
  slug_pref := left(slug_pref, 30);

  if length(slug_pref) >= 3 then
    uname := slug_pref;
    if exists (select 1 from public.profiles where username = uname) then
      uname := left(slug_pref, 20) || '_' || short_id;
    end if;
    dname := initcap(replace(slug_pref, '_', ' '));
    use_pref := true;
  end if;

  if not use_pref then
    local_part := split_part(coalesce(new.email, ''), '@', 1);
    if local_part = '' or local_part is null then
      local_part := 'user';
    end if;

    slug_email := lower(regexp_replace(local_part, '[^a-zA-Z0-9_]', '_', 'g'));
    slug_email := regexp_replace(slug_email, '_+', '_', 'g');
    slug_email := trim(both '_' from slug_email);
    if slug_email = '' or slug_email is null then
      slug_email := 'user';
    end if;
    slug_email := left(slug_email, 24);

    uname := slug_email || '_' || short_id;

    dname := trim(both from replace(replace(local_part, '.', ' '), '_', ' '));
    if dname = '' or dname is null then
      dname := 'HiveMind member';
    end if;
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, uname, dname)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_tokens enable row level security;
alter table public.token_reports enable row level security;
alter table public.guardian_alerts enable row level security;
alter table public.tracked_tokens enable row level security;
alter table public.subscriptions enable row level security;
alter table public.token_scans enable row level security;

-- ----- profiles -----
drop policy if exists "Profiles readable by everyone" on public.profiles;
drop policy if exists "Users manage own profile" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ----- watchlists -----
drop policy if exists "Users manage own watchlists" on public.watchlists;
drop policy if exists "watchlists_all_own" on public.watchlists;

create policy "watchlists_all_own"
  on public.watchlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----- watchlist_tokens -----
drop policy if exists "Users read tokens on own watchlists" on public.watchlist_tokens;
drop policy if exists "Users insert tokens on own watchlists" on public.watchlist_tokens;
drop policy if exists "Users delete tokens on own watchlists" on public.watchlist_tokens;
drop policy if exists "watchlist_tokens_select_own" on public.watchlist_tokens;
drop policy if exists "watchlist_tokens_insert_own" on public.watchlist_tokens;
drop policy if exists "watchlist_tokens_delete_own" on public.watchlist_tokens;

create policy "watchlist_tokens_select_own"
  on public.watchlist_tokens for select using (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_tokens.watchlist_id and w.user_id = auth.uid()
    )
  );

create policy "watchlist_tokens_insert_own"
  on public.watchlist_tokens for insert with check (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_id and w.user_id = auth.uid()
    )
  );

create policy "watchlist_tokens_delete_own"
  on public.watchlist_tokens for delete using (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_id and w.user_id = auth.uid()
    )
  );

-- ----- token_reports -----
drop policy if exists "Users manage own token reports" on public.token_reports;
drop policy if exists "token_reports_insert_own" on public.token_reports;
drop policy if exists "token_reports_select_own" on public.token_reports;

create policy "token_reports_insert_own"
  on public.token_reports for insert with check (auth.uid() = user_id);

create policy "token_reports_select_own"
  on public.token_reports for select using (auth.uid() = user_id);

-- ----- guardian_alerts -----
drop policy if exists "Guardian alerts visible to authenticated users" on public.guardian_alerts;
drop policy if exists "guardian_alerts_select_signed_in" on public.guardian_alerts;

create policy "guardian_alerts_select_signed_in"
  on public.guardian_alerts for select using (auth.uid() is not null);

-- ----- tracked_tokens -----
drop policy if exists "Tracked tokens visible to authenticated users" on public.tracked_tokens;
drop policy if exists "Tracked tokens write by authenticated users" on public.tracked_tokens;
drop policy if exists "Tracked tokens update by authenticated users" on public.tracked_tokens;
drop policy if exists "tracked_tokens_select_signed_in" on public.tracked_tokens;
drop policy if exists "tracked_tokens_insert_signed_in" on public.tracked_tokens;
drop policy if exists "tracked_tokens_update_signed_in" on public.tracked_tokens;

create policy "tracked_tokens_select_signed_in"
  on public.tracked_tokens for select using (auth.uid() is not null);

create policy "tracked_tokens_insert_signed_in"
  on public.tracked_tokens for insert with check (auth.uid() is not null);

create policy "tracked_tokens_update_signed_in"
  on public.tracked_tokens for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ----- subscriptions (read own; writes via service_role / Edge Function only) -----
drop policy if exists "subscriptions_select_own" on public.subscriptions;

create policy "subscriptions_select_own"
  on public.subscriptions for select using (auth.uid() = user_id);

-- ----- token_scans -----
drop policy if exists "token_scans_select_own" on public.token_scans;
drop policy if exists "token_scans_insert_own" on public.token_scans;

create policy "token_scans_select_own"
  on public.token_scans for select using (auth.uid() = user_id);

create policy "token_scans_insert_own"
  on public.token_scans for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

comment on table public.profiles is 'User profile; paid_plan synced from app checkout + Stripe webhook.';
comment on table public.watchlists is 'Watchlists; FK auth.users.';
comment on table public.watchlist_tokens is 'Symbols per watchlist.';
comment on table public.token_reports is 'User token reports (Pulse / feed).';
comment on table public.guardian_alerts is 'Active alert feed; maintained by admins via SQL or service role.';
comment on table public.tracked_tokens is 'Tracked market rows; anon upsert/list from signed-in users.';
comment on table public.subscriptions is 'Stripe subscription snapshots; app code may be extended to read this.';
comment on table public.token_scans is 'Optional scan history for Watchers; app code may be extended to write/read.';
