create index if not exists idx_sensor_data_raw_measured_at
  on private.sensor_data_raw (measured_at desc);

create index if not exists idx_energy_data_raw_reading_date
  on private.energy_data_raw (reading_date desc);

create index if not exists idx_dashboard_summary_daily_date
  on public.dashboard_summary_daily (summary_date desc);

create index if not exists idx_energy_summary_daily_date
  on public.energy_summary_daily (summary_date desc);
