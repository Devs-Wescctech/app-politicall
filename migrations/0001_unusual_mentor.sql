CREATE TABLE "integrations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"service" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"sendgrid_api_key" text,
	"from_email" text,
	"from_name" text,
	"twilio_account_sid" text,
	"twilio_auth_token" text,
	"twilio_phone_number" text,
	"test_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"position" text NOT NULL,
	"state" text NOT NULL,
	"city" text NOT NULL,
	"message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"template_id" varchar NOT NULL,
	"campaign_name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'under_review' NOT NULL,
	"campaign_stage" text DEFAULT 'aguardando' NOT NULL,
	"production_start_date" timestamp,
	"admin_reviewer_id" varchar,
	"admin_notes" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"region" text,
	"target_audience" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "survey_campaigns_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "survey_landing_pages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"html_content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "survey_landing_pages_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"response_data" jsonb NOT NULL,
	"gender" text NOT NULL,
	"age_range" text NOT NULL,
	"employment_type" text NOT NULL,
	"housing_type" text NOT NULL,
	"has_children" text NOT NULL,
	"political_ideology" text NOT NULL,
	"respondent_ip" text,
	"respondent_metadata" jsonb,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"question_text" text NOT NULL,
	"question_type" text NOT NULL,
	"options" jsonb,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "survey_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "ai_configurations" ADD COLUMN "openai_api_status" text DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE "ai_configurations" ADD COLUMN "openai_api_status_message" text;--> statement-breakpoint
ALTER TABLE "ai_configurations" ADD COLUMN "openai_api_status_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "interests" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "permissions" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "party_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "political_position" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_election_votes" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_value" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "expiry_date" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_campaigns" ADD CONSTRAINT "survey_campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_campaigns" ADD CONSTRAINT "survey_campaigns_template_id_survey_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."survey_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_campaigns" ADD CONSTRAINT "survey_campaigns_admin_reviewer_id_users_id_fk" FOREIGN KEY ("admin_reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_landing_pages" ADD CONSTRAINT "survey_landing_pages_campaign_id_survey_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."survey_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_campaign_id_survey_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."survey_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_party_id_political_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."political_parties"("id") ON DELETE no action ON UPDATE no action;