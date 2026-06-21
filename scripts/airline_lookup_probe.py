#!/usr/bin/env python3
"""Airline manage-trip lookup probe for RouteRefund.

Purpose:
- Drive public airline manage-trip pages with confirmation code + passenger name.
- Extract visible itinerary details when the airline page allows it.
- Do NOT bypass CAPTCHA, bot protection, login walls, or MFA.
- Do NOT store airline passwords, payment card data, or sensitive screenshots.

This is a probe/framework, not yet a production background job.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass, asdict
from typing import Callable, Optional

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
except Exception as exc:  # pragma: no cover
    print(json.dumps({"ok": False, "error": f"playwright unavailable: {exc}"}))
    raise SystemExit(2)


@dataclass
class LookupInput:
    airline: str
    confirmation: str
    first_name: str = ""
    last_name: str = ""
    date_of_birth: str = ""


@dataclass
class LookupResult:
    ok: bool
    airline: str
    status: str
    url: str = ""
    title: str = ""
    route: str = ""
    travel_date: str = ""
    departure_time: str = ""
    raw_excerpt: str = ""
    error: str = ""


@dataclass
class AirlineAdapter:
    key: str
    name: str
    url: str
    required: tuple[str, ...]
    fill: Callable


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def maybe_click(page, selectors: list[str]) -> bool:
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if loc.count() and loc.is_visible(timeout=1200):
                loc.click(timeout=2500)
                return True
        except Exception:
            continue
    return False


def fill_first_visible(page, selectors: list[str], value: str) -> bool:
    if not value:
        return False
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if loc.count() and loc.is_visible(timeout=1800):
                loc.fill(value, timeout=2500)
                return True
        except Exception:
            continue
    return False


def set_custom_input(page, selector: str, value: str) -> bool:
    """Set either normal inputs or AA/airline web-component inputs."""
    try:
        return bool(page.evaluate(
            """({selector,value}) => {
                const el = document.querySelector(selector);
                if (!el) return false;
                const input = el.shadowRoot?.querySelector('input') || el.querySelector?.('input') || el;
                input.value = value;
                input.dispatchEvent(new Event('input', {bubbles:true, composed:true}));
                input.dispatchEvent(new Event('change', {bubbles:true, composed:true}));
                el.value = value;
                el.dispatchEvent(new Event('input', {bubbles:true, composed:true}));
                el.dispatchEvent(new Event('change', {bubbles:true, composed:true}));
                return true;
            }""",
            {"selector": selector, "value": value},
        ))
    except Exception:
        return False


def set_custom_select(page, selector: str, value: str) -> bool:
    try:
        return bool(page.evaluate(
            """({selector,value}) => {
                const el = document.querySelector(selector);
                if (!el) return false;
                const select = el.shadowRoot?.querySelector('select') || el.querySelector?.('select');
                if (select) {
                  select.value = value;
                  select.dispatchEvent(new Event('input', {bubbles:true, composed:true}));
                  select.dispatchEvent(new Event('change', {bubbles:true, composed:true}));
                }
                el.value = value;
                el.setAttribute('value', value);
                el.dispatchEvent(new Event('input', {bubbles:true, composed:true}));
                el.dispatchEvent(new Event('change', {bubbles:true, composed:true}));
                return true;
            }""",
            {"selector": selector, "value": value},
        ))
    except Exception:
        return False


def split_dob(value: str) -> tuple[str, str, str]:
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", value or "")
    if not m:
        return "", "", ""
    return m.group(2), m.group(3), m.group(1)


def detect_blockers(text: str) -> str:
    low = text.lower()
    if "our system is having trouble" in low or "please try again or come back later" in low:
        return "blocked_or_unavailable"
    if "captcha" in low or "verify you are human" in low or "security check" in low:
        return "blocked_by_captcha_or_security_check"
    if "access denied" in low or "temporarily unavailable" in low:
        return "blocked_or_unavailable"
    if "not found" in low or "unable to find" in low or "can't find" in low or "cannot find" in low:
        return "reservation_not_found"
    return ""


def extract_basic(page, adapter: AirlineAdapter, timeout_ms: int = 12000) -> LookupResult:
    start = time.time()
    last_text = ""
    while (time.time() - start) * 1000 < timeout_ms:
        try:
            text = clean_text(page.locator("body").inner_text(timeout=2500))
            last_text = text
            blocker = detect_blockers(text)
            if blocker:
                return LookupResult(False, adapter.name, blocker, page.url, page.title(), raw_excerpt=text[:800])
            # Do not treat the initial lookup form as a successful reservation result.
            if "Enter the 6-letter confirmation code" in text and "find-your-reservation" in page.url:
                page.wait_for_timeout(800)
                continue
            # Heuristic success: itinerary pages generally expose airport names/codes, date/time, or trip management words after the lookup form is gone.
            if re.search(r"\b(Depart|Departure|Arriv|Flight|Itinerary|Seats|Check in|Change trip|Cancel trip)\b", text, re.I) and len(text) > 300:
                return LookupResult(True, adapter.name, "page_loaded_needs_parser", page.url, page.title(), raw_excerpt=text[:1200])
        except Exception:
            pass
        page.wait_for_timeout(800)
    return LookupResult(False, adapter.name, "timeout_or_no_result", page.url, page.title(), raw_excerpt=last_text[:800])


def fill_american(page, data: LookupInput):
    page.goto("https://www.aa.com/reservation/view/find-your-reservation", wait_until="domcontentloaded", timeout=45000)
    page.wait_for_selector("adc-text-input#lastNameSecure input", timeout=20000)
    month, day, year = split_dob(data.date_of_birth)
    page.locator("adc-text-input#lastNameSecure input").fill(data.last_name, timeout=5000)
    page.locator("adc-select#fytMonth select").select_option(month, timeout=5000)
    page.locator("adc-select#fytDay select").select_option(day, timeout=5000)
    page.locator("adc-select#fytYear select").select_option(year, timeout=5000)
    page.locator("adc-text-input#recordLocatorSecure input").fill(data.confirmation, timeout=5000)
    page.locator("adc-button#submit button").click(timeout=5000)
    page.wait_for_timeout(4500)


def fill_united(page, data: LookupInput):
    page.goto("https://www.united.com/en/us/manageres/mytrips", wait_until="domcontentloaded", timeout=45000)
    fill_first_visible(page, ["input[name*='confirmation' i]", "input[id*='confirmation' i]", "input[aria-label*='confirmation' i]"], data.confirmation)
    fill_first_visible(page, ["input[name*='last' i]", "input[id*='last' i]", "input[aria-label*='last name' i]"], data.last_name)
    maybe_click(page, ["button:has-text('Find')", "button:has-text('Search')", "button[type=submit]"])


def fill_delta(page, data: LookupInput):
    page.goto("https://www.delta.com/my-trips/search", wait_until="domcontentloaded", timeout=45000)
    fill_first_visible(page, ["input[name*='first' i]", "input[id*='first' i]", "input[aria-label*='first name' i]"], data.first_name)
    fill_first_visible(page, ["input[name*='last' i]", "input[id*='last' i]", "input[aria-label*='last name' i]"], data.last_name)
    fill_first_visible(page, ["input[name*='confirmation' i]", "input[id*='confirmation' i]", "input[aria-label*='confirmation' i]"], data.confirmation)
    maybe_click(page, ["button:has-text('Find')", "button:has-text('Search')", "button[type=submit]"])


ADAPTERS = {
    "american": AirlineAdapter("american", "American Airlines", "https://www.aa.com/reservation/view/find-your-reservation", ("confirmation", "last_name", "date_of_birth"), fill_american),
    "aa": AirlineAdapter("american", "American Airlines", "https://www.aa.com/reservation/view/find-your-reservation", ("confirmation", "last_name", "date_of_birth"), fill_american),
    "united": AirlineAdapter("united", "United Airlines", "https://www.united.com/en/us/manageres/mytrips", ("confirmation", "last_name"), fill_united),
    "delta": AirlineAdapter("delta", "Delta Air Lines", "https://www.delta.com/my-trips/search", ("confirmation", "first_name", "last_name"), fill_delta),
}


def run_lookup(data: LookupInput, headless: bool = True) -> LookupResult:
    adapter = ADAPTERS.get(data.airline.lower())
    if not adapter:
        return LookupResult(False, data.airline, "unsupported_airline", error=f"Supported: {', '.join(sorted(set(ADAPTERS)))}")
    missing = [field for field in adapter.required if not getattr(data, field)]
    if missing:
        return LookupResult(False, adapter.name, "missing_required_fields", adapter.url, error=", ".join(missing))
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(locale="en-US", timezone_id="America/New_York")
        page = context.new_page()
        try:
            adapter.fill(page, data)
            result = extract_basic(page, adapter)
            return result
        except PlaywrightTimeoutError as exc:
            return LookupResult(False, adapter.name, "timeout", page.url if 'page' in locals() else adapter.url, error=str(exc))
        except Exception as exc:
            return LookupResult(False, adapter.name, "error", page.url if 'page' in locals() else adapter.url, error=str(exc))
        finally:
            context.close()
            browser.close()


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--airline", required=True, help="american|united|delta")
    ap.add_argument("--confirmation", required=True)
    ap.add_argument("--first-name", default="")
    ap.add_argument("--last-name", required=True)
    ap.add_argument("--date-of-birth", default="")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args(argv)
    result = run_lookup(LookupInput(args.airline, args.confirmation.strip().upper(), args.first_name.strip(), args.last_name.strip(), args.date_of_birth.strip()), headless=not args.headed)
    print(json.dumps(asdict(result), indent=2))
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
