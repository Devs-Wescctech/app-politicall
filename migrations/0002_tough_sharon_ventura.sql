CREATE TABLE "accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" varchar NOT NULL,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"status_code" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"key_prefix" text NOT NULL,
	"hashed_key" text NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_hashed_key_unique" UNIQUE("hashed_key")
);
--> statement-breakpoint
CREATE TABLE "contact_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"account_id" varchar NOT NULL,
	"user_id" varchar,
	"activity_type" varchar NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_operatives" (
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
--> statement-breakpoint
CREATE TABLE "google_calendar_integrations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_integrations_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
ALTER TABLE "survey_campaigns" ALTER COLUMN "status" SET DEFAULT 'approved';--> statement-breakpoint
ALTER TABLE "survey_campaigns" ALTER COLUMN "campaign_stage" SET DEFAULT 'aprovado';--> statement-breakpoint
ALTER TABLE "ai_configurations" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_configurations" ADD COLUMN "facebook_automation_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ai_configurations" ADD COLUMN "instagram_webhook_verify_token" text;--> statement-breakpoint
ALTER TABLE "ai_configurations" ADD COLUMN "instagram_automation_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_response_templates" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_training_examples" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "normalized_name" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "age" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "field_operative_id" varchar;--> statement-breakpoint
ALTER TABLE "demand_comments" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "demands" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "google_meet_link" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "political_alliances" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_campaigns" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_campaigns" ADD COLUMN "custom_main_question" text;--> statement-breakpoint
ALTER TABLE "survey_campaigns" ADD COLUMN "custom_main_question_type" text;--> statement-breakpoint
ALTER TABLE "survey_campaigns" ADD COLUMN "custom_main_question_options" jsonb;--> statement-breakpoint
ALTER TABLE "survey_campaigns" ADD COLUMN "custom_questions" jsonb;--> statement-breakpoint
ALTER TABLE "survey_landing_pages" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "landing_background" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "volunteer_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "election_number" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_status" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_payment_date" text;--> statement-breakpoint
ALTER TABLE "api_key_usage" ADD CONSTRAINT "api_key_usage_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_operatives" ADD CONSTRAINT "field_operatives_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_integrations" ADD CONSTRAINT "google_calendar_integrations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_integrations" ADD CONSTRAINT "google_calendar_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_configurations" ADD CONSTRAINT "ai_configurations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_response_templates" ADD CONSTRAINT "ai_response_templates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_training_examples" ADD CONSTRAINT "ai_training_examples_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_field_operative_id_field_operatives_id_fk" FOREIGN KEY ("field_operative_id") REFERENCES "public"."field_operatives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_comments" ADD CONSTRAINT "demand_comments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demands" ADD CONSTRAINT "demands_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "political_alliances" ADD CONSTRAINT "political_alliances_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_campaigns" ADD CONSTRAINT "survey_campaigns_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_landing_pages" ADD CONSTRAINT "survey_landing_pages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_volunteer_code_unique" UNIQUE("volunteer_code");