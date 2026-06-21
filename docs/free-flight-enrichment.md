# Free flight enrichment APIs

RouteRefund now has a free/no-key enrichment layer for trips that already have safe itinerary basics (flight number and, ideally, route/date).

## Providers

### adsb.lol

- Endpoint used: `https://api.adsb.lol/v2/callsign/{callsign}`
- Cost/key: free, no API key currently required
- Purpose: checks whether a flight callsign such as `AAL981` is currently visible in ADS-B data.
- Useful for: live airborne/seen/not-airborne status near travel day.
- Not useful for: retrieving a private reservation, fare paid, ticket rules, passenger data, or confirmation-number lookup.

### AviationWeather.gov

- Endpoint used: `https://aviationweather.gov/api/data/metar?ids=KDFW,KGRR&format=json`
- Cost/key: free, no API key required
- Purpose: airport weather/METAR for known origin/destination airports.
- Useful for: live trip context once route airports are known.
- Not useful for: PNR lookup, fare monitoring, airline reservation changes, or customer identity verification.

## Worker

Script: `scripts/free_flight_enrichment.py`

Local cron wrapper: `~/.hermes/scripts/routerefund_free_flight_enrichment.sh`

Scheduler: `RouteRefund free flight enrichment`, every 5 minutes, local-only delivery.

The worker only selects active trips with `flight_no` where `travel_date` is today, yesterday, tomorrow, or unknown. It stores owner-only rows in `public.flight_status_checks`, and the partner trip workspace shows the latest ADS-B/weather results.

## Safety boundaries

This layer does **not**:

- retrieve bookings from confirmation numbers
- access airline accounts
- use passwords or one-time codes
- run SerpAPI/fare checks
- cancel/rebook/change reservations
- expose exact savings to customers

It is an enrichment layer after lookup/parsing has already identified the flight.

## Recommended next API work

For actual confirmation-number reservation lookup, continue airline-by-airline manage-trip automation and forwarded confirmation parsing. Official API access would require airline NDC/GDS/agency onboarding; there is no free universal PNR API for arbitrary customer direct bookings.
