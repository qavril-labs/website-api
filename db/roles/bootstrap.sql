-- Run ONCE per Neon project, as the project owner, before the first migration.
-- Passwords are never written here. Pass them at run time, for example:
--   psql "$OWNER_URL" -v website_api_app_password="$APP_PASSWORD" -f db/roles/bootstrap.sql
-- Store the application connection string in AWS Secrets Manager, not in this repository.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'website_api_app') THEN
    CREATE ROLE website_api_app LOGIN NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE website_api_app PASSWORD :'website_api_app_password';

-- Leads: the public form inserts, and the admin reads the list and counts. Nothing else.
GRANT SELECT, INSERT ON leads TO website_api_app;

-- CMS: the admin edits content. The public reads it through the same role.
GRANT SELECT, INSERT, UPDATE, DELETE ON cms_settings, cms_pages, cms_articles, cms_faqs TO website_api_app;
