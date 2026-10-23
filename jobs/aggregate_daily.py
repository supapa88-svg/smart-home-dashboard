from datetime import date, datetime, timedelta, timezone

from jobs.common.supabase_client import get_supabase_admin_client


def avg(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 3)


def to_float(v):
    if v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None


def load_sensor_rows(supabase, from_day: str, to_day: str):
    # measured_at(UTC) を日付で絞る
    from_ts = f"{from_day}T00:00:00+00:00"
    to_ts = f"{to_day}T23:59:59+00:00"
    res = (
        supabase.schema("private")
        .table("sensor_data_raw")
        .select("measured_at,indoor_temp,indoor_humidity,outdoor_temp,outdoor_humidity")
        .gte("measured_at", from_ts)
        .lte("measured_at", to_ts)
        .execute()
    )
    return res.data or []


def load_energy_rows(supabase, from_day: str, to_day: str):
    res = (
        supabase.schema("private")
        .table("energy_data_raw")
        .select("reading_date,consumption_kwh")
        .gte("reading_date", from_day)
        .lte("reading_date", to_day)
        .execute()
    )
    return res.data or []


def aggregate_dashboard(sensor_rows: list[dict], energy_rows: list[dict]):
    # day別バケット
    by_day = {}
    for r in sensor_rows:
        measured_at = r.get("measured_at")
        if not measured_at:
            continue
        day = measured_at[:10]
        if day not in by_day:
            by_day[day] = {
                "indoor_temp": [],
                "indoor_humidity": [],
                "outdoor_temp": [],
                "outdoor_humidity": [],
            }

        for key in ["indoor_temp", "indoor_humidity", "outdoor_temp", "outdoor_humidity"]:
            fv = to_float(r.get(key))
            if fv is not None:
                by_day[day][key].append(fv)

    energy_by_day = {}
    for r in energy_rows:
        d = r.get("reading_date")
        if not d:
            continue
        d = str(d)
        energy_by_day.setdefault(d, 0.0)
        v = to_float(r.get("consumption_kwh"))
        if v is not None:
            energy_by_day[d] += v

    out = []
    for day in sorted(by_day.keys()):
        out.append(
            {
                "summary_date": day,
                "indoor_avg_temp": avg(by_day[day]["indoor_temp"]),
                "indoor_avg_humidity": avg(by_day[day]["indoor_humidity"]),
                "outdoor_avg_temp": avg(by_day[day]["outdoor_temp"]),
                "outdoor_avg_humidity": avg(by_day[day]["outdoor_humidity"]),
                "energy_total_kwh": round(energy_by_day.get(day, 0.0), 3),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    return out


def aggregate_energy(energy_rows: list[dict]):
    by_day = {}
    for r in energy_rows:
        d = r.get("reading_date")
        if not d:
            continue
        d = str(d)
        by_day.setdefault(d, [])
        v = to_float(r.get("consumption_kwh"))
        if v is not None:
            by_day[d].append(v)

    out = []
    for day in sorted(by_day.keys()):
        vals = by_day[day]
        if not vals:
            continue
        out.append(
            {
                "summary_date": day,
                "total_kwh": round(sum(vals), 3),
                "avg_kwh": round(sum(vals) / len(vals), 3),
                "max_kwh": round(max(vals), 3),
                "min_kwh": round(min(vals), 3),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    return out


def upsert_dashboard_summary(supabase, rows: list[dict]):
    if not rows:
        print("[INFO] No dashboard summary rows.")
        return
    (
        supabase.table("dashboard_summary_daily")
        .upsert(rows, on_conflict="summary_date")
        .execute()
    )
    print(f"[OK] Upserted dashboard_summary_daily: {len(rows)} rows")


def upsert_energy_summary(supabase, rows: list[dict]):
    if not rows:
        print("[INFO] No energy summary rows.")
        return
    (
        supabase.table("energy_summary_daily")
        .upsert(rows, on_conflict="summary_date")
        .execute()
    )
    print(f"[OK] Upserted energy_summary_daily: {len(rows)} rows")


def main():
    # 直近7日を再計算（遅延取り込みに強くする）
    today = date.today()
    from_day = (today - timedelta(days=7)).isoformat()
    to_day = today.isoformat()

    print(f"[START] aggregate_daily from {from_day} to {to_day}")

    supabase = get_supabase_admin_client()

    sensor_rows = load_sensor_rows(supabase, from_day, to_day)
    energy_rows = load_energy_rows(supabase, from_day, to_day)

    dashboard_rows = aggregate_dashboard(sensor_rows, energy_rows)
    energy_summary_rows = aggregate_energy(energy_rows)

    upsert_dashboard_summary(supabase, dashboard_rows)
    upsert_energy_summary(supabase, energy_summary_rows)

    print("[DONE] aggregate_daily finished")


if __name__ == "__main__":
    main()
