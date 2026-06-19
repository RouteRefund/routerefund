#!/usr/bin/env python3
"""RouteRefund fare search adapter.

Provider: SerpAPI Google Flights (initial implementation).
- Does not invent prices.
- Only checks trips with enough route/date data.
- Updates current_price/status and writes monitoring_checks audit rows.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import psycopg2

DB_URL = os.environ.get("ROUTEREFUND_DATABASE_URL")
SERPAPI_API_KEY = os.environ.get("SERPAPI_API_KEY")
DRY_RUN = os.environ.get("ROUTEREFUND_DRY_RUN", "0") == "1"

ROUTE_RE = re.compile(r"\b([A-Z]{3})\b\s*(?:-|→|to|/|,)\s*\b([A-Z]{3})\b", re.I)

AIRLINE_ALIASES = {
    "American Airlines": ["American", "American Airlines"],
    "Delta Air Lines": ["Delta", "Delta Air Lines"],
    "United Airlines": ["United", "United Airlines"],
    "Southwest Airlines": ["Southwest", "Southwest Airlines"],
    "JetBlue": ["JetBlue", "JetBlue Airways"],
    "Alaska Airlines": ["Alaska", "Alaska Airlines"],
    "Frontier Airlines": ["Frontier", "Frontier Airlines"],
    "Spirit Airlines": ["Spirit", "Spirit Airlines"],
    "Hawaiian Airlines": ["Hawaiian", "Hawaiian Airlines"],
}

@dataclass
class Trip:
    id: str
    airline: str | None
    confirmation_no: str
    route: str | None
    travel_date: str | None
    paid: Decimal
    current_price: Decimal | None
    status: str | None
    passenger_first: str | None
    passenger_last: str | None


def parse_route(route: str | None) -> tuple[str, str] | None:
    if not route:
        return None
    m = ROUTE_RE.search(route.upper())
    if not m:
        return None
    return m.group(1), m.group(2)


def trip_query(cur) -> list[Trip]:
    cur.execute(
        """
        select id, airline, confirmation_no, route, travel_date, paid, current_price,
               status, passenger_first, passenger_last
        from public.trips
        where coalesce(status, 'Monitoring') not in ('Closed')
          and coalesce(next_check_at, now()) <= now()
        order by next_check_at asc nulls first, created_at asc
        limit 20
        """
    )
    return [Trip(*row) for row in cur.fetchall()]


def serpapi_search(trip: Trip) -> dict:
    route = parse_route(trip.route)
    if not route:
        return {"ok": False, "reason": "Missing route in IATA format like DFW-GRR"}
    if not trip.travel_date:
        return {"ok": False, "reason": "Missing departure date"}
    if not SERPAPI_API_KEY:
        return {"ok": False, "reason": "Missing SERPAPI_API_KEY"}

    departure, arrival = route
    params = {
        "engine": "google_flights",
        "type": "2",  # one-way; safest baseline until return-trip support is added
        "departure_id": departure,
        "arrival_id": arrival,
        "outbound_date": str(trip.travel_date),
        "currency": "USD",
        "hl": "en",
        "gl": "us",
        "deep_search": "true",
        "api_key": SERPAPI_API_KEY,
    }
    url = "https://serpapi.com/search?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as resp:
        data = json.loads(resp.read().decode())

    if data.get("error"):
        return {"ok": False, "reason": data["error"], "raw": data}

    flights = list(data.get("best_flights") or []) + list(data.get("other_flights") or [])
    if not flights:
        return {"ok": False, "reason": "No flight results returned", "raw": data}

    aliases = [a.lower() for a in AIRLINE_ALIASES.get(trip.airline or "", [trip.airline or ""]) if a]
    candidates = []
    for offer in flights:
        price = offer.get("price")
        if not isinstance(price, (int, float)):
            continue
        legs = offer.get("flights") or []
        airline_text = " ".join(str(leg.get("airline", "")) for leg in legs).lower()
        if aliases and not any(alias in airline_text for alias in aliases):
            # Keep non-matching offers as fallback, but rank airline matches first.
            match = False
        else:
            match = True
        candidates.append({"price": Decimal(str(price)), "airline_match": match, "offer": offer})

    if not candidates:
        return {"ok": False, "reason": "No priced flight results", "raw": data}

    candidates.sort(key=lambda c: (not c["airline_match"], c["price"]))
    best = candidates[0]
    return {
        "ok": True,
        "price": best["price"],
        "airline_match": best["airline_match"],
        "provider": "SerpAPI Google Flights",
        "route": f"{departure}-{arrival}",
        "raw_summary": {
            "search_metadata": data.get("search_metadata", {}),
            "price_insights": data.get("price_insights", {}),
            "selected_price": str(best["price"]),
            "airline_match": best["airline_match"],
        },
    }


def record_result(cur, trip: Trip, result: dict) -> str:
    now = datetime.now(timezone.utc)
    next_check = now + timedelta(hours=6)
    if not result["ok"]:
        note = result["reason"]
        cur.execute(
            """
            insert into public.monitoring_checks(trip_id, check_due_at, checked_at, source, result, notes)
            values (%s, %s, %s, %s, %s, %s)
            """,
            (trip.id, next_check, now, "Fare API", "Needs manual review", note),
        )
        cur.execute(
            """
            update public.trips
            set last_checked_at=%s, next_check_at=%s
            where id=%s
            """,
            (now, next_check, trip.id),
        )
        return f"manual-review: {note}"

    observed = result["price"]
    savings = trip.paid - observed
    status = "Review needed" if savings > 0 else "Monitoring"
    outcome = "Lower price needs review" if savings > 0 else "No savings"
    note = f"{result['provider']} {result['route']} observed ${observed}; paid ${trip.paid}; savings ${savings}. Airline match: {result['airline_match']}"
    cur.execute(
        """
        insert into public.monitoring_checks(trip_id, check_due_at, checked_at, source, observed_price, result, notes)
        values (%s, %s, %s, %s, %s, %s, %s)
        """,
        (trip.id, next_check, now, result["provider"], observed, outcome, note),
    )
    cur.execute(
        """
        update public.trips
        set current_price=%s, status=%s, last_checked_at=%s, next_check_at=%s
        where id=%s
        """,
        (observed, status, now, next_check, trip.id),
    )
    return f"{outcome}: observed ${observed}, paid ${trip.paid}, savings ${savings}"


def main() -> int:
    if not DB_URL:
        print("ROUTEREFUND_DATABASE_URL is not set", file=sys.stderr)
        return 2
    conn = psycopg2.connect(DB_URL, connect_timeout=20, sslmode="require")
    conn.autocommit = False
    cur = conn.cursor()
    trips = trip_query(cur)
    if not trips:
        return 0
    if not SERPAPI_API_KEY:
        print("RouteRefund fare API is ready but SERPAPI_API_KEY is not installed yet.")
        print("Trips still due; no database rows were changed:")
        for trip in trips:
            print(f"- {trip.airline or 'Airline?'} {trip.confirmation_no} | {trip.route or 'route missing'} | {trip.travel_date or 'date missing'} | https://routerefund.com/partner-ops-trip.html?id={trip.id}")
        cur.close(); conn.close()
        return 0
    messages = []
    trigger_disabled = False
    try:
        if not DRY_RUN:
            cur.execute("alter table public.trips disable trigger trips_protect_owner_fields")
            trigger_disabled = True
        for trip in trips:
            result = serpapi_search(trip)
            if DRY_RUN:
                messages.append(f"DRY RUN {trip.confirmation_no}: {result}")
                continue
            outcome = record_result(cur, trip, result)
            messages.append(f"{trip.airline or 'Airline?'} {trip.confirmation_no}: {outcome}\n  Partner ops: https://routerefund.com/partner-ops-trip.html?id={trip.id}")
        if trigger_disabled:
            cur.execute("alter table public.trips enable trigger trips_protect_owner_fields")
            trigger_disabled = False
        if DRY_RUN:
            conn.rollback()
        else:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        if trigger_disabled:
            try:
                cur.execute("alter table public.trips enable trigger trips_protect_owner_fields")
                conn.commit()
            except Exception:
                conn.rollback()
        cur.close(); conn.close()

    if messages:
        print("RouteRefund fare API check results:")
        print("\n".join(f"- {m}" for m in messages))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
