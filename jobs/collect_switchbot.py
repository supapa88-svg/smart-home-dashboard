import base64
import hashlib
import hmac
import os
import time
from datetime import datetime, timezone

import requests

from jobs.common.supabase_client import get_supabase_admin_client


SYSTEM_OWNER_ID = "11111111-1111-1111-1111-111111111111"


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_switchbot_headers() -> dict:
    token = require_env("SWITCHBOT_TOKEN")
    secret = require_env("SWITCHBOT_SECRET")
    nonce = str(int(time.time() * 1000))
    t = str(int(time.time() * 1000))
    string_to_sign = f"{token}{t}{nonce}"
    sign = base64.b64encode(
        hmac.new(secret.encode(), string_to_sign.encode(), hashlib.sha256).digest()
    ).decode()

    return {
        "Authorization": token,
        "sign": sign,
        "t": t,
        "nonce": nonce,
        "Content-Type": "application/json",
    }


def get_device_status(device_id: str) -> dict | None:
    headers = get_switchbot_headers()
    try:
        response = requests.get(
            f"https://api.switch-bot.com/v1.1/devices/{device_id}/status",
            headers=headers,
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
        if data.get("statusCode") == 100:
            return data.get("body", {})
        print(f"[WARN] status API error for {device_id}: {data.get('message')}")
        return None
    except Exception as exc:
        print(f"[ERROR] get_device_status failed for {device_id}: {exc}")
        return None


def collect_sensor_data() -> dict | None:
    headers = get_switchbot_headers()
    try:
        response = requests.get(
            "https://api.switch-bot.com/v1.1/devices",
            headers=headers,
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()

        if payload.get("statusCode") != 100:
            print(f"[ERROR] devices API error: {payload.get('message')}")
            return None

        sensor_data = {
            "indoor_temp": None,
            "indoor_humidity": None,
            "outdoor_temp": None,
            "outdoor_humidity": None,
        }

        for device in payload.get("body", {}).get("deviceList", []):
            device_id = device.get("deviceId")
            device_name = (device.get("deviceName") or "").lower()
            device_type = (device.get("deviceType") or "").lower()
            if not device_id:
                continue

            if any(x in device_type for x in ["meter", "hub 2", "hub mini", "woiosensor"]):
                status = get_device_status(device_id)
                if not status:
                    continue

                temp = status.get("temperature")
                humidity = status.get("humidity")

                is_outdoor = any(k in device_name for k in ["屋外", "outdoor", "ベランダ", "balcony", "外"])
                if is_outdoor:
                    if temp is not None:
                        sensor_data["outdoor_temp"] = temp
                    if humidity is not None:
                        sensor_data["outdoor_humidity"] = humidity
                else:
                    if temp is not None and sensor_data["indoor_temp"] is None:
                        sensor_data["indoor_temp"] = temp
                    if humidity is not None and sensor_data["indoor_humidity"] is None:
                        sensor_data["indoor_humidity"] = humidity

        return sensor_data
    except Exception as exc:
        print(f"[ERROR] collect_sensor_data failed: {exc}")
        return None


def save_to_supabase(sensor_data: dict | None) -> None:
    if sensor_data is None or not any(v is not None for v in sensor_data.values()):
        print("[INFO] No sensor data to save.")
        return

    supabase = get_supabase_admin_client()

    payload = {
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "source": "switchbot",
        "indoor_temp": sensor_data.get("indoor_temp"),
        "indoor_humidity": sensor_data.get("indoor_humidity"),
        "outdoor_temp": sensor_data.get("outdoor_temp"),
        "outdoor_humidity": sensor_data.get("outdoor_humidity"),
        "raw_json": sensor_data,
    }

    (
        supabase.table("sensor_data_raw")
        .insert(payload)
        .execute()
    )
    print(f"[OK] Saved SwitchBot data: {sensor_data}")


def main():
    print(f"[START] collect_switchbot at {datetime.now().isoformat()}")
    data = collect_sensor_data()
    save_to_supabase(data)
    print("[DONE] collect_switchbot finished")


if __name__ == "__main__":
    main()
