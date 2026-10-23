import asyncio
import os
from datetime import datetime, timedelta, timezone

import httpx

from jobs.common.supabase_client import get_supabase_admin_client


OCTOPUS_API_URL = "https://api.oejp-kraken.energy/v1/graphql/"


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


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
    email = require_env("OCTOPUS_EMAIL")
    password = require_env("OCTOPUS_PASSWORD")

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            OCTOPUS_API_URL,
            json={
                "query": AUTH_QUERY,
                "variables": {"input": {"email": email, "password": password}},
            },
        )
        res.raise_for_status()
        payload = res.json()
        if payload.get("errors"):
            raise RuntimeError(f"Octopus auth error: {payload['errors']}")
        return payload["data"]["obtainKrakenToken"]["token"]


async def get_account_number(token: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            OCTOPUS_API_URL,
            json={"query": ACCOUNT_QUERY},
            headers={"authorization": f"JWT {token}"},
        )
        res.raise_for_status()
        payload = res.json()
        if payload.get("errors"):
            raise RuntimeError(f"Octopus account query error: {payload['errors']}")
        accounts = payload["data"]["viewer"]["accounts"]
        if not accounts:
            raise RuntimeError("No Octopus account found.")
        return accounts[0]["number"]


async def get_readings(token: str, account_number: str, start_at: datetime, end_at: datetime):
    variables = {
        "accountNumber": account_number,
        "fromDatetime": start_at.isoformat(),
        "toDatetime": end_at.isoformat(),
    }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            OCTOPUS_API_URL,
            json={"query": READINGS_QUERY, "variables": variables},
            headers={"authorization": f"JWT {token}"},
        )
        res.raise_for_status()
        payload = res.json()
        if payload.get("errors"):
            raise RuntimeError(f"Octopus readings query error: {payload['errors']}")

        points = payload["data"]["account"]["properties"][0]["electricitySupplyPoints"][0]["halfHourlyReadings"]
        return [
            {
                "start_at": item["startAt"],
                "end_at": item["endAt"],
                "value": float(item["value"]),
            }
            for item in points
        ]


def save_to_supabase(readings: list[dict]) -> None:
    if not readings:
        print("[INFO] No Octopus readings to save.")
        return

    supabase = get_supabase_admin_client()

    rows = []
    for r in readings:
        start_dt_utc = datetime.fromisoformat(r["start_at"].replace("Z", "+00:00"))
        jst_dt = start_dt_utc.astimezone(timezone(timedelta(hours=9)))
        rows.append(
            {
                "start_at": r["start_at"],
                "end_at": r["end_at"],
                "reading_date": jst_dt.date().isoformat(),
                "source": "octopus",
                "consumption_kwh": r["value"],
                "raw_json": r,
            }
        )

    (
        supabase.table("energy_data_raw")
        .upsert(rows, on_conflict="source,start_at")
        .execute()
    )
    print(f"[OK] Saved {len(rows)} Octopus readings.")


async def main():
    print(f"[START] collect_octopus at {datetime.now().isoformat()}")
    token = await get_token()
    account_number = await get_account_number(token)

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=2)  # 直近2日を再取得して欠損補完
    readings = await get_readings(token, account_number, start, now)

    save_to_supabase(readings)
    print("[DONE] collect_octopus finished")


if __name__ == "__main__":
    asyncio.run(main())
