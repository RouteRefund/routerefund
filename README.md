# RouteRefund MVP demo

Files to upload to GitHub Pages:
- `index.html` customer page
- `owner.html` owner dashboard
- `config.js` points the static site to the temporary demo API

Temporary API for MVP testing:
- `https://corps-shot-reported-com.trycloudflare.com`

Important: this API runs from Tomo's Mac through a temporary Cloudflare tunnel. It is good for demo testing, not production. Production should use Supabase/Firebase/Cloudflare Workers + D1 or a real backend with Stripe webhooks.
