import os
import requests
import time
import hashlib
import hmac
import base64
from supabase import create_client
from datetime import datetime

# Supabase接続
supabase = create_client(
    os.environ['SUPABASE_URL'],
    os.environ['SUPABASE_KEY']
)

# SwitchBot API認証ヘッダー生成
def get_switchbot_headers():
    token = os.environ['SWITCHBOT_TOKEN']
    secret = os.environ['SWITCHBOT_SECRET']
    nonce = str(int(time.time() * 1000))
    t = str(int(time.time() * 1000))
    
    string_to_sign = f"{token}{t}{nonce}"
    sign = base64.b64encode(
        hmac.new(
            secret.encode(),
            string_to_sign.encode(),
            hashlib.sha256
        ).digest()
    ).decode()
    
    return {
        'Authorization': token,
        'sign': sign,
        't': t,
        'nonce': nonce,
        'Content-Type': 'application/json'
    }

# SwitchBotデバイス一覧とデータ取得
def get_switchbot_data():
    headers = get_switchbot_headers()
    
    try:
        # デバイス一覧取得
        response = requests.get(
            'https://api.switch-bot.com/v1.1/devices',
            headers=headers,
            timeout=10
        )
        response.raise_for_status()
        devices = response.json()
        
        print(f"API Response: {devices}")
        
        if devices.get('statusCode') != 100:
            print(f"API Error: {devices.get('message')}")
            return None
        
        sensor_data = {
            'indoor_temp': None,
            'indoor_humidity': None,
            'outdoor_temp': None,
            'outdoor_humidity': None
        }
        
        # デバイスリストから温湿度データを抽出
        device_list = devices.get('body', {}).get('deviceList', [])
        
        for device in device_list:
            device_name = device.get('deviceName', '')
            device_type = device.get('deviceType', '')
            
            print(f"Device: {device_name} ({device_type})")
            
            # Hub 2の温湿度
            if 'Hub 2' in device_type or 'Hub Mini' in device_type:
                sensor_data['indoor_temp'] = device.get('temperature')
                sensor_data['indoor_humidity'] = device.get('humidity')
                print(f"  Indoor - Temp: {sensor_data['indoor_temp']}, Humidity: {sensor_data['indoor_humidity']}")
            
            # 温湿度計（防水含む）
            if 'Meter' in device_type or '温湿度計' in device_name:
                # 屋外用として判定
                if any(keyword in device_name.lower() for keyword in ['屋外', 'outdoor', 'ベランダ', '外', 'balcony']):
                    sensor_data['outdoor_temp'] = device.get('temperature')
                    sensor_data['outdoor_humidity'] = device.get('humidity')
                    print(f"  Outdoor - Temp: {sensor_data['outdoor_temp']}, Humidity: {sensor_data['outdoor_humidity']}")
                # 屋内用として判定
                elif sensor_data['indoor_temp'] is None:
                    sensor_data['indoor_temp'] = device.get('temperature')
                    sensor_data['indoor_humidity'] = device.get('humidity')
                    print(f"  Indoor - Temp: {sensor_data['indoor_temp']}, Humidity: {sensor_data['indoor_humidity']}")
        
        return sensor_data
        
    except Exception as e:
        print(f"Error getting SwitchBot data: {e}")
        return None

# データ保存
def save_data():
    print(f"Starting data collection at {datetime.now()}")
    
    # センサーデータ取得
    sensor_data = get_switchbot_data()
    
    if sensor_data:
        try:
            # Supabaseに保存
            result = supabase.table('sensor_data').insert(sensor_data).execute()
            print(f"Data saved successfully: {sensor_data}")
        except Exception as e:
            print(f"Error saving to Supabase: {e}")
    else:
        print("No sensor data to save")

if __name__ == '__main__':
    save_data()
