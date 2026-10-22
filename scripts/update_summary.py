import os
from datetime import datetime, timedelta, timezone

from supabase import create_client

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

SYSTEM_OWNER_ID = '11111111-1111-1111-1111-111111111111'


def read_sensor_rows():
    response = supabase.schema('private').table('sensor_data_raw').select('*').execute()
    return response.data or []


def read_energy_rows():
    response = supabase.schema('private').table('energy_data_raw').select('*').execute()
    return response.data or []


def bucket_sensor_rows(rows):
    buckets = {}
    for row in rows:
        created_at = row.get('created_at')
        if not created_at:
            continue
        day = created_at[:10]
        buckets.setdefault(day, {'temps': [], 'humidities': [], 'outdoor_temps': [], 'outdoor_humidities': []})
        if row.get('indoor_temp') is not None:
            buckets[day]['temps'].append(float(row['indoor_temp']))
        if row.get('indoor_humidity') is not None:
            buckets[day]['humidities'].append(float(row['indoor_humidity']))
        if row.get('outdoor_temp') is not None:
            buckets[day]['outdoor_temps'].append(float(row['outdoor_temp']))
        if row.get('outdoor_humidity') is not None:
            buckets[day]['outdoor_humidities'].append(float(row['outdoor_humidity']))
    return buckets


def avg(values):
    if not values:
        return None
    return sum(values) / len(values)


def update_dashboard_summary():
    rows = read_sensor_rows()
    buckets = bucket_sensor_rows(rows)
    prepared = []

    for summary_date, values in sorted(buckets.items()):
        prepared.append({
            'summary_date': summary_date,
            'indoor_avg_temp': avg(values['temps']),
            'indoor_avg_humidity': avg(values['humidities']),
            'outdoor_avg_temp': avg(values['outdoor_temps']),
            'outdoor_avg_humidity': avg(values['outdoor_humidities']),
            'energy_total_kwh': None,
        })

    if not prepared:
        print('No sensor data found in private.sensor_data_raw')
        return

    for item in prepared:
        item['energy_total_kwh'] = None
        if item['summary_date']:
            energy_rows = read_energy_rows()
            total = 0.0
            for row in energy_rows:
                if row.get('reading_date') == item['summary_date']:
                    value = row.get('consumption')
                    if value is not None:
                        total += float(value)
            item['energy_total_kwh'] = round(total, 3) if total else 0.0

        upsert_payload = {
            'summary_date': item['summary_date'],
            'indoor_avg_temp': item['indoor_avg_temp'],
            'indoor_avg_humidity': item['indoor_avg_humidity'],
            'outdoor_avg_temp': item['outdoor_avg_temp'],
            'outdoor_avg_humidity': item['outdoor_avg_humidity'],
            'energy_total_kwh': item['energy_total_kwh'],
        }

        supabase.table('dashboard_summary').upsert(upsert_payload, on_conflict='summary_date').execute()
        print(f"Updated dashboard_summary for {item['summary_date']}")


def update_energy_summary():
    rows = read_energy_rows()
    buckets = {}
    for row in rows:
        reading_date = row.get('reading_date')
        if not reading_date:
            continue
        buckets.setdefault(reading_date, [])
        value = row.get('consumption')
        if value is not None:
            buckets[reading_date].append(float(value))

    for summary_date, values in sorted(buckets.items()):
        total = round(sum(values), 3)
        avg_value = round(sum(values) / len(values), 3) if values else None
        peak = round(max(values), 3) if values else None

        payload = {
            'summary_date': summary_date,
            'total_kwh': total,
            'average_kwh': avg_value,
            'peak_kwh': peak,
        }
        supabase.table('energy_summary').upsert(payload, on_conflict='summary_date').execute()
        print(f"Updated energy_summary for {summary_date}")


if __name__ == '__main__':
    update_dashboard_summary()
    update_energy_summary()
    print('Summary update complete.')
