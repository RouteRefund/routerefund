#!/usr/bin/env python3
"""RouteRefund monitoring queue watcher.

This script intentionally does not invent prices. It reads live RouteRefund trips
that are due for monitoring and prints a concise owner action list. Later, a fare
API provider can replace the manual-check output with observed prices.
"""
import os
import sys
from datetime import datetime, timezone

try:
    import psycopg2
except ImportError:
    print("psycopg2 is required for RouteRefund monitoring checks", file=sys.stderr)
    raise

DB_URL = os.environ.get("ROUTEREFUND_DATABASE_URL")
if not DB_URL:
    print("ROUTEREFUND_DATABASE_URL is not set", file=sys.stderr)
    sys.exit(2)

QUERY = """
select
  t.id,
  t.airline,
  t.confirmation_no,
  t.route,
  t.travel_date,
  t.paid,
  t.current_price,
  t.status,
  t.next_check_at,
  t.passenger_first,
  t.passenger_last,
  coalesce(n.owner_notes, '') as owner_notes
from public.trips t
left join public.owner_trip_notes n on n.trip_id = t.id
where coalesce(t.status, 'Monitoring') not in ('Closed')
  and coalesce(t.next_check_at, now()) <= now()
order by t.next_check_at asc nulls first, t.created_at asc
limit 25;
"""

conn = psycopg2.connect(DB_URL, connect_timeout=20, sslmode="require")
cur = conn.cursor()
cur.execute(QUERY)
rows = cur.fetchall()
cur.close(); conn.close()

if not rows:
    sys.exit(0)

print(f"RouteRefund: {len(rows)} trip(s) due for fare monitoring as of {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
for r in rows:
    trip_id, airline, confirmation, route, travel_date, paid, current_price, status, next_check_at, first, last, owner_notes = r
    print(f"- {airline or 'Airline?'} {confirmation} | {route or 'route missing'} | {travel_date or 'date missing'} | paid ${paid} | {first or ''} {last or ''} | status {status}")
    print(f"  Owner workspace: https://routerefund.com/owner-trip.html?id={trip_id}")
    if owner_notes:
        print(f"  Note: {owner_notes[:180]}")
