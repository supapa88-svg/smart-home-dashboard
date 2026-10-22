INSERT INTO public.dashboard_summary (summary_date, indoor_avg_temp, indoor_avg_humidity, outdoor_avg_temp, outdoor_avg_humidity, energy_total_kwh)
VALUES
  ('2026-10-16', 22.4, 54.0, 20.1, 48.5, 12.3),
  ('2026-10-17', 23.1, 56.2, 21.5, 49.9, 11.8),
  ('2026-10-18', 24.0, 58.6, 22.4, 51.2, 13.0),
  ('2026-10-19', 23.7, 57.3, 21.9, 50.8, 12.7),
  ('2026-10-20', 22.8, 55.4, 20.7, 49.6, 12.4),
  ('2026-10-21', 24.2, 60.1, 22.9, 52.4, 13.6),
  ('2026-10-22', 24.6, 61.3, 23.5, 53.2, 14.1)
ON CONFLICT (summary_date) DO UPDATE SET
  indoor_avg_temp = EXCLUDED.indoor_avg_temp,
  indoor_avg_humidity = EXCLUDED.indoor_avg_humidity,
  outdoor_avg_temp = EXCLUDED.outdoor_avg_temp,
  outdoor_avg_humidity = EXCLUDED.outdoor_avg_humidity,
  energy_total_kwh = EXCLUDED.energy_total_kwh;

INSERT INTO public.energy_summary (summary_date, total_kwh, average_kwh, peak_kwh)
VALUES
  ('2026-10-16', 12.3, 0.51, 0.8),
  ('2026-10-17', 11.8, 0.49, 0.7),
  ('2026-10-18', 13.0, 0.54, 0.9),
  ('2026-10-19', 12.7, 0.53, 0.8),
  ('2026-10-20', 12.4, 0.52, 0.8),
  ('2026-10-21', 13.6, 0.57, 1.0),
  ('2026-10-22', 14.1, 0.59, 1.1)
ON CONFLICT (summary_date) DO UPDATE SET
  total_kwh = EXCLUDED.total_kwh,
  average_kwh = EXCLUDED.average_kwh,
  peak_kwh = EXCLUDED.peak_kwh;
