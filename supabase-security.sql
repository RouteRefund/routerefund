-- RouteRefund Supabase security setup
-- Run this in Supabase SQL Editor. Safe to rerun.
-- Purpose: customers can only see/manage their own trips; owners can see all trips only if their email is listed in owner_emails.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  date_of_birth date,
  created_at timestamptz default now()
);

create table if not exists public.owner_emails (
  email text primary key,
  created_at timestamptz default now()
);

create table if not exists public.account_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  date_of_birth date not null,
  status text default 'New',
  created_at timestamptz default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  passenger_first text not null,
  passenger_last text not null,
  date_of_birth date not null,
  confirmation_no text not null,
  paid numeric not null,
  current_price numeric,
  notes text,
  change_consent boolean default false,
  status text default 'Monitoring',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.owner_emails enable row level security;
alter table public.account_recovery_requests enable row level security;

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.owner_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

drop policy if exists "profiles_select_own_or_owner" on public.profiles;
create policy "profiles_select_own_or_owner" on public.profiles
for select using (auth.uid() = user_id or public.is_owner());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "trips_select_own_or_owner" on public.trips;
create policy "trips_select_own_or_owner" on public.trips
for select using (auth.uid() = user_id or public.is_owner());

drop policy if exists "trips_insert_own" on public.trips;
create policy "trips_insert_own" on public.trips
for insert with check (auth.uid() = user_id);

drop policy if exists "trips_update_own_or_owner" on public.trips;
create policy "trips_update_own_or_owner" on public.trips
for update using (auth.uid() = user_id or public.is_owner()) with check (auth.uid() = user_id or public.is_owner());

drop policy if exists "trips_delete_own_or_owner" on public.trips;
create policy "trips_delete_own_or_owner" on public.trips
for delete using (auth.uid() = user_id or public.is_owner());

drop policy if exists "owner_emails_select_owner" on public.owner_emails;
create policy "owner_emails_select_owner" on public.owner_emails
for select using (public.is_owner());

drop policy if exists "recovery_insert_anyone" on public.account_recovery_requests;
create policy "recovery_insert_anyone" on public.account_recovery_requests
for insert with check (true);

drop policy if exists "recovery_select_owner" on public.account_recovery_requests;
create policy "recovery_select_owner" on public.account_recovery_requests
for select using (public.is_owner());

-- After running, add owner emails like this:
-- insert into public.owner_emails(email) values ('you@example.com') on conflict do nothing;
