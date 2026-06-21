# RouteRefund API onboarding tracker

RouteRefund needs two different API layers:

1. **Immediate/free enrichment** — already live.
2. **Official reservation/fare servicing access** — business onboarding required; no free universal PNR API exists for arbitrary customer direct bookings.

## Live now

### Airline manage-trip automation

- Status: active for American Airlines proof-of-concept.
- Purpose: customer submits airline + confirmation/locator + passenger name + DOB; worker attempts public manage-trip lookup.
- Current result: AA lookup can find a real reservation and populate route/date/flight.
- Limits: airline-by-airline, no CAPTCHA bypass, not an official API.

### Forwarded confirmation parsing

- Status: foundation live.
- Purpose: customer forwards confirmation email; parser extracts airline, locator, passenger, route/date, paid amount when visible.
- Best use: fallback/enrichment when manage-trip automation is blocked or incomplete.

### Free live enrichment APIs

- Status: live every 5 minutes for near-date trips with flight numbers.
- `adsb.lol`: live ADS-B/callsign visibility.
- `aviationweather.gov`: airport METAR weather.
- Limits: enriches known flights only; does not retrieve reservations.

## Official API targets

### American Airlines NDC / Global Sales

- Source: American Airlines Global Sales / NDC overview.
- Why: RouteRefund already has working AA lookup; official AA access would make this more durable.
- Likely requirement: agency/technology partner onboarding, commercial approval, certification or third-party NDC connection.
- Target use: reservation servicing/offer/fare/rebooking workflows after explicit customer authorization.
- Next action: prepare business profile and apply/contact via American Global Sales NDC channels.

### Duffel

- Source: Duffel Flights API / Orders API docs.
- Why: modern flight booking and order-management API; easier developer experience than direct airline integrations.
- Limit: best for bookings/orders created through Duffel, not random existing airline.com reservations.
- Target use: future RouteRefund-assisted booking/rebooking platform.
- Next action: create sandbox account, confirm whether any post-booking servicing can support RouteRefund workflow.

### Travelport

- Source: Travelport Reservation Retrieve / Ticket APIs.
- Why: real GDS/agency reservation retrieve and ticketing rails.
- Limit: generally retrieves bookings made inside Travelport/agency context, not arbitrary direct airline PNRs.
- Target use: future agency/host-agency model.
- Next action: evaluate host agency / Travelport access requirements.

### Sabre

- Why: major GDS with booking, PNR, NDC, ticketing, servicing APIs.
- Limit: onboarding and agency context required; not a free arbitrary PNR lookup.
- Target use: future agency/servicing model.
- Next action: evaluate Sabre Dev Studio + host agency route.

### Amadeus Enterprise

- Why: PNR/booking management APIs exist in enterprise channels.
- Limit: enterprise/agency context required; self-service APIs are not universal customer booking retrieval.
- Target use: future agency/servicing model.
- Next action: evaluate enterprise eligibility or aggregator access.

### FlightAware / Cirium / OAG

- Why: richer commercial flight status/schedule/disruption data than free ADS-B/weather.
- Limit: not PNR lookup; paid/commercial licensing.
- Target use: customer dashboard polish, delay/disruption monitoring, route validation.
- Next action: defer until customer volume justifies cost.

## Recommended execution order

1. Finish AA manage-trip parsing: departure time, better itinerary extraction, and clean failure states.
2. Add manage-trip adapters/fallback statuses for Southwest, JetBlue, Alaska, United, Delta where compliant.
3. Improve forwarded confirmation parser per airline templates.
4. Keep free live enrichment running every 5 minutes for near-date known flights.
5. Start official onboarding with AA NDC and Duffel sandbox first.
6. Evaluate host-agency/GDS path only after the product has repeat customer volume.

## Safety boundaries

- No airline passwords.
- No email inbox passwords.
- No one-time codes.
- No CAPTCHA/security bypass.
- No booking/cancel/rebook action without explicit customer authorization and partner approval.
- No exact savings exposed to customers until RouteRefund verifies and captures the value workflow.
