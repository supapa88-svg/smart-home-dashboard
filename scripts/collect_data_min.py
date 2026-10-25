import os
import time
import hmac
import hashlib
import base64
import requests
from datetime import datetime
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def sb_headers():
    token = os.environ["SWITCHBOT_TOKEN"]
    secret = os.environ["SWITCHBOT_SECRET"]
    t = str(int(time.time() * 1000))
    nonce = t
    sign = base64.b64encode(
        hmac.new(secret.encode(), f"{token}{t}{nonce}".encode(), hashlib.sha256).digest()
    ).decode()
    return {
        "Authorization": token,
        "sign": sign,
        "t": t,
        "nonce": nonce,
        "Content-Type": "application/json",
    }

def get_status(device_id):
    r = requests.get(
        f"https://api.switch-bot.com/v1.1/devices/{device_id}/status",
        headers=sb_headers(),
        timeout=15,
    )
    r.raise_for_status()
    j = r.json()
    if j.get("statusCode") != 100:
        return None
    return j.get("body", {})

def collect():
    r = requests.get("https://api.switch-bot.com/v1.1/devices", headers=sb_headers(), timeout=15)
    r.raise_for_status()
    j = r.json()
    if j.get("statusCode") != 100:
        raise RuntimeError(f"SwitchBot API error: {j.get('message')}")

    data = {
        "source": "switchbot",
        "indoor_temp": None,
        "indoor_humidity": None,
        "outdoor_temp": None,
        "outdoor_humidity": None,
    }

    for d in j.get("body", {}).get("deviceList", []):
        device_id = d.get("deviceId")
        if not device_id:
            continue
        status = get_status(device_id)
        if not status:
            continue

        name = (d.get("deviceName") or "").lower()
        temp = status.get("temperature")
        hum = status.get("humidity")

        is_outdoor = any(k in name for k in ["屋外", "outdoor", "ベランダ", "balcony", "外"])
        if is_outdoor:
            if temp is not None:
                data["outdoor_temp"] = temp
            if hum is not None:
                data["outdoor_humidity"] = hum
        else:
            if temp is not None and data["indoor_temp"] is None:
                data["indoor_temp"] = temp
            if hum is not None and data["indoor_humidity"] is None:
                data["indoor_humidity"] = hum

    return data

def save(row):
    # テーブル列に存在する項目だけ送る
    payload = {
        "source": row.get("source"),
        "indoor_temp": row.get("indoor_temp"),
        "indoor_humidity": row.get("indoor_humidity"),
        "outdoor_temp": row.get("outdoor_temp"),
        "outdoor_humidity": row.get("outdoor_humidity"),
    }
    supabase.table("sensor_data_raw").insert(payload).execute()
    print("Saved:", payload)

if __name__ == "__main__":
    print("Start:", datetime.now())
    row = collect()
    save(row)
