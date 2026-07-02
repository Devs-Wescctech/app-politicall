-- Additive attendance + integrations migration (idempotent).
-- Generated from shared/schema.ts. Safe to run repeatedly.
-- CREATE TABLE IF NOT EXISTS for new attendance tables; ADD COLUMN IF NOT EXISTS for additive columns.

CREATE TABLE IF NOT EXISTS "channel_connections" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "name" text NOT NULL,
  "channel" text NOT NULL,
  "provider" text DEFAULT 'wescctech' NOT NULL,
  "base_url" text DEFAULT 'https://api.wescctech.com.br',
  "token" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "last_tested_at" timestamp,
  "last_error" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "channel" text;
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "provider" text DEFAULT 'wescctech';
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "base_url" text DEFAULT 'https://api.wescctech.com.br';
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "token" text;
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending';
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "last_tested_at" timestamp;
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "last_error" text;
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
ALTER TABLE "channel_connections" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_sectors" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "channel" text,
  "is_default" boolean DEFAULT false,
  "active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_sectors" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_sectors" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_sectors" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "att_sectors" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "att_sectors" ADD COLUMN IF NOT EXISTS "channel" text;
ALTER TABLE "att_sectors" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false;
ALTER TABLE "att_sectors" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true;
ALTER TABLE "att_sectors" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
ALTER TABLE "att_sectors" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "sector_members" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "sector_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "account_id" varchar NOT NULL,
  "active" boolean DEFAULT true
);
ALTER TABLE "sector_members" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "sector_members" ADD COLUMN IF NOT EXISTS "sector_id" varchar;
ALTER TABLE "sector_members" ADD COLUMN IF NOT EXISTS "user_id" varchar;
ALTER TABLE "sector_members" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "sector_members" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true;

CREATE TABLE IF NOT EXISTS "att_queues" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "channel" text,
  "sector_id" varchar,
  "strategy" text DEFAULT 'manual' NOT NULL,
  "max_wait_minutes" integer DEFAULT 30,
  "priority" integer DEFAULT 0,
  "is_default" boolean DEFAULT false,
  "active" boolean DEFAULT true,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "channel" text;
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "sector_id" varchar;
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "strategy" text DEFAULT 'manual';
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "max_wait_minutes" integer DEFAULT 30;
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 0;
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false;
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true;
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
ALTER TABLE "att_queues" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_queue_members" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "queue_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_queue_members" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_queue_members" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_queue_members" ADD COLUMN IF NOT EXISTS "queue_id" varchar;
ALTER TABLE "att_queue_members" ADD COLUMN IF NOT EXISTS "user_id" varchar;
ALTER TABLE "att_queue_members" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true;
ALTER TABLE "att_queue_members" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_conversations" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "attendance_code" text,
  "contact_id" varchar,
  "connection_id" varchar,
  "channel" text DEFAULT 'whatsapp' NOT NULL,
  "provider" text,
  "external_thread_id" text,
  "external_contact_id" text,
  "contact_name" text,
  "contact_phone" text,
  "contact_email" text,
  "contact_avatar" text,
  "sector_id" varchar,
  "queue_id" varchar,
  "mode" text DEFAULT 'automatic' NOT NULL,
  "status" text DEFAULT 'automatic' NOT NULL,
  "status_changed_at" timestamp DEFAULT now() NOT NULL,
  "assigned_user_id" varchar,
  "assigned_at" timestamp,
  "assigned_by_user_id" varchar,
  "last_operator_activity_at" timestamp,
  "last_customer_activity_at" timestamp,
  "first_response_at" timestamp,
  "lock_expires_at" timestamp,
  "ai_enabled" boolean DEFAULT false,
  "priority" text DEFAULT 'normal',
  "sla_due_at" timestamp,
  "last_message_at" timestamp,
  "last_message_preview" text,
  "unread_count" integer DEFAULT 0,
  "resolved_at" timestamp,
  "closed_at" timestamp,
  "protocol" text,
  "summary" text,
  "sentiment" text,
  "tags" text[],
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "attendance_code" text;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "contact_id" varchar;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "connection_id" varchar;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "channel" text DEFAULT 'whatsapp';
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "provider" text;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "external_thread_id" text;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "external_contact_id" text;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "contact_name" text;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "contact_phone" text;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "contact_email" text;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "contact_avatar" text;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "sector_id" varchar;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "queue_id" varchar;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'automatic';
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'automatic';
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "status_changed_at" timestamp DEFAULT now();
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "assigned_user_id" varchar;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "assigned_at" timestamp;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "assigned_by_user_id" varchar;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "last_operator_activity_at" timestamp;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "last_customer_activity_at" timestamp;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "first_response_at" timestamp;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "lock_expires_at" timestamp;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "ai_enabled" boolean DEFAULT false;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'normal';
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "sla_due_at" timestamp;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "last_message_at" timestamp;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "last_message_preview" text;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "unread_count" integer DEFAULT 0;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "closed_at" timestamp;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "protocol" text;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "summary" text;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "sentiment" text;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "tags" text[];
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
ALTER TABLE "att_conversations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_messages" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "conversation_id" varchar NOT NULL,
  "contact_id" varchar,
  "user_id" varchar,
  "direction" text DEFAULT 'inbound' NOT NULL,
  "channel" text,
  "provider" text,
  "external_message_id" text,
  "body" text,
  "message_type" text DEFAULT 'text',
  "status" text DEFAULT 'received',
  "error_message" text,
  "ai_generated" boolean DEFAULT false,
  "media_url" text,
  "mime_type" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "conversation_id" varchar;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "contact_id" varchar;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "user_id" varchar;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "direction" text DEFAULT 'inbound';
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "channel" text;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "provider" text;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "external_message_id" text;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "body" text;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "message_type" text DEFAULT 'text';
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'received';
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "error_message" text;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "ai_generated" boolean DEFAULT false;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "media_url" text;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "mime_type" text;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE "att_messages" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_attachments" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "conversation_id" varchar NOT NULL,
  "message_id" varchar,
  "file_name" text NOT NULL,
  "mime_type" text,
  "size" integer,
  "url" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_attachments" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_attachments" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_attachments" ADD COLUMN IF NOT EXISTS "conversation_id" varchar;
ALTER TABLE "att_attachments" ADD COLUMN IF NOT EXISTS "message_id" varchar;
ALTER TABLE "att_attachments" ADD COLUMN IF NOT EXISTS "file_name" text;
ALTER TABLE "att_attachments" ADD COLUMN IF NOT EXISTS "mime_type" text;
ALTER TABLE "att_attachments" ADD COLUMN IF NOT EXISTS "size" integer;
ALTER TABLE "att_attachments" ADD COLUMN IF NOT EXISTS "url" text;
ALTER TABLE "att_attachments" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "quick_replies" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "user_id" varchar,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "channel" text,
  "attachment_url" text,
  "attachment_type" text,
  "attachment_name" text,
  "active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "user_id" varchar;
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "message" text;
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "channel" text;
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "attachment_url" text;
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "attachment_type" text;
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "attachment_name" text;
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true;
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_notes" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "conversation_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "note" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_notes" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_notes" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_notes" ADD COLUMN IF NOT EXISTS "conversation_id" varchar;
ALTER TABLE "att_notes" ADD COLUMN IF NOT EXISTS "user_id" varchar;
ALTER TABLE "att_notes" ADD COLUMN IF NOT EXISTS "note" text;
ALTER TABLE "att_notes" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_automation" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "connection_id" varchar,
  "welcome_enabled" boolean DEFAULT false,
  "welcome_message" text,
  "away_enabled" boolean DEFAULT false,
  "away_message" text,
  "inactivity_enabled" boolean DEFAULT false,
  "inactivity_minutes" integer DEFAULT 60,
  "inactivity_message" text,
  "keyword_rules" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "connection_id" varchar;
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "welcome_enabled" boolean DEFAULT false;
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "welcome_message" text;
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "away_enabled" boolean DEFAULT false;
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "away_message" text;
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "inactivity_enabled" boolean DEFAULT false;
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "inactivity_minutes" integer DEFAULT 60;
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "inactivity_message" text;
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "keyword_rules" jsonb;
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
ALTER TABLE "att_automation" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_labels" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT '#14b8a6' NOT NULL,
  "active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_labels" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_labels" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_labels" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "att_labels" ADD COLUMN IF NOT EXISTS "color" text DEFAULT '#14b8a6';
ALTER TABLE "att_labels" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true;
ALTER TABLE "att_labels" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
ALTER TABLE "att_labels" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_contact_labels" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "contact_id" varchar NOT NULL,
  "label_id" varchar NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_contact_labels" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_contact_labels" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_contact_labels" ADD COLUMN IF NOT EXISTS "contact_id" varchar;
ALTER TABLE "att_contact_labels" ADD COLUMN IF NOT EXISTS "label_id" varchar;
ALTER TABLE "att_contact_labels" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_conversation_labels" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "conversation_id" varchar NOT NULL,
  "label_id" varchar NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_conversation_labels" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_conversation_labels" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_conversation_labels" ADD COLUMN IF NOT EXISTS "conversation_id" varchar;
ALTER TABLE "att_conversation_labels" ADD COLUMN IF NOT EXISTS "label_id" varchar;
ALTER TABLE "att_conversation_labels" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_import_jobs" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "user_id" varchar,
  "type" text DEFAULT 'contacts' NOT NULL,
  "file_name" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "total_rows" integer DEFAULT 0,
  "processed_rows" integer DEFAULT 0,
  "imported_rows" integer DEFAULT 0,
  "updated_rows" integer DEFAULT 0,
  "failed_rows" integer DEFAULT 0,
  "mapping" jsonb,
  "errors" jsonb,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "user_id" varchar;
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'contacts';
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "file_name" text;
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending';
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "total_rows" integer DEFAULT 0;
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "processed_rows" integer DEFAULT 0;
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "imported_rows" integer DEFAULT 0;
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "updated_rows" integer DEFAULT 0;
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "failed_rows" integer DEFAULT 0;
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "mapping" jsonb;
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "errors" jsonb;
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
ALTER TABLE "att_import_jobs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "integration_logs" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "user_id" varchar,
  "service" text NOT NULL,
  "action" text NOT NULL,
  "status" text NOT NULL,
  "request" jsonb,
  "response" jsonb,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "integration_logs" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "integration_logs" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "integration_logs" ADD COLUMN IF NOT EXISTS "user_id" varchar;
ALTER TABLE "integration_logs" ADD COLUMN IF NOT EXISTS "service" text;
ALTER TABLE "integration_logs" ADD COLUMN IF NOT EXISTS "action" text;
ALTER TABLE "integration_logs" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE "integration_logs" ADD COLUMN IF NOT EXISTS "request" jsonb;
ALTER TABLE "integration_logs" ADD COLUMN IF NOT EXISTS "response" jsonb;
ALTER TABLE "integration_logs" ADD COLUMN IF NOT EXISTS "error" text;
ALTER TABLE "integration_logs" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_conversation_events" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "conversation_id" varchar,
  "message_id" varchar,
  "user_id" varchar,
  "action" text NOT NULL,
  "entity_type" text DEFAULT 'conversation' NOT NULL,
  "entity_id" varchar,
  "ip_address" text,
  "user_agent" text,
  "before" jsonb,
  "after" jsonb,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "conversation_id" varchar;
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "message_id" varchar;
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "user_id" varchar;
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "action" text;
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "entity_type" text DEFAULT 'conversation';
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "entity_id" varchar;
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "ip_address" text;
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "before" jsonb;
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "after" jsonb;
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE "att_conversation_events" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

CREATE TABLE IF NOT EXISTS "att_transfers" (
  "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY,
  "account_id" varchar NOT NULL,
  "conversation_id" varchar NOT NULL,
  "from_user_id" varchar,
  "to_user_id" varchar,
  "from_sector_id" varchar,
  "to_sector_id" varchar,
  "from_queue_id" varchar,
  "to_queue_id" varchar,
  "reason" text,
  "created_by_user_id" varchar,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "conversation_id" varchar;
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "from_user_id" varchar;
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "to_user_id" varchar;
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "from_sector_id" varchar;
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "to_sector_id" varchar;
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "from_queue_id" varchar;
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "to_queue_id" varchar;
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "created_by_user_id" varchar;
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE "att_transfers" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

-- Additive columns on pre-existing production tables (never destructive).
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "id" varchar DEFAULT gen_random_uuid();
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "account_id" varchar;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "user_id" varchar;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "service" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT false;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "sendgrid_api_key" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "from_email" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "from_name" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "twilio_account_sid" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "twilio_auth_token" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "twilio_phone_number" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "whatsapp_token" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "whatsapp_phone_number" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "whatsapp_business_account_id" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "whatsapp_webhook_url" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "sms_account" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "sms_code" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "sms_client" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "sms_endpoint" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "sms_tipo_envio" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "smtp_host" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "smtp_port" integer;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "smtp_user" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "smtp_password" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "smtp_security" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "imap_host" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "imap_port" integer;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "imap_user" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "imap_password" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "imap_security" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "locaweb_base_url" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "locaweb_account_id" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "locaweb_api_key" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "locaweb_auth_header" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "locaweb_auth_scheme" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "test_mode" boolean DEFAULT false;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();
