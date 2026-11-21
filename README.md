# website-api

The public lead endpoint for the marketing site (qavrillabs.com). It accepts the site's contact and demo forms, stores each lead once, and notifies the team. It has no ERP logic and no tenant data.

- Endpoint: `POST /v1/public/leads`, form contract in `contract/lead-form.contract.json`.
- Storage: table `leads` (migration `db/migrations/0001_leads.sql`). The application role may only insert.
- Protection: per-IP rate limit (5 accepted submissions per 10 minutes), a honeypot field, and a CORS allowlist (`CORS_ORIGINS`).
- Optional: `LEAD_WEBHOOK_URL` receives each stored lead.

## Content (CMS)

The site's content lives here too: settings, pages, articles (blog, case studies, news) and FAQs (tables `cms_*`, migration `0002_cms.sql`).

- Public reads (no login): `GET /v1/public/cms/settings`, `/pages`, `/pages/:slug`, `/articles`, `/articles/:slug`, `/faqs`. Only published content is returned.
- Admin (needs the admin key, sent as `x-admin-key` or `Authorization: Bearer`): login check at `POST /v1/admin/cms/auth/verify`, then the create, edit and delete routes, plus `GET /v1/admin/cms/leads` and `GET /v1/admin/cms/overview`.
- `ADMIN_KEY` is required in production (32+ characters). It is a single shared key for now, the same model the admin page already uses. Per-user accounts are the next step.
- Response shapes match what the site and its admin page already read.

Run locally with `npm ci`, then `npm run dev`. Without `DATABASE_URL` it keeps leads and content in memory for development. In production, `DATABASE_URL` and `ADMIN_KEY` are required.
