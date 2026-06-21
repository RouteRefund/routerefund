-- RouteRefund Supabase security setup
-- Run this in Supabase SQL Editor. Safe to rerun.
-- Purpose: customers can only see/manage their own trips; owners can see all trips only if their email is listed in owner_emails.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  date_of_birth date,
  created_at timestamptz default now()
);

alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists privacy_accepted_at timestamptz;
alter table public.profiles add column if not exists monitoring_authorized_at timestamptz;
alter table public.profiles add column if not exists fee_disclosure_accepted_at timestamptz;

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
  flight_no text,
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

-- Keep old RouteRefund schemas compatible with the current manual-entry form.

-- Manual lookup can start before the customer knows the exact price paid.
alter table public.trips alter column paid drop not null;
alter table public.trips add column if not exists departure_time text;
alter table public.trips drop constraint if exists trips_paid_positive;
alter table public.trips add column if not exists flight_no text;
alter table public.trips alter column flight_no drop not null;
alter table public.trips add column if not exists confirmation_no text;
alter table public.trips alter column confirmation_no set not null;
alter table public.trips add column if not exists airline text;
alter table public.trips add column if not exists route text;
alter table public.trips add column if not exists travel_date date;
alter table public.trips drop column if exists owner_notes;
alter table public.trips add column if not exists payment_status text not null default 'Not billed';
alter table public.trips add column if not exists monitoring_frequency_hours integer not null default 6;
alter table public.trips add column if not exists last_checked_at timestamptz;
alter table public.trips add column if not exists next_check_at timestamptz not null default now();

alter table public.trips drop constraint if exists trips_confirmation_no_format;
alter table public.trips add constraint trips_confirmation_no_format
  check (confirmation_no ~ '^[A-Z0-9]{5,13}$');

alter table public.trips drop constraint if exists trips_paid_positive;
alter table public.trips add constraint trips_paid_positive
  check (paid > 0);

create table if not exists public.owner_trip_notes (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  owner_notes text,
  updated_at timestamptz not null default now()
);
alter table public.owner_trip_notes enable row level security;

create table if not exists public.monitoring_checks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  check_due_at timestamptz not null default now(),
  checked_at timestamptz,
  source text,
  observed_price numeric,
  result text not null default 'Due',
  notes text,
  created_at timestamptz default now()
);
alter table public.monitoring_checks enable row level security;

create table if not exists public.forwarded_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  from_email text,
  subject text,
  raw_text text,
  parsed_airline text,
  parsed_confirmation_no text,
  parsed_passenger_name text,
  parsed_route text,
  parsed_travel_date date,
  parsed_paid numeric,
  parser_confidence numeric,
  status text not null default 'Needs review',
  created_trip_id uuid references public.trips(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.forwarded_confirmations enable row level security;

create table if not exists public.airline_lookup_attempts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  airline text not null,
  status text not null default 'Queued',
  attempt_count integer not null default 0,
  last_error text,
  result_excerpt text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.airline_lookup_attempts enable row level security;
create index if not exists airline_lookup_attempts_status_created_idx on public.airline_lookup_attempts(status, created_at);
create unique index if not exists airline_lookup_attempts_one_active_per_trip_idx
  on public.airline_lookup_attempts(trip_id)
  where status in ('Queued','Running');

create or replace function public.queue_initial_monitoring_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.monitoring_checks(trip_id, check_due_at, source, result, notes)
  values (new.id, now(), 'Initial review', 'Due', 'Initial verification and fare-baseline check');

  if coalesce(new.airline, '') <> '' then
    insert into public.airline_lookup_attempts(trip_id, airline, status)
    values (new.id, new.airline, 'Queued')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trips_queue_initial_monitoring_check on public.trips;
create trigger trips_queue_initial_monitoring_check
after insert on public.trips
for each row execute function public.queue_initial_monitoring_check();

-- Customers may update their own customer-facing notes, but owner-controlled workflow fields
-- must not be editable from a customer browser session even though the row is customer-owned.
create or replace function public.protect_owner_trip_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_owner() or current_setting('app.routerefund_worker', true) = 'on' then
    return new;
  end if;

  if new.status is distinct from old.status
    or new.current_price is distinct from old.current_price
    or new.payment_status is distinct from old.payment_status
    or new.last_checked_at is distinct from old.last_checked_at
    or new.next_check_at is distinct from old.next_check_at
    or new.monitoring_frequency_hours is distinct from old.monitoring_frequency_hours
  then
    raise exception 'Owner-only trip fields cannot be changed by customers';
  end if;

  return new;
end;
$$;

drop trigger if exists trips_protect_owner_fields on public.trips;
create trigger trips_protect_owner_fields
before update on public.trips
for each row execute function public.protect_owner_trip_fields();

-- Supabase PostgREST still needs table privileges; RLS policies decide which rows are visible/editable.
-- Reset broad/default grants first so anon/authenticated do not keep stale TRUNCATE/extra privileges from earlier attempts.
revoke all privileges on public.profiles from anon, authenticated;
revoke all privileges on public.trips from anon, authenticated;
revoke all privileges on public.owner_emails from anon, authenticated;
revoke all privileges on public.account_recovery_requests from anon, authenticated;
revoke all privileges on public.owner_trip_notes from anon, authenticated;
revoke all privileges on public.monitoring_checks from anon, authenticated;
revoke all privileges on public.forwarded_confirmations from anon, authenticated;
revoke all privileges on public.airline_lookup_attempts from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select on public.owner_emails to authenticated;
grant insert on public.account_recovery_requests to anon, authenticated;
grant select, update, delete on public.account_recovery_requests to authenticated;
grant select, insert, update, delete on public.owner_trip_notes to authenticated;
grant select, insert, update, delete on public.monitoring_checks to authenticated;
grant select, insert, update, delete on public.forwarded_confirmations to authenticated;
grant select, insert, update, delete on public.airline_lookup_attempts to authenticated;

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  and exists (
    select 1 from public.owner_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.current_user_is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_owner();
$$;

drop policy if exists "profiles_select_own_or_owner" on public.profiles;
drop policy if exists "customers can read their profile" on public.profiles;
create policy "profiles_select_own_or_owner" on public.profiles
for select using (auth.uid() = user_id or public.is_owner());

drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "customers can insert their profile" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "customers can update their profile" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "trips_select_own_or_owner" on public.trips;
drop policy if exists "Customers can read their own trips" on public.trips;
drop policy if exists "customers can read their trips" on public.trips;
drop policy if exists "owners can read all trips" on public.trips;
create policy "trips_select_own_or_owner" on public.trips
for select using (auth.uid() = user_id or public.is_owner());

drop policy if exists "trips_insert_own" on public.trips;
drop policy if exists "Customers can insert their own trips" on public.trips;
drop policy if exists "customers can insert their trips" on public.trips;
create policy "trips_insert_own" on public.trips
for insert with check (auth.uid() = user_id);

drop policy if exists "trips_update_own_or_owner" on public.trips;
drop policy if exists "Customers can update their own trip notes" on public.trips;
drop policy if exists "customers can update their trips" on public.trips;
drop policy if exists "owners can update all trips" on public.trips;
create policy "trips_update_own_or_owner" on public.trips
for update using (auth.uid() = user_id or public.is_owner()) with check (auth.uid() = user_id or public.is_owner());

drop policy if exists "trips_delete_own_or_owner" on public.trips;
drop policy if exists "Customers can delete their own trips" on public.trips;
drop policy if exists "customers can delete their trips" on public.trips;
create policy "trips_delete_own_or_owner" on public.trips
for delete using (auth.uid() = user_id or public.is_owner());

drop policy if exists "owner_emails_select_owner" on public.owner_emails;
drop policy if exists "owners can read owner list" on public.owner_emails;
create policy "owner_emails_select_owner" on public.owner_emails
for select using (public.is_owner());

drop policy if exists "owner_trip_notes_owner_all" on public.owner_trip_notes;
create policy "owner_trip_notes_owner_all" on public.owner_trip_notes
for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists "monitoring_checks_owner_all" on public.monitoring_checks;
create policy "monitoring_checks_owner_all" on public.monitoring_checks
for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists "forwarded_confirmations_owner_all" on public.forwarded_confirmations;
create policy "forwarded_confirmations_owner_all" on public.forwarded_confirmations
for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists "airline_lookup_attempts_owner_all" on public.airline_lookup_attempts;
create policy "airline_lookup_attempts_owner_all" on public.airline_lookup_attempts
for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists "recovery_insert_anyone" on public.account_recovery_requests;
drop policy if exists "anyone can submit recovery request" on public.account_recovery_requests;
create policy "recovery_insert_anyone" on public.account_recovery_requests
for insert with check (true);

drop policy if exists "recovery_select_owner" on public.account_recovery_requests;
create policy "recovery_select_owner" on public.account_recovery_requests
for select using (public.is_owner());

-- Owner emails for RouteRefund partners.
insert into public.owner_emails(email) values
  ('caleb@routerefund.com'),
  ('max@routerefund.com'),
  ('andrew@routerefund.com')
on conflict do nothing;
