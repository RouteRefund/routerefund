# Airline manage-trip automation plan

Goal: customer enters confirmation/record locator + first name + last name + DOB; RouteRefund automatically pulls itinerary details where airlines allow public manage-trip lookup.

## Why this can work

Major airline sites expose manage-trip pages that accept some combination of:
- confirmation/record locator or ticket number
- last name
- first name for some airlines
- date of birth for some airlines, e.g. American Airlines currently asks for DOB

This is the same thing a human would do manually.

## Why it is not one universal AI lookup

AI cannot read private airline reservation databases by itself. It needs a source:
- airline manage-trip pages
- forwarded confirmation emails
- GDS/PNR provider access
- airline/travel-agency APIs

The practical near-term route is airline-by-airline browser automation with fallbacks.

## Current framework

`scripts/airline_lookup_probe.py`

Current adapters:
- American Airlines: confirmation + last name + DOB
- United Airlines: confirmation + last name
- Delta Air Lines: confirmation + first name + last name

Current status:
- Playwright installed locally.
- American Airlines form fields were identified and can be populated (`lastNameSecure`, DOB selects, `recordLocatorSecure`).
- AA custom submit requires additional event handling before production use.
- Fake-data probes must not be treated as success; success detection now avoids counting the blank lookup form.

## Production rules

- Do not bypass CAPTCHA or security challenges.
- Do not store airline passwords.
- Do not store payment card numbers.
- Treat airline automation as best-effort; if blocked, fall back to forwarded confirmation parsing or partner review.
- Log only non-sensitive status/outcome data.

## Next engineering steps

1. Finish AA submit handling using the web component’s real event path.
2. Add parsers for itinerary result pages: airline, route, date, time, fare if visible.
3. Test United and Delta fake-data flows for blocker/validation behavior.
4. Add `airline_lookup_attempts` table for internal status tracking.
5. Connect lookup worker to `trips` rows in `Intake review`.
6. Update partner ops to show lookup outcome: found, not found, blocked, needs forwarded confirmation.
