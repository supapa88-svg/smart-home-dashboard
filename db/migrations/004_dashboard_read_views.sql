-- Read-only views for the browser dashboard (anon key).
-- Raw tables keep RLS enabled with no policies; only these views are readable,
-- limited to the last 14 days and to the columns the dashboard needs.

create or replace view public.dashboard_sensor_data as
select
  id,
  measured_at as created_at,
  indoor_temp,
  indoor_humidity,
  outdoor_temp,
  outdoor_humidity
from public.sensor_data_raw
where measured_at >= now() - interval '14 days';

create or replace view public.dashboard_energy_data as
select
  reading_date as date,
  (start_at at time zone 'Asia/Tokyo')::time as time,
  consumption_kwh as consumption
from public.energy_data_raw
where reading_date >= (now() at time zone 'Asia/Tokyo')::date - 14;

revoke all on public.dashboard_sensor_data from anon, authenticated;
revoke all on public.dashboard_energy_data from anon, authenticated;
grant select on public.dashboard_sensor_data to anon, authenticated;
grant select on public.dashboard_energy_data to anon, authenticated;
