import os
import time
import hashlib
import hmac
import base64
from datetime import datetime

import requests
from supabase import create_client

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
SYSTEM_OWNER_ID = '11111111-1111-1111-1111-111111111111'


def get_switchbot_headers():
    token = os.environ['SWITCHBOT_TOKEN']
    secret = os.environ['SWITCHBOT_SECRET']
    nonce = str(int(time.time() * 1000))
    t = str(int(time.time() * 1000))
    string_to_sign = f"{token}{t}{nonce}"
    sign = base64.b64encode(
        hmac.new(secret.encode(), string_to_sign.encode(), hashlib.sha256).digest()
    ).decode()

    return {
        'Authorization': token,
        'sign': sign,
        't': t,
        'nonce': nonce,
        'Content-Type': 'application/json',
    }


def get_device_status(device_id):
    headers = get_switchbot_headers()
    try:
        response = requests.get(
            f'https://api.switch-bot.com/v1.1/devices/{device_id}/status',
            headers=headers,
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        if data.get('statusCode') == 100:
            return data.get('body', {})
        print(f"Status API error for {device_id}: {data.get('message')}")
        return None
    except Exception as exc:
        print(f"Error fetching device status for {device_id}: {exc}")
        return None


def get_switchbot_data():
    headers = get_switchbot_headers()
    try:
        response = requests.get('https://api.switch-bot.com/v1.1/devices', headers=headers, timeout=15)
        response.raise_for_status()
        payload = response.json()
        if payload.get('statusCode') != 100:
            print(f"API error: {payload.get('message')}")
            return None

        sensor_data = {
            'indoor_temp': None,
            'indoor_humidity': None,
            'outdoor_temp': None,
            'outdoor_humidity': None,
        }

        for device in payload.get('body', {}).get('deviceList', []):
            device_id = device.get('deviceId')
            device_name = device.get('deviceName', '')
            device_type = device.get('deviceType', '')
            if not device_id:
                continue

            if device_type in ['Meter', 'MeterPlus', 'Hub 2', 'WoIOSensor', 'Hub Mini']:
                status = get_device_status(device_id)
                if not status:
                    continue

                temp = status.get('temperature')
                humidity = status.get('humidity')
                name_lower = device_name.lower()

                if 'hub 2' in device_type.lower() or 'hub mini' in device_type.lower():
                    if temp is not None:
                        sensor_data['indoor_temp'] = temp
                    if humidity is not None:
                        sensor_data['indoor_humidity'] = humidity
                elif any(keyword in name_lower for keyword in ['屋外', 'outdoor', 'ベランダ', 'balcony', '外']):
                    if temp is not None:
                        sensor_data['outdoor_temp'] = temp
                    if humidity is not None:
                        sensor_data['outdoor_humidity'] = humidity
                else:
                    if temp is not None and sensor_data['indoor_temp'] is None:
                        sensor_data['indoor_temp'] = temp
                    if humidity is not None and sensor_data['indoor_humidity'] is None:
                        sensor_data['indoor_humidity'] = humidity

        return sensor_data
    except Exception as exc:
        print(f"Error getting SwitchBot data: {exc}")
        return None


def save_to_supabase(sensor_data):
    if sensor_data is None or not any(v is not None for v in sensor_data.values()):
        print('No sensor data to save.')
        return

    payload = {
        'owner_id': SYSTEM_OWNER_ID,
        'source': 'switchbot',
        'indoor_temp': sensor_data.get('indoor_temp'),
        'indoor_humidity': sensor_data.get('indoor_humidity'),
        'outdoor_temp': sensor_data.get('outdoor_temp'),
        'outdoor_humidity': sensor_data.get('outdoor_humidity'),
        'raw': sensor_data,
    }

    supabase.schema('private').table('sensor_data_raw').insert(payload).execute()
    print(f"Saved SwitchBot sensor data: {sensor_data}")


if __name__ == '__main__':
    print(f'Starting SwitchBot collection at {datetime.now()}')
    result = get_switchbot_data()
    save_to_supabase(result)
