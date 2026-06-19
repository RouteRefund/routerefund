# RouteRefund fare API setup

Initial provider: SerpAPI Google Flights (`engine=google_flights`).

## Why SerpAPI first

- Fastest path to automated fare checks for origin/destination/date.
- Returns structured prices from Google Flights-style results.
- Good enough for monitoring alerts; not final authority for rebooking.

## Required local secret

Store the API key on the Mac mini in Keychain, not in GitHub:

```bash
security add-generic-password -a routerefund -s routerefund_serpapi_key -w 'YOUR_SERPAPI_KEY'
```

DB connection is also stored in Keychain as `routerefund_db_url`.

## Scheduled job

Hermes cron job: `RouteRefund automated fare checks`

Script:

```bash
~/.hermes/scripts/routerefund_fare_search.sh
```

Runs every 6 hours. If no SerpAPI key exists, it reports due trips but does not change the database.

## Current behavior

For each due trip with route/date:

1. Query SerpAPI Google Flights for one-way fare using `departure_id`, `arrival_id`, and `outbound_date`.
2. Prefer same-airline results when available.
3. Write an audit row to `monitoring_checks`.
4. Update `trips.current_price`, `trips.status`, `last_checked_at`, and `next_check_at`.
5. Alert owner chat when output exists.

## Important limitations

- This does **not** rebook/cancel flights.
- Price result is a monitoring signal, not final rebooking authority.
- Rebooking/canceling needs owner approval, customer authorization, and airline-specific handling.
- Round-trip support should be added once the trip form captures return date.
