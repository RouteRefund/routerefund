# RouteRefund website

Upload these files to the GitHub repository root for RouteRefund.com:

- CNAME
- index.html
- signup.html
- login.html
- reset-password.html
- update-password.html
- dashboard.html
- owner-login.html
- owner.html
- styles.css
- config.js
- app.js
- README.md

Do not upload api_server.py or submissions.json.

Security notes:
- Customers sign up/log in through Supabase Auth.
- Customer trip access is controlled by Supabase Row Level Security.
- Owner dashboard only works safely after running `supabase-setup.sql` in Supabase and adding approved owner emails.
- Do not store card numbers in RouteRefund forms. Use Stripe for payment later.
