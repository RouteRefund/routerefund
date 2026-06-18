# RouteRefund demo

Local files:
- Customer page: `index.html`
- Owner dashboard: `owner.html`

Run locally:

```bash
cd /Users/tomo/flight_savings_ai_demo
python3 -m http.server 8765
```

Open:
- http://127.0.0.1:8765/index.html
- http://127.0.0.1:8765/owner.html

Demo notes:
- Customer page uses RouteRefund.com branding.
- No upfront fee language; success-fee commission only.
- Security copy says Stripe handles cards and customer approval is required before account-impacting actions.
- Owner dashboard buttons are clickable: approve, block, create Stripe link, add demo trip, run scan, open runbook, tabs, toggles, drawers.
