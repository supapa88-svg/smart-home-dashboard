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

# 個別デバイスのステータス取得
def get_device_status(device_id):
    headers = get_switchbot_headers()
    
    try:
        response = requests.get(
            f'https://api.switch-bot.com/v1.1/devices/{device_id}/status',
            headers=headers,
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get('statusCode') == 100:
            return data.get('body', {})
        else:
            print(f"  Status API Error: {data.get('message')}")
            return None
            
    except Exception as e:
        print(f"  Error getting device status: {e}")
        return None

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
        
        print(f"API Response Status: {devices.get('statusCode')}")
        
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
            device_id = device.get('deviceId')
            device_name = device.get('deviceName', '')
            device_type = device.get('deviceType', '')
            
            print(f"\nDevice: {device_name} ({device_type}) - ID: {device_id}")
            
            # 温湿度計、Hub 2、WoIOSensorの場合、ステータスを取得
            if device_type in ['Meter', 'MeterPlus', 'Hub 2', 'WoIOSensor']:
                status = get_device_status(device_id)
                
                if status:
                    temp = status.get('temperature')
                    humidity = status.get('humidity')
                    
                    print(f"  Status - Temp: {temp}, Humidity: {humidity}")
                    
                    # Hub 2の温湿度
                    if 'Hub 2' in device_type or 'Hub Mini' in device_type:
                        if temp is not None:
                            sensor_data['indoor_temp'] = temp
                        if humidity is not None:
                            sensor_data['indoor_humidity'] = humidity
                    
                    # 温湿度計
                    elif device_type in ['Meter', 'MeterPlus', 'WoIOSensor']:
                        # 屋外用として判定
                        if any(keyword in device_name.lower() for keyword in ['屋外', 'outdoor', 'ベランダ', '外', 'balcony']):
                            if temp is not None:
                                sensor_data['outdoor_temp'] = temp
                            if humidity is not None:
                                sensor_data['outdoor_humidity'] = humidity
                            print(f"  -> Outdoor sensor")
                        # 屋内用として判定
                        else:
                            if temp is not None and sensor_data['indoor_temp'] is None:
                                sensor_data['indoor_temp'] = temp
                            if humidity is not None and sensor_data['indoor_humidity'] is None:
                                sensor_data['indoor_humidity'] = humidity
                            print(f"  -> Indoor sensor")
        
        print(f"\nFinal sensor data: {sensor_data}")
        return sensor_data
        
    except Exception as e:
        print(f"Error getting SwitchBot data: {e}")
        return None

# データ保存
def save_data():
    print(f"Starting data collection at {datetime.now()}")
    
    # センサーデータ取得
    sensor_data = get_switchbot_data()
    
    if sensor_data and any(v is not None for v in sensor_data.values()):
        try:
            # Supabaseに保存
            result = supabase.table('sensor_data').insert(sensor_data).execute()
            print(f"\nData saved successfully to Supabase!")
        except Exception as e:
            print(f"\nError saving to Supabase: {e}")
    else:
        print("\nNo valid sensor data to save")

if __name__ == '__main__':
    save_data()
