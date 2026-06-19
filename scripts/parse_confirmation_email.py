#!/usr/bin/env python3
"""Heuristic parser for forwarded airline confirmation emails.

Input: raw email/plain text on stdin or a file path argument.
Output: parsed JSON. This does not create trips automatically; owner review is required.
"""
from __future__ import annotations
import json, re, sys
from datetime import datetime
from pathlib import Path

AIRLINES = [
    "American Airlines", "Delta", "Delta Air Lines", "United", "United Airlines",
    "Southwest", "Southwest Airlines", "JetBlue", "Alaska", "Alaska Airlines",
    "Spirit", "Spirit Airlines", "Frontier", "Frontier Airlines", "Hawaiian", "Hawaiian Airlines",
]
AIRPORT = re.compile(r"\b([A-Z]{3})\b")
MONEY = re.compile(r"(?:total|paid|amount|charged|fare|price)[^$]{0,40}\$\s*([0-9,]+(?:\.\d{2})?)", re.I)
LOCATOR_PATTERNS = [
    re.compile(r"record\s+locator\s*[:#-]?\s*([A-Z0-9]{5,13})", re.I),
    re.compile(r"confirmation\s*(?:number|code)?\s*[:#-]?\s*([A-Z0-9]{5,13})", re.I),
    re.compile(r"(?:record locator|confirmation(?: number| code)?|booking reference|reservation code)\s*[:#-]?\s*([A-Z0-9]{5,13})", re.I),
    re.compile(r"\b([A-Z0-9]{6})\b"),
]
DATE_PATTERNS = [
    re.compile(r"(?:depart(?:ure)?|flight date|date)\s*[:#-]?\s*([A-Z][a-z]{2,9}\s+\d{1,2},?\s+\d{4})", re.I),
    re.compile(r"(?:depart(?:ure)?|flight date|date)\s*[:#-]?\s*(\d{1,2}/\d{1,2}/\d{2,4})", re.I),
]

def normalize_airline(text: str) -> str | None:
    low = text.lower()
    for a in AIRLINES:
        if a.lower() in low:
            return {
                "Delta": "Delta Air Lines",
                "United": "United Airlines",
                "Southwest": "Southwest Airlines",
                "Alaska": "Alaska Airlines",
                "Spirit": "Spirit Airlines",
                "Frontier": "Frontier Airlines",
                "Hawaiian": "Hawaiian Airlines",
            }.get(a, a)
    return None

def parse_date(value: str) -> str | None:
    for fmt in ("%B %d, %Y", "%B %d %Y", "%b %d, %Y", "%b %d %Y", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(value.strip(), fmt).date().isoformat()
        except ValueError:
            pass
    return None

def parse(text: str) -> dict:
    clean = re.sub(r"[ \t]+", " ", text)
    airline = normalize_airline(clean)
    locator = None
    for pat in LOCATOR_PATTERNS:
        m = pat.search(clean)
        if m:
            candidate = m.group(1).upper()
            # Avoid obvious words accidentally matched by fallback.
            if not candidate.isalpha() or candidate not in {"FLIGHT", "TRAVEL", "TICKET", "RECORD", "LOCATR", "NUMBER"}:
                locator = candidate
                break
    codes = AIRPORT.findall(clean)
    route = None
    if len(codes) >= 2:
        # Pick first two airport-looking codes; owner reviews before trip creation.
        route = f"{codes[0]} - {codes[1]}"
    paid = None
    m = MONEY.search(clean)
    if m:
        paid = float(m.group(1).replace(",", ""))
    travel_date = None
    for pat in DATE_PATTERNS:
        m = pat.search(clean)
        if m:
            travel_date = parse_date(m.group(1))
            if travel_date:
                break
    passenger = None
    for line in text.splitlines():
        m = re.search(r"(?:passenger|traveler|name)\s*[:#-]?\s*([A-Z][A-Za-z' -]+\s+[A-Z][A-Za-z' -]+)$", line.strip(), re.I)
        if m:
            passenger = m.group(1).strip()
            break
    fields = [airline, locator, route, paid, travel_date, passenger]
    confidence = round(sum(1 for x in fields if x) / len(fields), 2)
    return {
        "parsed_airline": airline,
        "parsed_confirmation_no": locator,
        "parsed_passenger_name": passenger,
        "parsed_route": route,
        "parsed_travel_date": travel_date,
        "parsed_paid": paid,
        "parser_confidence": confidence,
        "status": "Ready for review" if confidence >= 0.5 and locator else "Needs review",
    }

if __name__ == "__main__":
    text = Path(sys.argv[1]).read_text(errors="ignore") if len(sys.argv) > 1 else sys.stdin.read()
    print(json.dumps(parse(text), indent=2, sort_keys=True))
