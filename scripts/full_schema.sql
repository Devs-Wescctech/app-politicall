--
-- PostgreSQL database dump
--


-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    plan_value text,
    payment_status text,
    commission_paid boolean DEFAULT false,
    salesperson text
);


--
-- Name: ai_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_configurations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    mode text DEFAULT 'compliance'::text NOT NULL,
    facebook_page_id text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    facebook_app_id text,
    facebook_app_secret text,
    facebook_page_access_token text,
    facebook_webhook_verify_token text,
    facebook_page_name text,
    instagram_app_id text,
    instagram_app_secret text,
    instagram_access_token text,
    instagram_business_account_id text,
    instagram_facebook_page_id text,
    instagram_username text,
    twitter_api_key text,
    twitter_api_secret_key text,
    twitter_bearer_token text,
    twitter_access_token text,
    twitter_access_token_secret text,
    twitter_client_id text,
    twitter_client_secret text,
    twitter_username text,
    whatsapp_phone_number_id text,
    whatsapp_business_account_id text,
    whatsapp_access_token text,
    whatsapp_app_id text,
    whatsapp_app_secret text,
    whatsapp_webhook_verify_token text,
    whatsapp_phone_number text,
    whatsapp_business_name text,
    system_prompt text,
    personality_traits text,
    political_info text,
    response_guidelines text,
    openai_api_key text,
    openai_api_key_last4 text,
    openai_api_key_updated_at timestamp without time zone,
    openai_api_status text DEFAULT 'unknown'::text,
    openai_api_status_message text,
    openai_api_status_checked_at timestamp without time zone,
    account_id character varying NOT NULL,
    instagram_webhook_verify_token text,
    facebook_automation_enabled boolean DEFAULT false,
    instagram_automation_enabled boolean DEFAULT false
);


--
-- Name: ai_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_conversations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    platform text NOT NULL,
    post_content text,
    user_message text NOT NULL,
    ai_response text NOT NULL,
    mode text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    account_id character varying NOT NULL
);


--
-- Name: ai_response_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_response_templates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    name text NOT NULL,
    trigger text NOT NULL,
    response text NOT NULL,
    platform text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    account_id character varying NOT NULL
);


--
-- Name: ai_training_examples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_training_examples (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    category text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    account_id character varying NOT NULL
);


--
-- Name: alliance_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alliance_invites (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    user_id character varying NOT NULL,
    party_id character varying NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invitee_email text,
    invitee_phone text,
    invitee_name text,
    invitee_position text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    accepted_at timestamp without time zone,
    invitee_state text,
    invitee_city text,
    invitee_notes text
);


--
-- Name: api_key_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_key_usage (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    api_key_id character varying NOT NULL,
    endpoint text NOT NULL,
    method text NOT NULL,
    ip_address text,
    user_agent text,
    status_code integer,
    message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    account_id character varying NOT NULL,
    name text NOT NULL,
    description text,
    key_prefix text NOT NULL,
    hashed_key text NOT NULL,
    last_used_at timestamp without time zone,
    expires_at timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_attachments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    conversation_id character varying NOT NULL,
    message_id character varying,
    file_name text NOT NULL,
    mime_type text,
    size integer,
    url text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_automation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_automation (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    connection_id character varying,
    welcome_enabled boolean DEFAULT false,
    welcome_message text,
    away_enabled boolean DEFAULT false,
    away_message text,
    inactivity_enabled boolean DEFAULT false,
    inactivity_minutes integer DEFAULT 60,
    inactivity_message text,
    keyword_rules jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_contact_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_contact_labels (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    contact_id character varying NOT NULL,
    label_id character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_conversation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_conversation_events (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    conversation_id character varying,
    message_id character varying,
    user_id character varying,
    action text NOT NULL,
    entity_type text DEFAULT 'conversation'::text NOT NULL,
    entity_id character varying,
    ip_address text,
    user_agent text,
    before jsonb,
    after jsonb,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_conversation_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_conversation_labels (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    conversation_id character varying NOT NULL,
    label_id character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_conversations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    attendance_code text,
    contact_id character varying,
    connection_id character varying,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    provider text,
    external_thread_id text,
    external_contact_id text,
    contact_name text,
    contact_phone text,
    contact_email text,
    contact_avatar text,
    sector_id character varying,
    queue_id character varying,
    mode text DEFAULT 'automatic'::text NOT NULL,
    status text DEFAULT 'automatic'::text NOT NULL,
    status_changed_at timestamp without time zone DEFAULT now() NOT NULL,
    assigned_user_id character varying,
    assigned_at timestamp without time zone,
    assigned_by_user_id character varying,
    last_operator_activity_at timestamp without time zone,
    last_customer_activity_at timestamp without time zone,
    first_response_at timestamp without time zone,
    lock_expires_at timestamp without time zone,
    ai_enabled boolean DEFAULT false,
    priority text DEFAULT 'normal'::text,
    sla_due_at timestamp without time zone,
    last_message_at timestamp without time zone,
    last_message_preview text,
    unread_count integer DEFAULT 0,
    resolved_at timestamp without time zone,
    closed_at timestamp without time zone,
    protocol text,
    summary text,
    sentiment text,
    tags text[],
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_import_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_import_jobs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    user_id character varying,
    type text DEFAULT 'contacts'::text NOT NULL,
    file_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    total_rows integer DEFAULT 0,
    processed_rows integer DEFAULT 0,
    imported_rows integer DEFAULT 0,
    updated_rows integer DEFAULT 0,
    failed_rows integer DEFAULT 0,
    mapping jsonb,
    errors jsonb,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_labels (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#14b8a6'::text NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    conversation_id character varying NOT NULL,
    contact_id character varying,
    user_id character varying,
    direction text DEFAULT 'inbound'::text NOT NULL,
    channel text,
    provider text,
    external_message_id text,
    body text,
    message_type text DEFAULT 'text'::text,
    status text DEFAULT 'received'::text,
    error_message text,
    ai_generated boolean DEFAULT false,
    media_url text,
    mime_type text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_notes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    conversation_id character varying NOT NULL,
    user_id character varying NOT NULL,
    note text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_queue_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_queue_members (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    queue_id character varying NOT NULL,
    user_id character varying NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_queues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_queues (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    name text NOT NULL,
    description text,
    channel text,
    sector_id character varying,
    strategy text DEFAULT 'manual'::text NOT NULL,
    max_wait_minutes integer DEFAULT 30,
    priority integer DEFAULT 0,
    is_default boolean DEFAULT false,
    active boolean DEFAULT true,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_sectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_sectors (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    name text NOT NULL,
    description text,
    channel text,
    is_default boolean DEFAULT false,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: att_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.att_transfers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    conversation_id character varying NOT NULL,
    from_user_id character varying,
    to_user_id character varying,
    from_sector_id character varying,
    to_sector_id character varying,
    from_queue_id character varying,
    to_queue_id character varying,
    reason text,
    created_by_user_id character varying,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: channel_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_connections (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    name text NOT NULL,
    channel text NOT NULL,
    provider text DEFAULT 'wescctech'::text NOT NULL,
    base_url text DEFAULT 'https://api.wescctech.com.br'::text,
    token text,
    status text DEFAULT 'pending'::text NOT NULL,
    last_tested_at timestamp without time zone,
    last_error text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_activities (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    contact_id character varying NOT NULL,
    account_id character varying NOT NULL,
    user_id character varying,
    activity_type character varying NOT NULL,
    description text NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    state text,
    city text,
    interests text[],
    account_id character varying NOT NULL,
    source text,
    age integer,
    gender text,
    normalized_name text,
    field_operative_id character varying
);


--
-- Name: demand_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demand_comments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    demand_id character varying NOT NULL,
    user_id character varying NOT NULL,
    comment text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    account_id character varying NOT NULL
);


--
-- Name: demands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demands (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    assignee text,
    due_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    recurrence text DEFAULT 'none'::text,
    collaborators text[],
    account_id character varying NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    title text NOT NULL,
    description text,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    category text,
    location text,
    reminder boolean DEFAULT false,
    reminder_minutes integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    border_color text,
    recurrence text,
    account_id character varying NOT NULL,
    google_event_id text,
    google_meet_link text
);


--
-- Name: field_operatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.field_operatives (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    avatar_url text,
    cover_image_url text,
    phone text,
    email text,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: google_ads_campaign_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_ads_campaign_assets (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    campaign_id character varying NOT NULL,
    storage_key text NOT NULL,
    url text NOT NULL,
    original_filename text NOT NULL,
    size_bytes integer NOT NULL,
    mime_type text NOT NULL,
    uploaded_at timestamp without time zone DEFAULT now() NOT NULL,
    uploaded_by character varying NOT NULL,
    asset_type text DEFAULT 'image'::text NOT NULL
);


--
-- Name: google_ads_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_ads_campaigns (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    campaign_name text NOT NULL,
    objective text NOT NULL,
    target_scope text NOT NULL,
    target_locations jsonb,
    budget numeric(10,2) NOT NULL,
    management_fee numeric(10,2) NOT NULL,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    duration_days integer NOT NULL,
    lp_slug text NOT NULL,
    lp_url text NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    admin_reviewer_id character varying,
    admin_notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: google_calendar_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_calendar_integrations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    user_id character varying NOT NULL,
    client_id text,
    client_secret text,
    access_token text,
    refresh_token text,
    redirect_uri text,
    token_expiry timestamp with time zone,
    scopes text,
    email character varying(255),
    calendar_id character varying(255),
    is_active boolean DEFAULT true,
    sync_direction character varying(20),
    auto_create_meet boolean DEFAULT false,
    sync_reminders boolean DEFAULT false,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    token_expiry_date timestamp without time zone,
    sync_enabled boolean DEFAULT true
);


--
-- Name: integration_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    user_id character varying,
    service text NOT NULL,
    action text NOT NULL,
    status text NOT NULL,
    request jsonb,
    response jsonb,
    error text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    service text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    sendgrid_api_key text,
    from_email text,
    from_name text,
    twilio_account_sid text,
    twilio_auth_token text,
    twilio_phone_number text,
    test_mode boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    account_id character varying NOT NULL,
    whatsapp_token text,
    whatsapp_phone_number text,
    whatsapp_phone_number_id text,
    whatsapp_business_account_id text,
    whatsapp_webhook_url text,
    sms_account text,
    sms_code text,
    sms_client text,
    sms_endpoint text,
    sms_tipo_envio text,
    smtp_host text,
    smtp_port integer,
    smtp_user text,
    smtp_password text,
    smtp_security text,
    imap_host text,
    imap_port integer,
    imap_user text,
    imap_password text,
    imap_security text,
    locaweb_base_url text,
    locaweb_account_id text,
    locaweb_api_key text,
    locaweb_auth_header text,
    locaweb_auth_scheme text,
    metadata jsonb
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    "position" text NOT NULL,
    state text NOT NULL,
    city text NOT NULL,
    message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: linkbio_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.linkbio_pages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    user_id character varying NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    description text,
    avatar_url text,
    background_color text DEFAULT '#6366f1'::text,
    status text DEFAULT 'rascunho'::text NOT NULL,
    petition_ids text[],
    views_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: linktree_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.linktree_pages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    user_id character varying NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    description text,
    avatar_url text,
    background_color text DEFAULT '#ffffff'::text,
    text_color text DEFAULT '#000000'::text,
    links jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'rascunho'::text NOT NULL,
    views_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_campaigns (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    subject text,
    message text NOT NULL,
    recipients jsonb NOT NULL,
    scheduled_for timestamp without time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    account_id character varying NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    link text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    account_id character varying NOT NULL
);


--
-- Name: petition_campaign_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.petition_campaign_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    campaign_id character varying NOT NULL,
    recipient_name text NOT NULL,
    recipient_contact text NOT NULL,
    status text NOT NULL,
    response_status text,
    response_body text,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: petition_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.petition_campaigns (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    user_id character varying NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    petition_id character varying,
    target_petitions text[],
    target_filters jsonb DEFAULT '{}'::jsonb,
    message text NOT NULL,
    subject text,
    sender_email text,
    sender_name text,
    scheduled_date timestamp without time zone,
    sent_count integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    total_recipients integer DEFAULT 0 NOT NULL,
    api_token text,
    delay_seconds integer DEFAULT 3 NOT NULL,
    messages_per_hour integer DEFAULT 20 NOT NULL,
    avoid_night_hours boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: petition_message_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.petition_message_templates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    user_id character varying NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    subject text,
    content text NOT NULL,
    is_default boolean DEFAULT false,
    thumbnail_url text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: petition_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.petition_signatures (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    petition_id character varying NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    city text,
    state text,
    cpf text,
    comment text,
    ip_address text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: petitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.petitions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    user_id character varying NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    banner_url text,
    logo_url text,
    video_url text,
    primary_color text DEFAULT '#6366f1'::text,
    share_text text,
    goal integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
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
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: political_alliances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.political_alliances (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    party_id character varying NOT NULL,
    ally_name text NOT NULL,
    "position" text,
    phone text,
    email text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    state text,
    city text,
    account_id character varying NOT NULL
);


--
-- Name: political_parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.political_parties (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    acronym text NOT NULL,
    ideology text NOT NULL,
    description text
);


--
-- Name: quick_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quick_replies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    account_id character varying NOT NULL,
    user_id character varying,
    title text NOT NULL,
    message text NOT NULL,
    channel text,
    attachment_url text,
    attachment_type text,
    attachment_name text,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sector_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sector_members (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    sector_id character varying NOT NULL,
    user_id character varying NOT NULL,
    account_id character varying NOT NULL,
    active boolean DEFAULT true
);


--
-- Name: survey_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_campaigns (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    template_id character varying NOT NULL,
    campaign_name text NOT NULL,
    slug text NOT NULL,
    status text DEFAULT 'under_review'::text NOT NULL,
    admin_reviewer_id character varying,
    admin_notes text,
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    target_audience text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    view_count integer DEFAULT 0 NOT NULL,
    region text,
    campaign_stage text DEFAULT 'aguardando'::text NOT NULL,
    production_start_date timestamp without time zone,
    account_id character varying NOT NULL,
    custom_main_question text,
    custom_questions jsonb,
    custom_main_question_type text,
    custom_main_question_options jsonb,
    distribution_type text DEFAULT 'free'::text,
    demographic_fields jsonb DEFAULT '["gender", "ageRange", "employmentType", "housingType", "hasChildren", "politicalIdeology"]'::jsonb,
    custom_demographic_fields jsonb,
    budget_value numeric
);


--
-- Name: survey_landing_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_landing_pages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    campaign_id character varying NOT NULL,
    html_content text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    generated_at timestamp without time zone DEFAULT now() NOT NULL,
    account_id character varying NOT NULL
);


--
-- Name: survey_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_responses (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    campaign_id character varying NOT NULL,
    response_data jsonb NOT NULL,
    respondent_ip text,
    respondent_metadata jsonb,
    submitted_at timestamp without time zone DEFAULT now() NOT NULL,
    gender text DEFAULT 'prefiro_nao_dizer'::text NOT NULL,
    age_range text DEFAULT 'menos_35'::text NOT NULL,
    employment_type text DEFAULT 'outro'::text NOT NULL,
    housing_type text DEFAULT 'outro'::text NOT NULL,
    has_children text DEFAULT 'nao'::text NOT NULL,
    political_ideology text DEFAULT 'prefiro_nao_comentar'::text NOT NULL,
    account_id character varying NOT NULL
);


--
-- Name: survey_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_templates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    question_text text NOT NULL,
    question_type text NOT NULL,
    options jsonb,
    "order" integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    description text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    role text DEFAULT 'assessor'::text NOT NULL,
    permissions jsonb,
    phone text,
    party_id character varying,
    political_position text,
    last_election_votes integer,
    avatar text,
    state text,
    city text,
    whatsapp text,
    plan_value text,
    expiry_date text,
    payment_status text,
    last_payment_date text,
    account_id character varying NOT NULL,
    slug text,
    election_number text,
    volunteer_code text,
    landing_background text
);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: ai_configurations ai_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_configurations
    ADD CONSTRAINT ai_configurations_pkey PRIMARY KEY (id);


--
-- Name: ai_conversations ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_response_templates ai_response_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_response_templates
    ADD CONSTRAINT ai_response_templates_pkey PRIMARY KEY (id);


--
-- Name: ai_training_examples ai_training_examples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_training_examples
    ADD CONSTRAINT ai_training_examples_pkey PRIMARY KEY (id);


--
-- Name: alliance_invites alliance_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alliance_invites
    ADD CONSTRAINT alliance_invites_pkey PRIMARY KEY (id);


--
-- Name: alliance_invites alliance_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alliance_invites
    ADD CONSTRAINT alliance_invites_token_key UNIQUE (token);


--
-- Name: api_key_usage api_key_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key_usage
    ADD CONSTRAINT api_key_usage_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_hashed_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_hashed_key_key UNIQUE (hashed_key);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: att_attachments att_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_attachments
    ADD CONSTRAINT att_attachments_pkey PRIMARY KEY (id);


--
-- Name: att_automation att_automation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_automation
    ADD CONSTRAINT att_automation_pkey PRIMARY KEY (id);


--
-- Name: att_contact_labels att_contact_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_contact_labels
    ADD CONSTRAINT att_contact_labels_pkey PRIMARY KEY (id);


--
-- Name: att_conversation_events att_conversation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_conversation_events
    ADD CONSTRAINT att_conversation_events_pkey PRIMARY KEY (id);


--
-- Name: att_conversation_labels att_conversation_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_conversation_labels
    ADD CONSTRAINT att_conversation_labels_pkey PRIMARY KEY (id);


--
-- Name: att_conversations att_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_conversations
    ADD CONSTRAINT att_conversations_pkey PRIMARY KEY (id);


--
-- Name: att_import_jobs att_import_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_import_jobs
    ADD CONSTRAINT att_import_jobs_pkey PRIMARY KEY (id);


--
-- Name: att_labels att_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_labels
    ADD CONSTRAINT att_labels_pkey PRIMARY KEY (id);


--
-- Name: att_messages att_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_messages
    ADD CONSTRAINT att_messages_pkey PRIMARY KEY (id);


--
-- Name: att_notes att_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_notes
    ADD CONSTRAINT att_notes_pkey PRIMARY KEY (id);


--
-- Name: att_queue_members att_queue_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_queue_members
    ADD CONSTRAINT att_queue_members_pkey PRIMARY KEY (id);


--
-- Name: att_queues att_queues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_queues
    ADD CONSTRAINT att_queues_pkey PRIMARY KEY (id);


--
-- Name: att_sectors att_sectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_sectors
    ADD CONSTRAINT att_sectors_pkey PRIMARY KEY (id);


--
-- Name: att_transfers att_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.att_transfers
    ADD CONSTRAINT att_transfers_pkey PRIMARY KEY (id);


--
-- Name: channel_connections channel_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_connections
    ADD CONSTRAINT channel_connections_pkey PRIMARY KEY (id);


--
-- Name: contact_activities contact_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: demand_comments demand_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demand_comments
    ADD CONSTRAINT demand_comments_pkey PRIMARY KEY (id);


--
-- Name: demands demands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demands
    ADD CONSTRAINT demands_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: field_operatives field_operatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_operatives
    ADD CONSTRAINT field_operatives_pkey PRIMARY KEY (id);


--
-- Name: google_ads_campaign_assets google_ads_campaign_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_campaign_assets
    ADD CONSTRAINT google_ads_campaign_assets_pkey PRIMARY KEY (id);


--
-- Name: google_ads_campaigns google_ads_campaigns_lp_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_campaigns
    ADD CONSTRAINT google_ads_campaigns_lp_slug_unique UNIQUE (lp_slug);


--
-- Name: google_ads_campaigns google_ads_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_campaigns
    ADD CONSTRAINT google_ads_campaigns_pkey PRIMARY KEY (id);


--
-- Name: google_calendar_integrations google_calendar_integrations_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_integrations
    ADD CONSTRAINT google_calendar_integrations_account_id_key UNIQUE (account_id);


--
-- Name: google_calendar_integrations google_calendar_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_integrations
    ADD CONSTRAINT google_calendar_integrations_pkey PRIMARY KEY (id);


--
-- Name: integration_logs integration_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_logs
    ADD CONSTRAINT integration_logs_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: linkbio_pages linkbio_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkbio_pages
    ADD CONSTRAINT linkbio_pages_pkey PRIMARY KEY (id);


--
-- Name: linkbio_pages linkbio_pages_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkbio_pages
    ADD CONSTRAINT linkbio_pages_slug_key UNIQUE (slug);


--
-- Name: linktree_pages linktree_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linktree_pages
    ADD CONSTRAINT linktree_pages_pkey PRIMARY KEY (id);


--
-- Name: linktree_pages linktree_pages_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linktree_pages
    ADD CONSTRAINT linktree_pages_slug_key UNIQUE (slug);


--
-- Name: marketing_campaigns marketing_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: petition_campaign_logs petition_campaign_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition_campaign_logs
    ADD CONSTRAINT petition_campaign_logs_pkey PRIMARY KEY (id);


--
-- Name: petition_campaigns petition_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition_campaigns
    ADD CONSTRAINT petition_campaigns_pkey PRIMARY KEY (id);


--
-- Name: petition_message_templates petition_message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition_message_templates
    ADD CONSTRAINT petition_message_templates_pkey PRIMARY KEY (id);


--
-- Name: petition_signatures petition_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition_signatures
    ADD CONSTRAINT petition_signatures_pkey PRIMARY KEY (id);


--
-- Name: petitions petitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petitions
    ADD CONSTRAINT petitions_pkey PRIMARY KEY (id);


--
-- Name: petitions petitions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petitions
    ADD CONSTRAINT petitions_slug_key UNIQUE (slug);


--
-- Name: political_alliances political_alliances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.political_alliances
    ADD CONSTRAINT political_alliances_pkey PRIMARY KEY (id);


--
-- Name: political_parties political_parties_acronym_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.political_parties
    ADD CONSTRAINT political_parties_acronym_unique UNIQUE (acronym);


--
-- Name: political_parties political_parties_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.political_parties
    ADD CONSTRAINT political_parties_name_unique UNIQUE (name);


--
-- Name: political_parties political_parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.political_parties
    ADD CONSTRAINT political_parties_pkey PRIMARY KEY (id);


--
-- Name: quick_replies quick_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_pkey PRIMARY KEY (id);


--
-- Name: sector_members sector_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_members
    ADD CONSTRAINT sector_members_pkey PRIMARY KEY (id);


--
-- Name: survey_campaigns survey_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_campaigns
    ADD CONSTRAINT survey_campaigns_pkey PRIMARY KEY (id);


--
-- Name: survey_campaigns survey_campaigns_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_campaigns
    ADD CONSTRAINT survey_campaigns_slug_key UNIQUE (slug);


--
-- Name: survey_landing_pages survey_landing_pages_campaign_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_landing_pages
    ADD CONSTRAINT survey_landing_pages_campaign_id_key UNIQUE (campaign_id);


--
-- Name: survey_landing_pages survey_landing_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_landing_pages
    ADD CONSTRAINT survey_landing_pages_pkey PRIMARY KEY (id);


--
-- Name: survey_responses survey_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_pkey PRIMARY KEY (id);


--
-- Name: survey_templates survey_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_templates
    ADD CONSTRAINT survey_templates_pkey PRIMARY KEY (id);


--
-- Name: survey_templates survey_templates_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_templates
    ADD CONSTRAINT survey_templates_slug_key UNIQUE (slug);


--
-- Name: system_settings system_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_key_key UNIQUE (key);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_slug_key UNIQUE (slug);


--
-- Name: users users_volunteer_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_volunteer_code_key UNIQUE (volunteer_code);


--
-- Name: contacts_accountid_normalizedname_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contacts_accountid_normalizedname_unique ON public.contacts USING btree (account_id, normalized_name) WHERE (normalized_name IS NOT NULL);


--
-- Name: idx_events_google_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_google_event_id ON public.events USING btree (google_event_id);


--
-- Name: ai_configurations ai_configurations_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_configurations
    ADD CONSTRAINT ai_configurations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: ai_configurations ai_configurations_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_configurations
    ADD CONSTRAINT ai_configurations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_conversations ai_conversations_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: ai_conversations ai_conversations_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_response_templates ai_response_templates_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_response_templates
    ADD CONSTRAINT ai_response_templates_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: ai_response_templates ai_response_templates_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_response_templates
    ADD CONSTRAINT ai_response_templates_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_training_examples ai_training_examples_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_training_examples
    ADD CONSTRAINT ai_training_examples_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: ai_training_examples ai_training_examples_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_training_examples
    ADD CONSTRAINT ai_training_examples_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: alliance_invites alliance_invites_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alliance_invites
    ADD CONSTRAINT alliance_invites_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: alliance_invites alliance_invites_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alliance_invites
    ADD CONSTRAINT alliance_invites_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.political_parties(id) ON DELETE CASCADE;


--
-- Name: alliance_invites alliance_invites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alliance_invites
    ADD CONSTRAINT alliance_invites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: api_key_usage api_key_usage_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key_usage
    ADD CONSTRAINT api_key_usage_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: contact_activities contact_activities_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: contact_activities contact_activities_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_activities contact_activities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: contacts contacts_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_field_operative_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_field_operative_id_fkey FOREIGN KEY (field_operative_id) REFERENCES public.field_operatives(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: demand_comments demand_comments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demand_comments
    ADD CONSTRAINT demand_comments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: demand_comments demand_comments_demand_id_demands_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demand_comments
    ADD CONSTRAINT demand_comments_demand_id_demands_id_fk FOREIGN KEY (demand_id) REFERENCES public.demands(id) ON DELETE CASCADE;


--
-- Name: demand_comments demand_comments_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demand_comments
    ADD CONSTRAINT demand_comments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: demands demands_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demands
    ADD CONSTRAINT demands_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: demands demands_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demands
    ADD CONSTRAINT demands_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: events events_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: events events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: field_operatives field_operatives_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_operatives
    ADD CONSTRAINT field_operatives_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: google_ads_campaign_assets google_ads_campaign_assets_campaign_id_google_ads_campaigns_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_campaign_assets
    ADD CONSTRAINT google_ads_campaign_assets_campaign_id_google_ads_campaigns_id_ FOREIGN KEY (campaign_id) REFERENCES public.google_ads_campaigns(id) ON DELETE CASCADE;


--
-- Name: google_ads_campaign_assets google_ads_campaign_assets_uploaded_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_campaign_assets
    ADD CONSTRAINT google_ads_campaign_assets_uploaded_by_users_id_fk FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: google_ads_campaigns google_ads_campaigns_admin_reviewer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_campaigns
    ADD CONSTRAINT google_ads_campaigns_admin_reviewer_id_users_id_fk FOREIGN KEY (admin_reviewer_id) REFERENCES public.users(id);


--
-- Name: google_ads_campaigns google_ads_campaigns_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_campaigns
    ADD CONSTRAINT google_ads_campaigns_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: google_calendar_integrations google_calendar_integrations_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_integrations
    ADD CONSTRAINT google_calendar_integrations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: google_calendar_integrations google_calendar_integrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_integrations
    ADD CONSTRAINT google_calendar_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: integrations integrations_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: integrations integrations_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: linkbio_pages linkbio_pages_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkbio_pages
    ADD CONSTRAINT linkbio_pages_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: linkbio_pages linkbio_pages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkbio_pages
    ADD CONSTRAINT linkbio_pages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: linktree_pages linktree_pages_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linktree_pages
    ADD CONSTRAINT linktree_pages_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: linktree_pages linktree_pages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linktree_pages
    ADD CONSTRAINT linktree_pages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: marketing_campaigns marketing_campaigns_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: marketing_campaigns marketing_campaigns_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: petition_campaign_logs petition_campaign_logs_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition_campaign_logs
    ADD CONSTRAINT petition_campaign_logs_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: petition_campaign_logs petition_campaign_logs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition_campaign_logs
    ADD CONSTRAINT petition_campaign_logs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.petition_campaigns(id) ON DELETE CASCADE;


--
-- Name: petition_campaigns petition_campaigns_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition_campaigns
    ADD CONSTRAINT petition_campaigns_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: petition_campaigns petition_campaigns_petition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition_campaigns
    ADD CONSTRAINT petition_campaigns_petition_id_fkey FOREIGN KEY (petition_id) REFERENCES public.petitions(id) ON DELETE SET NULL;


--
-- Name: petition_campaigns petition_campaigns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition_campaigns
    ADD CONSTRAINT petition_campaigns_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: petition_message_templates petition_message_templates_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition_message_templates
    ADD CONSTRAINT petition_message_templates_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: petition_message_templates petition_message_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition_message_templates
    ADD CONSTRAINT petition_message_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: petition_signatures petition_signatures_petition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petition_signatures
    ADD CONSTRAINT petition_signatures_petition_id_fkey FOREIGN KEY (petition_id) REFERENCES public.petitions(id) ON DELETE CASCADE;


--
-- Name: petitions petitions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petitions
    ADD CONSTRAINT petitions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: petitions petitions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petitions
    ADD CONSTRAINT petitions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: political_alliances political_alliances_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.political_alliances
    ADD CONSTRAINT political_alliances_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: political_alliances political_alliances_party_id_political_parties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.political_alliances
    ADD CONSTRAINT political_alliances_party_id_political_parties_id_fk FOREIGN KEY (party_id) REFERENCES public.political_parties(id) ON DELETE CASCADE;


--
-- Name: political_alliances political_alliances_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.political_alliances
    ADD CONSTRAINT political_alliances_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: survey_campaigns survey_campaigns_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_campaigns
    ADD CONSTRAINT survey_campaigns_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: survey_campaigns survey_campaigns_admin_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_campaigns
    ADD CONSTRAINT survey_campaigns_admin_reviewer_id_fkey FOREIGN KEY (admin_reviewer_id) REFERENCES public.users(id);


--
-- Name: survey_campaigns survey_campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_campaigns
    ADD CONSTRAINT survey_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.survey_templates(id);


--
-- Name: survey_campaigns survey_campaigns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_campaigns
    ADD CONSTRAINT survey_campaigns_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: survey_landing_pages survey_landing_pages_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_landing_pages
    ADD CONSTRAINT survey_landing_pages_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: survey_landing_pages survey_landing_pages_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_landing_pages
    ADD CONSTRAINT survey_landing_pages_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.survey_campaigns(id) ON DELETE CASCADE;


--
-- Name: survey_responses survey_responses_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: survey_responses survey_responses_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.survey_campaigns(id) ON DELETE CASCADE;


--
-- Name: users users_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: users users_party_id_political_parties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_party_id_political_parties_id_fk FOREIGN KEY (party_id) REFERENCES public.political_parties(id);


--
-- PostgreSQL database dump complete
--

