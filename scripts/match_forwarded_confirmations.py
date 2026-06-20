#!/usr/bin/env python3
"""Match manual trip lookup rows to parsed forwarded confirmations.

This is the first safe automatic itinerary lookup path for RouteRefund:
- customer enters confirmation + passenger identity
- forwarded confirmation parser stores parsed itinerary data
- this job fills airline/route/date/paid on the trip when there is a high-confidence match

No SerpAPI/fare search is used here.
"""
from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor


def db_url() -> str:
    if os.environ.get("ROUTEREFUND_DB_URL"):
        return os.environ["ROUTEREFUND_DB_URL"]
    return subprocess.check_output(
        ["security", "find-generic-password", "-a", "routerefund", "-s", "routerefund_db_url", "-w"],
        text=True,
    ).strip()


def norm_code(value: str | None) -> str:
    return re.sub(r"\s+", "", (value or "").upper())


def norm_name(value: str | None) -> str:
    return re.sub(r"[^A-Z]", "", (value or "").upper())


def passenger_matches(trip: dict[str, Any], forwarded: dict[str, Any]) -> bool:
    parsed = norm_name(forwarded.get("parsed_passenger_name"))
    first = norm_name(trip.get("passenger_first"))
    last = norm_name(trip.get("passenger_last"))
    if not parsed or not last:
        return False
    # Last name is the most stable airline lookup field. First name helps avoid false positives when present.
    return last in parsed and (not first or first in parsed or parsed.startswith(last))


def main() -> int:
    conn = psycopg2.connect(db_url())
    updated: list[str] = []
    try:
        with conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                select id, user_id, confirmation_no, passenger_first, passenger_last, status
                from public.trips
                where status in ('Intake review','Received')
                  and (airline is null or route is null or travel_date is null)
                order by created_at asc
                limit 25
                """
            )
            trips = cur.fetchall()
            for trip in trips:
                code = norm_code(trip["confirmation_no"])
                if not code:
                    continue
                cur.execute(
                    """
                    select id, parsed_airline, parsed_confirmation_no, parsed_passenger_name,
                           parsed_route, parsed_travel_date, parsed_paid, parser_confidence
                    from public.forwarded_confirmations
                    where upper(replace(coalesce(parsed_confirmation_no,''),' ','')) = %s
                      and status in ('Parsed','Needs review','New')
                    order by parser_confidence desc nulls last, created_at desc
                    limit 5
                    """,
                    (code,),
                )
                candidates = cur.fetchall()
                match = next((c for c in candidates if passenger_matches(trip, c)), None)
                if not match:
                    continue
                confidence = float(match.get("parser_confidence") or 0)
                enough = bool(match.get("parsed_airline") or match.get("parsed_route") or match.get("parsed_travel_date"))
                if not enough:
                    continue
                # Keep customer-facing exact savings hidden; this only fills itinerary basics and original paid price when parsed.
                cur.execute(
                    """
                    update public.trips
                    set airline = coalesce(airline, %s),
                        route = coalesce(route, %s),
                        travel_date = coalesce(travel_date, %s),
                        paid = coalesce(paid, %s),
                        status = case when %s then 'Monitoring' else status end,
                        updated_at = now()
                    where id = %s
                    """,
                    (
                        match.get("parsed_airline"),
                        match.get("parsed_route"),
                        match.get("parsed_travel_date"),
                        match.get("parsed_paid"),
                        confidence >= 0.55,
                        trip["id"],
                    ),
                )
                cur.execute(
                    """
                    update public.forwarded_confirmations
                    set created_trip_id = coalesce(created_trip_id, %s),
                        status = case when %s then 'Matched' else status end,
                        reviewed_at = coalesce(reviewed_at, now())
                    where id = %s
                    """,
                    (trip["id"], confidence >= 0.55, match["id"]),
                )
                updated.append(str(trip["id"]))
        if updated:
            print(f"Matched {len(updated)} trip lookup(s): {', '.join(updated)}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
