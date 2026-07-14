-- PetiçõesBR module schema.
-- Additive/idempotent migration for existing databases that were created before
-- the module was folded into Politicall. Rollback requires dropping dependent
-- public pages, logs, campaigns, signatures, templates, then petitions.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS petitions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  banner_url text,
  logo_url text,
  video_url text,
  primary_color text DEFAULT '#6366f1',
  share_text text,
  goal integer DEFAULT 1 NOT NULL,
  status text DEFAULT 'rascunho' NOT NULL,
  slug text NOT NULL,
  collect_phone boolean DEFAULT false,
  collect_city boolean DEFAULT true,
  collect_state boolean DEFAULT false,
  collect_cpf boolean DEFAULT false,
  collect_email boolean DEFAULT false,
  collect_comment boolean DEFAULT true,
  require_email boolean DEFAULT false,
  require_phone boolean DEFAULT false,
  require_location boolean DEFAULT false,
  require_cpf boolean DEFAULT false,
  require_comment boolean DEFAULT false,
  lgpd_text text,
  views_count integer DEFAULT 0 NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS petition_signatures (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  petition_id varchar NOT NULL REFERENCES petitions(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  city text,
  state text,
  cpf text,
  comment text,
  ip_address text,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS petition_campaigns (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'rascunho' NOT NULL,
  petition_id varchar REFERENCES petitions(id) ON DELETE SET NULL,
  target_petitions text[],
  target_filters jsonb DEFAULT '{}'::jsonb,
  message text NOT NULL,
  subject text,
  sender_email text,
  sender_name text,
  scheduled_date timestamp,
  sent_count integer DEFAULT 0 NOT NULL,
  success_count integer DEFAULT 0 NOT NULL,
  failed_count integer DEFAULT 0 NOT NULL,
  total_recipients integer DEFAULT 0 NOT NULL,
  api_token text,
  delay_seconds integer DEFAULT 3 NOT NULL,
  messages_per_hour integer DEFAULT 20 NOT NULL,
  avoid_night_hours boolean DEFAULT true NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS petition_campaign_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  campaign_id varchar NOT NULL REFERENCES petition_campaigns(id) ON DELETE CASCADE,
  recipient_name text NOT NULL,
  recipient_contact text NOT NULL,
  status text NOT NULL,
  response_status text,
  response_body text,
  error_message text,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS petition_message_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  subject text,
  content text NOT NULL,
  is_default boolean DEFAULT false,
  thumbnail_url text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS linkbio_pages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  avatar_url text,
  background_color text DEFAULT '#6366f1',
  status text DEFAULT 'rascunho' NOT NULL,
  petition_ids text[],
  views_count integer DEFAULT 0 NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS linktree_pages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id varchar NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  avatar_url text,
  background_color text DEFAULT '#ffffff',
  text_color text DEFAULT '#000000',
  links jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'rascunho' NOT NULL,
  views_count integer DEFAULT 0 NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS petitions_slug_uidx ON petitions(slug);
CREATE UNIQUE INDEX IF NOT EXISTS linkbio_pages_slug_uidx ON linkbio_pages(slug);
CREATE UNIQUE INDEX IF NOT EXISTS linktree_pages_slug_uidx ON linktree_pages(slug);

CREATE INDEX IF NOT EXISTS petitions_account_status_idx ON petitions(account_id, status);
CREATE INDEX IF NOT EXISTS petitions_account_created_idx ON petitions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS petition_signatures_petition_idx ON petition_signatures(petition_id, created_at DESC);
CREATE INDEX IF NOT EXISTS petition_signatures_petition_email_idx ON petition_signatures(petition_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS petition_signatures_petition_cpf_idx ON petition_signatures(petition_id, cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS petition_campaigns_account_status_idx ON petition_campaigns(account_id, status);
CREATE INDEX IF NOT EXISTS petition_campaign_logs_campaign_idx ON petition_campaign_logs(account_id, campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS petition_message_templates_account_idx ON petition_message_templates(account_id, type);
CREATE INDEX IF NOT EXISTS linkbio_pages_account_status_idx ON linkbio_pages(account_id, status);
CREATE INDEX IF NOT EXISTS linktree_pages_account_status_idx ON linktree_pages(account_id, status);
