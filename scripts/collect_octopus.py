import os
import asyncio
import datetime
from typing import List, Optional
import httpx
from supabase import create_client
from zoneinfo import ZoneInfo  # タイムゾーン対応

# 環境変数から設定を取得
OCTOPUS_EMAIL = os.environ['OCTOPUS_EMAIL']
OCTOPUS_PASSWORD = os.environ['OCTOPUS_PASSWORD']
OCTOPUS_API_URL = 'https://api.oejp-kraken.energy/v1/graphql/'
SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_KEY']

# Supabaseクライアント初期化
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# GraphQLクエリ
AUTH_QUERY = """
mutation obtainKrakenToken($input: ObtainJSONWebTokenInput!) {
    obtainKrakenToken(input: $input) {
        token
    }
}
"""

ACCOUNT_QUERY = """
query accountViewer {
    viewer {
        accounts {
            number
        }
    }
}
"""

READINGS_QUERY = """
query halfHourlyReadings($accountNumber: String!, $fromDatetime: DateTime, $toDatetime: DateTime) {
    account(accountNumber: $accountNumber) {
        properties {
            electricitySupplyPoints {
                halfHourlyReadings(fromDatetime: $fromDatetime, toDatetime: $toDatetime) {
                    startAt
                    endAt
                    value
                }
            }
        }
    }
}
"""

async def get_token() -> str:
    """JWTトークンを取得"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url=OCTOPUS_API_URL,
            json={
                "query": AUTH_QUERY,
                "variables": {
                    "input": {
                        "email": OCTOPUS_EMAIL,
                        "password": OCTOPUS_PASSWORD,
                    }
                },
            },
            timeout=30.0
        )
        response.raise_for_status()
        data = response.json()
        
        if errors := data.get("errors"):
            raise ValueError(f"Authentication failed: {errors}")
        
        return data["data"]["obtainKrakenToken"]["token"]

async def get_account_number(token: str) -> str:
    """アカウント番号を取得"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url=OCTOPUS_API_URL,
            json={"query": ACCOUNT_QUERY},
            headers={"authorization": f"JWT {token}"},
            timeout=30.0
        )
        response.raise_for_status()
        data = response.json()
        
        if errors := data.get("errors"):
            raise ValueError(f"Failed to get account: {errors}")
        
        return data["data"]["viewer"]["accounts"][0]["number"]

async def get_readings(token: str, account_number: str, start_at: datetime.datetime, end_at: Optional[datetime.datetime] = None) -> List[dict]:
    """30分ごとの使用量データを取得"""
    variables = {
        "accountNumber": account_number,
        "fromDatetime": start_at.isoformat(),
    }
    
    if end_at:
        variables["toDatetime"] = end_at.isoformat()
    
    print(f"Fetching readings: {variables}")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url=OCTOPUS_API_URL,
            json={
                "query": READINGS_QUERY,
                "variables": variables,
            },
            headers={"authorization": f"JWT {token}"},
            timeout=30.0
        )
        response.raise_for_status()
        data = response.json()
        
        if errors := data.get("errors"):
            raise ValueError(f"Failed to get readings: {errors}")
        
        readings_raw = data["data"]["account"]["properties"][0]["electricitySupplyPoints"][0]["halfHourlyReadings"]
        
        readings = []
        for reading in readings_raw:
            readings.append({
                "start_at": reading["startAt"],
                "end_at": reading["endAt"],
                "value": float(reading["value"])
            })
        
        return readings

async def save_to_supabase(readings: List[dict], date_str: str):
    """Supabaseに保存"""
    for reading in readings:
        # ISO形式の日時から時刻を抽出
        start_dt = datetime.datetime.fromisoformat(reading["start_at"].replace('Z', '+00:00'))
        # 日本時間に変換
        jst_dt = start_dt + datetime.timedelta(hours=9)
        time_str = jst_dt.strftime("%H:%M")
        
        try:
            result = supabase.table('energy_data').upsert({
                'date': date_str,
                'time': time_str,
                'consumption': reading["value"],
                'is_final': False
            }, on_conflict='date,time').execute()
            
            print(f"Saved: {date_str} {time_str} - {reading['value']} kWh")
        except Exception as e:
            print(f"Error saving {date_str} {time_str}: {e}")

async def mark_yesterday_final():
    """前日のデータを確定にする"""
    yesterday = datetime.date.today() - datetime.timedelta(days=1)
    yesterday_str = yesterday.isoformat()
    
    try:
        result = supabase.table('energy_data').update({
            'is_final': True
        }).eq('date', yesterday_str).eq('is_final', False).execute()
        
        print(f"Marked {yesterday_str} as final")
    except Exception as e:
        print(f"Error marking final: {e}")

async def main():
    print(f"Starting Octopus Energy data collection at {datetime.datetime.now()}")
    
    try:
        # 認証
        print("Authenticating...")
        token = await get_token()
        print("Authentication successful")
        
        # アカウント番号取得
        print("Getting account number...")
        account_number = await get_account_number(token)
        print(f"Account number: {account_number}")
        
        # 今日のデータを取得（日本時間）
        jst = ZoneInfo("Asia/Tokyo")
        today = datetime.date.today()
        start_at = datetime.datetime.combine(today, datetime.time.min, tzinfo=jst)
        
        print(f"Fetching data for {today}...")
        readings = await get_readings(token, account_number, start_at)
        print(f"Retrieved {len(readings)} readings")
        
        # Supabaseに保存
        if readings:
            await save_to_supabase(readings, today.isoformat())
            print("Data saved successfully")
        else:
            print("No readings to save")
        
        # 日付が変わった直後（0〜2時）なら、前日を確定
        current_hour = datetime.datetime.now().hour
        if 0 <= current_hour < 2:
            await mark_yesterday_final()
        
        print("Collection completed successfully")
        
    except Exception as e:
        print(f"Error during collection: {e}")
        raise

if __name__ == '__main__':
    asyncio.run(main())
