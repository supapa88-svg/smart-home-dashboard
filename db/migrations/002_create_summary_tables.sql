create table if not exists public.dashboard_summary_daily (
  summary_date date primary key,
  indoor_avg_temp numeric,
  indoor_avg_humidity numeric,
  outdoor_avg_temp numeric,
  outdoor_avg_humidity numeric,
  energy_total_kwh numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.energy_summary_daily (
  summary_date date primary key,
  total_kwh numeric not null default 0,
  avg_kwh numeric,
  max_kwh numeric,
  min_kwh numeric,
  updated_at timestamptz not null default now()
);
