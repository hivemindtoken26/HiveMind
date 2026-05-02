-- HiveMind Supabase schema suggestions
-- Run in Supabase SQL editor after enabling the auth schema.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  paid_plan text not null default 'FREE' check (paid_plan in ('FREE', 'BASIC', 'PRO')),
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists paid_plan text not null default 'FREE'
  check (paid_plan in ('FREE', 'BASIC', 'PRO'));

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Watchlist',
  created_at timestamptz not null default now()
);

create table if not exists public.watchlist_tokens (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  token_symbol text not null,
  token_name text not null,
  token_address text,
  created_at timestamptz not null default now(),
  unique (watchlist_id, token_symbol)
);

create table if not exists public.token_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_symbol text not null,
  token_name text,
  token_address text,
  reason text not null,
  details text,
  created_at timestamptz not null default now()
);

create table if not exists public.guardian_alerts (
  id uuid primary key default gen_random_uuid(),
  token_symbol text not null,
  severity text not null check (severity in ('SAFE', 'WARNING', 'DANGER')),
  title text not null,
  message text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

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

alter table public.profiles enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_tokens enable row level security;
alter table public.token_reports enable row level security;
alter table public.guardian_alerts enable row level security;
alter table public.tracked_tokens enable row level security;

create policy "Profiles readable by everyone"
  on public.profiles for select using (true);
create policy "Users manage own profile"
  on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users manage own watchlists"
  on public.watchlists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users read tokens on own watchlists"
  on public.watchlist_tokens for select using (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_id and w.user_id = auth.uid()
    )
  );
create policy "Users insert tokens on own watchlists"
  on public.watchlist_tokens for insert with check (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_id and w.user_id = auth.uid()
    )
  );
create policy "Users delete tokens on own watchlists"
  on public.watchlist_tokens for delete using (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_id and w.user_id = auth.uid()
    )
  );

create policy "Users manage own token reports"
  on public.token_reports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Guardian alerts visible to authenticated users"
  on public.guardian_alerts for select using (auth.uid() is not null);

create policy "Tracked tokens visible to authenticated users"
  on public.tracked_tokens for select using (auth.uid() is not null);
create policy "Tracked tokens write by authenticated users"
  on public.tracked_tokens for insert with check (auth.uid() is not null);
create policy "Tracked tokens update by authenticated users"
  on public.tracked_tokens for update using (auth.uid() is not null);
