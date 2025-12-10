-- ============================================================================
-- POLITICALL - Script de Sincronização de Banco de Dados de Produção
-- ============================================================================
-- Execute este script no banco de produção para adicionar todas as
-- tabelas e colunas que podem estar faltando.
-- ============================================================================

-- 1. Tabela de Contas (accounts) - Multi-tenant
CREATE TABLE IF NOT EXISTS "accounts" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- 2. Tabela de Cabos Eleitorais (field_operatives)
CREATE TABLE IF NOT EXISTS "field_operatives" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "account_id" varchar NOT NULL,
    "name" text NOT NULL,
    "slug" text NOT NULL,
    "avatar_url" text,
    "cover_image_url" text,
    "phone" text,
    "email" text,
    "notes" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- 3. Tabela de Atividades de Contatos (contact_activities) - Timeline
CREATE TABLE IF NOT EXISTS "contact_activities" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "contact_id" varchar NOT NULL,
    "account_id" varchar NOT NULL,
    "user_id" varchar,
    "activity_type" varchar NOT NULL,
    "description" text NOT NULL,
    "metadata" jsonb,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- 4. Tabela de Chaves de API (api_keys)
CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "account_id" varchar NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "key_prefix" text NOT NULL,
    "hashed_key" text NOT NULL UNIQUE,
    "last_used_at" timestamp,
    "expires_at" timestamp,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- 5. Tabela de Uso de Chaves de API (api_key_usage)
CREATE TABLE IF NOT EXISTS "api_key_usage" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "api_key_id" varchar NOT NULL,
    "endpoint" text NOT NULL,
    "method" text NOT NULL,
    "ip_address" text,
    "user_agent" text,
    "status_code" integer,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- 6. Tabela de Integração com Google Calendar
CREATE TABLE IF NOT EXISTS "google_calendar_integrations" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "account_id" varchar NOT NULL UNIQUE,
    "user_id" varchar NOT NULL,
    "client_id" text,
    "client_secret" text,
    "redirect_uri" text,
    "access_token" text,
    "refresh_token" text,
    "token_expiry_date" timestamp,
    "email" text,
    "calendar_id" text,
    "sync_enabled" boolean DEFAULT true NOT NULL,
    "last_sync_at" timestamp,
    "sync_direction" text DEFAULT 'both' NOT NULL,
    "auto_create_meet" boolean DEFAULT false NOT NULL,
    "sync_reminders" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================================
-- COLUNAS ADICIONAIS EM TABELAS EXISTENTES
-- ============================================================================

-- Colunas adicionais na tabela users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "landing_background" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "slug" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "volunteer_code" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "election_number" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payment_status" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_payment_date" text;

-- Colunas adicionais na tabela contacts
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "normalized_name" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "age" integer;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "gender" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "field_operative_id" varchar;

-- Colunas adicionais na tabela events
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "google_event_id" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "google_meet_link" text;

-- Colunas adicionais na tabela demands
ALTER TABLE "demands" ADD COLUMN IF NOT EXISTS "account_id" varchar;

-- Colunas adicionais na tabela demand_comments
ALTER TABLE "demand_comments" ADD COLUMN IF NOT EXISTS "account_id" varchar;

-- Colunas adicionais na tabela political_alliances
ALTER TABLE "political_alliances" ADD COLUMN IF NOT EXISTS "account_id" varchar;

-- Colunas adicionais na tabela marketing_campaigns
ALTER TABLE "marketing_campaigns" ADD COLUMN IF NOT EXISTS "account_id" varchar;

-- Colunas adicionais na tabela notifications
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "account_id" varchar;

-- Colunas adicionais na tabela integrations
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "account_id" varchar;

-- Colunas adicionais na tabela ai_configurations
ALTER TABLE "ai_configurations" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "ai_configurations" ADD COLUMN IF NOT EXISTS "facebook_automation_enabled" boolean DEFAULT false;
ALTER TABLE "ai_configurations" ADD COLUMN IF NOT EXISTS "instagram_webhook_verify_token" text;
ALTER TABLE "ai_configurations" ADD COLUMN IF NOT EXISTS "instagram_automation_enabled" boolean DEFAULT false;

-- Colunas adicionais na tabela ai_conversations
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "account_id" varchar;

-- Colunas adicionais na tabela ai_response_templates
ALTER TABLE "ai_response_templates" ADD COLUMN IF NOT EXISTS "account_id" varchar;

-- Colunas adicionais na tabela ai_training_examples
ALTER TABLE "ai_training_examples" ADD COLUMN IF NOT EXISTS "account_id" varchar;

-- Colunas adicionais na tabela survey_campaigns
ALTER TABLE "survey_campaigns" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "survey_campaigns" ADD COLUMN IF NOT EXISTS "custom_main_question" text;
ALTER TABLE "survey_campaigns" ADD COLUMN IF NOT EXISTS "custom_main_question_type" text;
ALTER TABLE "survey_campaigns" ADD COLUMN IF NOT EXISTS "custom_main_question_options" jsonb;
ALTER TABLE "survey_campaigns" ADD COLUMN IF NOT EXISTS "custom_questions" jsonb;

-- Colunas adicionais na tabela survey_landing_pages
ALTER TABLE "survey_landing_pages" ADD COLUMN IF NOT EXISTS "account_id" varchar;

-- Colunas adicionais na tabela survey_responses
ALTER TABLE "survey_responses" ADD COLUMN IF NOT EXISTS "account_id" varchar;

-- ============================================================================
-- FOREIGN KEYS (executar apenas se as tabelas existem)
-- ============================================================================

-- Foreign keys para field_operatives
DO $$ BEGIN
    ALTER TABLE "field_operatives" ADD CONSTRAINT "field_operatives_account_id_accounts_id_fk" 
        FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Foreign keys para contact_activities
DO $$ BEGIN
    ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_contact_id_contacts_id_fk" 
        FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_account_id_accounts_id_fk" 
        FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_user_id_users_id_fk" 
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Foreign keys para contacts (field_operative_id)
DO $$ BEGIN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_field_operative_id_field_operatives_id_fk" 
        FOREIGN KEY ("field_operative_id") REFERENCES "field_operatives"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Foreign keys para api_keys
DO $$ BEGIN
    ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_account_id_accounts_id_fk" 
        FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Foreign keys para api_key_usage
DO $$ BEGIN
    ALTER TABLE "api_key_usage" ADD CONSTRAINT "api_key_usage_api_key_id_api_keys_id_fk" 
        FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Foreign keys para google_calendar_integrations
DO $$ BEGIN
    ALTER TABLE "google_calendar_integrations" ADD CONSTRAINT "google_calendar_integrations_account_id_accounts_id_fk" 
        FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "google_calendar_integrations" ADD CONSTRAINT "google_calendar_integrations_user_id_users_id_fk" 
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- CONSTRAINTS ÚNICOS
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE "users" ADD CONSTRAINT "users_slug_unique" UNIQUE("slug");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "users" ADD CONSTRAINT "users_volunteer_code_unique" UNIQUE("volunteer_code");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
SELECT 'Migração concluída com sucesso!' as resultado;
