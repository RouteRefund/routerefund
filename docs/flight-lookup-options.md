# Flight lookup options

Goal: user enters only confirmation/record locator, first name, last name, and DOB; RouteRefund fills airline, route, departure date/time, and fare details.

## Reality check

There is no universal public consumer API that reliably retrieves every airline reservation from just confirmation number + passenger identity. Airline “manage trip” pages can do this, but automating them may hit bot protection/CAPTCHA, airline terms, and inconsistent flows.

## Best implementation path

1. **Forwarded confirmation parsing (best first path)**
   - Ask/encourage users to forward the confirmation email.
   - Parse airline, route, date/time, passenger, confirmation, cabin, fare from the email.
   - This is reliable, cheap, and avoids scraping airline manage-trip pages.

2. **Manual lookup intake fallback**
   - Customer enters confirmation + first/last name + DOB.
   - Trip appears immediately as `Intake review` / “Finding flight details.”
   - Partner ops can fill airline/route/date/time after review.

3. **Provider/API partnerships later**
   - Explore GDS/PNR providers such as Sabre/Amadeus only if RouteRefund has enough volume and compliance needs.
   - These are usually business/partner integrations, not simple public API keys.

4. **Airline site automation only with caution**
   - Potentially possible airline-by-airline, but expect CAPTCHA, bot detection, changing markup, and legal/ToS concerns.
   - Never ask for or store airline passwords.

## Product stance

Customer-facing copy should say: “Enter the basics and RouteRefund will identify flight details,” not “instant airline lookup,” until a real provider is connected and reliable.
