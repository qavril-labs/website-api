# website-api

The public lead endpoint for the marketing site (qavrillabs.com). It accepts the site's contact and demo forms, stores each lead once, and notifies the team. It has no ERP logic and no tenant data.

- Endpoint: `POST /v1/public/leads`, form contract in `contract/lead-form.contract.json`.
- Storage: table `leads` (migration `db/migrations/0001_leads.sql`). The application role may only insert.
- Protection: per-IP rate limit (5 accepted submissions per 10 minutes), a honeypot field, and a CORS allowlist (`CORS_ORIGINS`).
- Optional: `LEAD_WEBHOOK_URL` receives each stored lead.

Run locally with `npm ci`, then `npm run dev`. Without `DATABASE_URL` it keeps leads in memory for development. In production, `DATABASE_URL` is required.
