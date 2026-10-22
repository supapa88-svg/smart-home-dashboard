create extension if not exists pgcrypto;

create schema if not exists private;

-- Private raw tables: only the backend/service role should access these.
create table if not exists private.sensor_data_raw (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null default auth.uid(),
    created_at timestamptz not null default now(),
    source text not null default 'switchbot',
    indoor_temp numeric,
    indoor_humidity numeric,
    outdoor_temp numeric,
    outdoor_humidity numeric,
    raw jsonb not null default '{}'::jsonb
);

create table if not exists private.energy_data_raw (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null default auth.uid(),
    created_at timestamptz not null default now(),
    source text not null default 'octopus',
    reading_date date not null,
    reading_time time not null,
    consumption numeric,
    raw jsonb not null default '{}'::jsonb
);

alter table private.sensor_data_raw enable row level security;
alter table private.energy_data_raw enable row level security;

create policy "sensor_data_raw_owner_access"
on private.sensor_data_raw
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "energy_data_raw_owner_access"
on private.energy_data_raw
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Public summary tables: safe, aggregated data only.
create table if not exists public.dashboard_summary (
    id uuid primary key default gen_random_uuid(),
    summary_date date not null unique,
    indoor_avg_temp numeric,
    indoor_avg_humidity numeric,
    outdoor_avg_temp numeric,
    outdoor_avg_humidity numeric,
    energy_total_kwh numeric,
    created_at timestamptz not null default now()
);

alter table public.dashboard_summary enable row level security;

create policy "dashboard_summary_public_read"
on public.dashboard_summary
for select
using (true);

create policy "dashboard_summary_insert_for_service_role_only"
on public.dashboard_summary
for insert
with check (false);

create policy "dashboard_summary_update_for_service_role_only"
on public.dashboard_summary
for update
using (false)
with check (false);

create policy "dashboard_summary_delete_for_service_role_only"
on public.dashboard_summary
for delete
using (false);

-- Optional: a public daily energy summary table if you later want a cleaner dashboard.
create table if not exists public.energy_summary (
    id uuid primary key default gen_random_uuid(),
    summary_date date not null unique,
    total_kwh numeric,
    average_kwh numeric,
    peak_kwh numeric,
    created_at timestamptz not null default now()
);

alter table public.energy_summary enable row level security;

create policy "energy_summary_public_read"
on public.energy_summary
for select
using (true);

create policy "energy_summary_insert_for_service_role_only"
on public.energy_summary
for insert
with check (false);

create policy "energy_summary_update_for_service_role_only"
on public.energy_summary
for update
using (false)
with check (false);

create policy "energy_summary_delete_for_service_role_only"
on public.energy_summary
for delete
using (false);

comment on schema private is 'Private raw data storage. Access is restricted to authenticated users or service-role access only.';
comment on table private.sensor_data_raw is 'Raw indoor/outdoor sensor readings collected from SwitchBot devices.';
comment on table private.energy_data_raw is 'Raw half-hourly or interval energy readings collected from Octopus Energy.';
comment on table public.dashboard_summary is 'Aggregated dashboard data safe to expose to browser clients.';
comment on table public.energy_summary is 'Safe, aggregated energy totals for public dashboards.';
