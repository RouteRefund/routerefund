# RouteRefund forwarded-confirmation parsing plan

Goal: make `trips@routerefund.com` the easiest customer path while keeping owner review before any flight is monitored or changed.

## Recommended pipeline

1. Customer forwards airline confirmation to `trips@routerefund.com`.
2. Email provider receives it in a dedicated inbox.
3. A parser job extracts likely fields:
   - airline
   - record locator / confirmation code
   - passenger name
   - route
   - departure date
   - amount paid
4. Parsed result is saved to `public.forwarded_confirmations` with status `Needs review` or `Ready for review`.
5. Owner dashboard shows the parsed confirmation.
6. Owner reviews, fixes fields, and creates the actual `trips` row.
7. Monitoring queue starts only after owner approval.

## Why not auto-create trips immediately?

Airline emails vary. A parser can confuse airport codes, prices, passenger names, or old itinerary changes. Owner review prevents bad monitoring and protects customer trust.

## Current repo pieces

- `scripts/parse_confirmation_email.py` — local heuristic parser. Reads raw email text and outputs JSON.
- `public.forwarded_confirmations` — owner-only staging table for parsed emails.
- `owner_trip_notes` and `monitoring_checks` stay owner-only.

## Best next provider choice

For easiest integration, use one of:

- Cloudflare Email Routing → Worker → Supabase insert
- Gmail / Google Workspace inbox → scheduled parser using Gmail API
- Make/Zapier as temporary glue → webhook/serverless endpoint

Given RouteRefund is already on Cloudflare and static hosting, Cloudflare Email Routing + Worker is the cleanest production path.

## Payment recommendation

Do not connect Stripe yet. Get the trip intake → parsing → owner review → monitoring → savings-found workflow reliable first.

A reasonable first pricing test is **30% of verified savings captured**, with no upfront charge. Keep the wording flexible until counsel/accounting review:

> RouteRefund charges a success fee only when eligible savings are captured. The fee is shown before billing.

When ready for Stripe, start with Stripe Payment Links or hosted Checkout for one-off success fees. Avoid in-site card collection.
