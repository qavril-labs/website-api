-- 0001_leads: public lead intake for the marketing site. Leads are not tenant data, so there is
-- no tenant_id and no row-level security. Grants for the application role are in db/roles/bootstrap.sql,
-- because the role is created per database, not by a migration.
-- Note: the interest list includes trial, which the site form offers. The table in the ERP
-- monolith did not include it, so trial sign-ups failed with a server error there.

CREATE TABLE leads (
  id              uuid PRIMARY KEY,
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email           text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  company         text CHECK (char_length(company) <= 160),
  country         text CHECK (char_length(country) <= 80),
  interest        text NOT NULL CHECK (interest IN ('early_access', 'demo', 'partner', 'trial')),
  industry        text CHECK (char_length(industry) <= 80),
  message         text CHECK (char_length(message) <= 1000),
  source          text NOT NULL DEFAULT 'direct' CHECK (char_length(source) <= 100),
  slot            text,
  timezone        text CHECK (char_length(timezone) <= 64),
  consent_given   boolean NOT NULL CHECK (consent_given),
  consent_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_email_idx ON leads (lower(email));
CREATE INDEX leads_created_idx ON leads (created_at DESC);
