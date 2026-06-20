#!/usr/bin/env python3
"""Run queued airline manage-trip lookups for RouteRefund.

This worker is intended to run immediately/frequently after trip submission:
- reads public.airline_lookup_attempts where status='Queued'
- loads the matching trip identity fields
- runs the airline-specific browser automation probe
- records the outcome for partner review / later automation

It does not bypass CAPTCHA/security checks and does not store screenshots or airline credentials.
"""
from __future__ import annotations

import os
import subprocess
from dataclasses import asdict

import psycopg2
from psycopg2.extras import RealDictCursor

from airline_lookup_probe import LookupInput, run_lookup


AIRLINE_KEYS = {
    "american airlines": "american",
    "american": "american",
    "aa": "american",
    "delta air lines": "delta",
    "delta airlines": "delta",
    "delta": "delta",
    "united airlines": "united",
    "united": "united",
}

SUPPORTED_AIRLINES = set(AIRLINE_KEYS)


def db_url() -> str:
    if os.environ.get("ROUTEREFUND_DB_URL"):
        return os.environ["ROUTEREFUND_DB_URL"]
    return subprocess.check_output(
        ["security", "find-generic-password", "-a", "routerefund", "-s", "routerefund_db_url", "-w"],
        text=True,
    ).strip()


def airline_key(name: str | None) -> str | None:
    return AIRLINE_KEYS.get((name or "").strip().lower())


def finish_attempt(cur, attempt_id, status: str, *, error: str = "", excerpt: str = "") -> None:
    cur.execute(
        """
        update public.airline_lookup_attempts
        set status = %s,
            last_error = nullif(%s, ''),
            result_excerpt = nullif(%s, ''),
            finished_at = now(),
            updated_at = now()
        where id = %s
        """,
        (status, error[:1000], excerpt[:1800], attempt_id),
    )


def main(limit: int = 5) -> int:
    conn = psycopg2.connect(db_url())
    processed = 0
    try:
        with conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                select a.id as attempt_id, a.airline as attempt_airline, a.attempt_count,
                       t.id as trip_id, t.airline, t.confirmation_no, t.passenger_first,
                       t.passenger_last, t.date_of_birth
                from public.airline_lookup_attempts a
                join public.trips t on t.id = a.trip_id
                where a.status = 'Queued'
                order by a.created_at asc
                limit %s
                for update skip locked
                """,
                (limit,),
            )
            rows = cur.fetchall()
            for row in rows:
                processed += 1
                key = airline_key(row["attempt_airline"] or row["airline"])
                cur.execute(
                    """
                    update public.airline_lookup_attempts
                    set status = 'Running', attempt_count = attempt_count + 1,
                        started_at = coalesce(started_at, now()), updated_at = now()
                    where id = %s
                    """,
                    (row["attempt_id"],),
                )
                conn.commit()

                if not key:
                    with conn, conn.cursor(cursor_factory=RealDictCursor) as update_cur:
                        finish_attempt(update_cur, row["attempt_id"], "Unsupported", error=f"No adapter yet for {row['attempt_airline'] or row['airline']}")
                    conn.commit()
                    continue

                result = run_lookup(
                    LookupInput(
                        airline=key,
                        confirmation=row["confirmation_no"],
                        first_name=row.get("passenger_first") or "",
                        last_name=row.get("passenger_last") or "",
                        date_of_birth=str(row.get("date_of_birth") or ""),
                    ),
                    headless=True,
                )
                data = asdict(result)
                status_map = {
                    "blocked_by_captcha_or_security_check": "Blocked",
                    "blocked_or_unavailable": "Blocked",
                    "reservation_not_found": "Not found",
                    "unsupported_airline": "Unsupported",
                    "missing_required_fields": "Needs review",
                    "timeout_or_no_result": "Needs review",
                    "timeout": "Needs review",
                    "error": "Error",
                    "page_loaded_needs_parser": "Found",
                }
                status = status_map.get(result.status, "Found" if result.ok else "Needs review")
                with conn, conn.cursor(cursor_factory=RealDictCursor) as update_cur:
                    finish_attempt(update_cur, row["attempt_id"], status, error=data.get("error") or result.status, excerpt=data.get("raw_excerpt") or "")
                    if result.ok:
                        update_cur.execute(
                            """
                            update public.trips
                            set status = case when status in ('Intake review','Received') then 'Monitoring' else status end,
                                updated_at = now()
                            where id = %s
                            """,
                            (row["trip_id"],),
                        )
                conn.commit()
        if processed:
            print(f"Processed {processed} airline lookup attempt(s)")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
