#!/usr/bin/env python3
"""Free/no-key live flight enrichment for RouteRefund.

Uses only public free endpoints:
- adsb.lol callsign lookup for live airborne aircraft by callsign (e.g. AAL981)
- aviationweather.gov METAR for origin/destination weather by ICAO airport code

This does NOT retrieve PNR/booking data, does NOT check fares, and does NOT change airline reservations.
It stores owner-only enrichment rows in public.flight_status_checks.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from typing import Any

import psycopg2
from psycopg2.extras import Json, RealDictCursor

AIRLINE_CALLSIGNS = {
    "american airlines": "AAL",
    "american": "AAL",
    "aa": "AAL",
    "delta air lines": "DAL",
    "delta airlines": "DAL",
    "delta": "DAL",
    "united airlines": "UAL",
    "united": "UAL",
    "southwest airlines": "SWA",
    "southwest": "SWA",
    "alaska airlines": "ASA",
    "alaska": "ASA",
    "jetblue": "JBU",
    "jetblue airways": "JBU",
    "frontier airlines": "FFT",
    "frontier": "FFT",
    "spirit airlines": "NKS",
    "spirit": "NKS",
    "hawaiian airlines": "HAL",
    "hawaiian": "HAL",
}

# For AviationWeather, most continental US IATA airport codes become ICAO by prefixing K.
# Add exceptions as needed for Alaska/Hawaii/Puerto Rico and non-US airports.
IATA_TO_ICAO_EXCEPTIONS = {
    "HNL": "PHNL",
    "OGG": "PHOG",
    "KOA": "PHKO",
    "LIH": "PHLI",
    "ANC": "PANC",
    "FAI": "PAFA",
    "JNU": "PAJN",
    "SJU": "TJSJ",
}


def db_url() -> str:
    if os.environ.get("ROUTEREFUND_DB_URL"):
        return os.environ["ROUTEREFUND_DB_URL"]
    return subprocess.check_output(
        ["security", "find-generic-password", "-a", "routerefund", "-s", "routerefund_db_url", "-w"],
        text=True,
    ).strip()


def http_json(url: str, timeout: int = 15) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "RouteRefund/1.0 flight-enrichment"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def callsign_for(airline: str | None, flight_no: str | None) -> str | None:
    raw = (flight_no or "").upper().strip()
    if not raw:
        return None
    m = re.search(r"([A-Z]{2,3})?\s*(\d{1,4})", raw)
    if not m:
        return None
    prefix, number = m.group(1), m.group(2)
    if prefix:
        iata = prefix
        # Normalize common IATA airline prefixes to ICAO callsigns.
        iata_map = {"AA": "AAL", "DL": "DAL", "UA": "UAL", "WN": "SWA", "AS": "ASA", "B6": "JBU", "F9": "FFT", "NK": "NKS", "HA": "HAL"}
        return f"{iata_map.get(iata, iata)}{number}"
    return f"{AIRLINE_CALLSIGNS.get((airline or '').lower().strip(), '')}{number}" or None


def route_airports(route: str | None) -> list[str]:
    if not route:
        return []
    codes = re.findall(r"\b[A-Z]{3}\b", route.upper())
    return codes[:2]


def iata_to_icao(iata: str) -> str:
    iata = iata.upper()
    return IATA_TO_ICAO_EXCEPTIONS.get(iata, f"K{iata}")


def fetch_adsb(callsign: str) -> tuple[str, dict[str, Any]]:
    url = f"https://api.adsb.lol/v2/callsign/{urllib.parse.quote(callsign)}"
    data = http_json(url)
    aircraft = data.get("ac") or []
    if not aircraft:
        return "Not airborne", {"callsign": callsign, "total": data.get("total", 0), "source": url}
    ac = aircraft[0]
    status = "Airborne" if ac.get("lat") is not None and ac.get("lon") is not None else "Seen"
    return status, {"callsign": callsign, "aircraft": ac, "source": url}


def fetch_weather(route: str | None) -> tuple[str, dict[str, Any]] | None:
    airports = route_airports(route)
    if not airports:
        return None
    icaos = [iata_to_icao(x) for x in airports]
    url = "https://aviationweather.gov/api/data/metar?" + urllib.parse.urlencode({"ids": ",".join(icaos), "format": "json"})
    data = http_json(url)
    return "Weather observed" if data else "Weather unavailable", {"airports": airports, "icao": icaos, "metar": data, "source": url}


def insert_check(cur, trip_id: str, source: str, status: str, callsign: str | None, route: str | None, payload: dict[str, Any]) -> None:
    cur.execute(
        """
        insert into public.flight_status_checks(trip_id, source, status, callsign, route, payload)
        values (%s, %s, %s, %s, %s, %s)
        """,
        (trip_id, source, status, callsign, route, Json(payload)),
    )


def main(limit: int = 10, dry_run: bool = False) -> int:
    conn = psycopg2.connect(db_url())
    processed = 0
    try:
        with conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                select id, airline, flight_no, route, travel_date
                from public.trips
                where flight_no is not null
                  and coalesce(status,'') not in ('Archived','Closed')
                  and (travel_date is null or travel_date between current_date - interval '1 day' and current_date + interval '1 day')
                order by coalesce(travel_date, current_date), created_at desc
                limit %s
                """,
                (limit,),
            )
            rows = cur.fetchall()
            for row in rows:
                processed += 1
                trip_id = str(row["id"])
                route = row.get("route")
                callsign = callsign_for(row.get("airline"), row.get("flight_no"))
                if callsign:
                    try:
                        status, payload = fetch_adsb(callsign)
                    except Exception as exc:  # network/provider failures should not break the site
                        status, payload = "ADS-B unavailable", {"error": str(exc), "callsign": callsign}
                    if dry_run:
                        print(f"DRY ADSB {trip_id} {callsign}: {status}")
                    else:
                        insert_check(cur, trip_id, "adsb.lol", status, callsign, route, payload)
                    time.sleep(0.5)
                weather = None
                try:
                    weather = fetch_weather(route)
                except Exception as exc:
                    weather = ("Weather unavailable", {"error": str(exc), "route": route})
                if weather:
                    status, payload = weather
                    if dry_run:
                        print(f"DRY WEATHER {trip_id} {route}: {status}")
                    else:
                        insert_check(cur, trip_id, "aviationweather.gov", status, callsign, route, payload)
                    time.sleep(0.5)
        if dry_run:
            conn.rollback()
        else:
            conn.commit()
        if processed:
            print(f"Processed {processed} trip(s) with free flight enrichment")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    raise SystemExit(main(dry_run=dry))
