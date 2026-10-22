import os
from datetime import datetime, timedelta

import httpx
from supabase import create_client

OCTOPUS_EMAIL = os.environ['OCTOPUS_EMAIL']
OCTOPUS_PASSWORD = os.environ['OCTOPUS_PASSWORD']
OCTOPUS_API_URL = 'https://api.oejp-kraken.energy/v1/graphql/'
SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
SYSTEM_OWNER_ID = '11111111-1111-1111-1111-111111111111'

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
    async with httpx.AsyncClient() as client:
        response = await client.post(
            OCTOPUS_API_URL,
            json={
                'query': AUTH_QUERY,
                'variables': {'input': {'email': OCTOPUS_EMAIL, 'password': OCTOPUS_PASSWORD}},
            },
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get('errors'):
            raise ValueError(payload['errors'])
        return payload['data']['obtainKrakenToken']['token']


async def get_account_number(token: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            OCTOPUS_API_URL,
            json={'query': ACCOUNT_QUERY},
            headers={'authorization': f'JWT {token}'},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get('errors'):
            raise ValueError(payload['errors'])
        return payload['data']['viewer']['accounts'][0]['number']


async def get_readings(token: str, account_number: str, start_at: datetime, end_at: datetime | None = None):
    variables = {'accountNumber': account_number, 'fromDatetime': start_at.isoformat()}
    if end_at:
        variables['toDatetime'] = end_at.isoformat()

    async with httpx.AsyncClient() as client:
        response = await client.post(
            OCTOPUS_API_URL,
            json={'query': READINGS_QUERY, 'variables': variables},
            headers={'authorization': f'JWT {token}'},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get('errors'):
            raise ValueError(payload['errors'])

        readings = payload['data']['account']['properties'][0]['electricitySupplyPoints'][0]['halfHourlyReadings']
        return [
            {
                'start_at': item['startAt'],
                'end_at': item['endAt'],
                'value': float(item['value']),
            }
            for item in readings
        ]


async def save_to_supabase(readings):
    if not readings:
        print('No Octopus readings to save.')
        return

    rows = []
    for reading in readings:
        start_dt = datetime.fromisoformat(reading['start_at'].replace('Z', '+00:00'))
        jst = start_dt + timedelta(hours=9)
        rows.append({
            'owner_id': SYSTEM_OWNER_ID,
            'source': 'octopus',
            'reading_date': jst.date().isoformat(),
            'reading_time': jst.strftime('%H:%M:%S'),
            'consumption': reading['value'],
            'raw': reading,
        })

    supabase.schema('private').table('energy_data_raw').insert(rows).execute()
    print(f'Saved {len(rows)} Octopus readings to private.energy_data_raw.')


async def main():
    token = await get_token()
    account_number = await get_account_number(token)
    now = datetime.now()
    start = datetime.combine(now.date(), datetime.min.time())
    readings = await get_readings(token, account_number, start)
    await save_to_supabase(readings)
    print('Octopus collection complete.')


if __name__ == '__main__':
    import asyncio
    asyncio.run(main())
