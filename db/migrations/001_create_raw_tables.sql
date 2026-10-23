create schema if not exists private;

create table if not exists private.sensor_data_raw (
  id bigint generated always as identity primary key,
  measured_at timestamptz not null default now(),
  source text not null default 'switchbot',
  indoor_temp numeric,
  indoor_humidity numeric,
  outdoor_temp numeric,
  outdoor_humidity numeric,
  raw_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists private.energy_data_raw (
  id bigint generated always as identity primary key,
  start_at timestamptz not null,
  end_at timestamptz,
  reading_date date not null,
  source text not null default 'octopus',
  consumption_kwh numeric not null,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  unique (source, start_at)
);
