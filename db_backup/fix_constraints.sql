-- =====================================================
-- SCRIPT DE CORREÇÃO DO BANCO DE DADOS POLITICALL
-- Execute: sudo -u postgres psql politicall < fix_constraints.sql
-- =====================================================

-- 1. PRIMARY KEY CONSTRAINTS (tabelas que já têm dados)
ALTER TABLE accounts ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);
ALTER TABLE ai_configurations ADD CONSTRAINT ai_configurations_pkey PRIMARY KEY (id);
ALTER TABLE ai_conversations ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);
ALTER TABLE ai_response_templates ADD CONSTRAINT ai_response_templates_pkey PRIMARY KEY (id);
ALTER TABLE ai_training_examples ADD CONSTRAINT ai_training_examples_pkey PRIMARY KEY (id);
ALTER TABLE api_key_usage ADD CONSTRAINT api_key_usage_pkey PRIMARY KEY (id);
ALTER TABLE api_keys ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);
ALTER TABLE contacts ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);
ALTER TABLE demand_comments ADD CONSTRAINT demand_comments_pkey PRIMARY KEY (id);
ALTER TABLE demands ADD CONSTRAINT demands_pkey PRIMARY KEY (id);
ALTER TABLE events ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE google_ads_campaign_assets ADD CONSTRAINT google_ads_campaign_assets_pkey PRIMARY KEY (id);
ALTER TABLE google_ads_campaigns ADD CONSTRAINT google_ads_campaigns_pkey PRIMARY KEY (id);
ALTER TABLE google_calendar_integrations ADD CONSTRAINT google_calendar_integrations_pkey PRIMARY KEY (id);
ALTER TABLE integrations ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);
ALTER TABLE leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
ALTER TABLE marketing_campaigns ADD CONSTRAINT marketing_campaigns_pkey PRIMARY KEY (id);
ALTER TABLE notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE political_alliances ADD CONSTRAINT political_alliances_pkey PRIMARY KEY (id);
ALTER TABLE political_parties ADD CONSTRAINT political_parties_pkey PRIMARY KEY (id);
ALTER TABLE survey_campaigns ADD CONSTRAINT survey_campaigns_pkey PRIMARY KEY (id);
ALTER TABLE survey_landing_pages ADD CONSTRAINT survey_landing_pages_pkey PRIMARY KEY (id);
ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_pkey PRIMARY KEY (id);
ALTER TABLE survey_templates ADD CONSTRAINT survey_templates_pkey PRIMARY KEY (id);

-- 2. UNIQUE CONSTRAINTS
ALTER TABLE api_keys ADD CONSTRAINT api_keys_hashed_key_key UNIQUE (hashed_key);
ALTER TABLE google_ads_campaigns ADD CONSTRAINT google_ads_campaigns_lp_slug_unique UNIQUE (lp_slug);
ALTER TABLE google_calendar_integrations ADD CONSTRAINT google_calendar_integrations_account_id_key UNIQUE (account_id);
ALTER TABLE political_parties ADD CONSTRAINT political_parties_acronym_unique UNIQUE (acronym);
ALTER TABLE political_parties ADD CONSTRAINT political_parties_name_unique UNIQUE (name);
ALTER TABLE survey_campaigns ADD CONSTRAINT survey_campaigns_slug_key UNIQUE (slug);
ALTER TABLE survey_landing_pages ADD CONSTRAINT survey_landing_pages_campaign_id_key UNIQUE (campaign_id);
ALTER TABLE survey_templates ADD CONSTRAINT survey_templates_slug_key UNIQUE (slug);

-- 3. UNIQUE INDEX para contatos
CREATE UNIQUE INDEX IF NOT EXISTS contacts_accountid_normalizedname_unique 
ON contacts USING btree (account_id, normalized_name) 
WHERE (normalized_name IS NOT NULL);

-- 4. FOREIGN KEYS que referenciam accounts (estas funcionam pois accounts tem dados)
ALTER TABLE ai_configurations ADD CONSTRAINT ai_configurations_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE ai_conversations ADD CONSTRAINT ai_conversations_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE ai_response_templates ADD CONSTRAINT ai_response_templates_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE ai_training_examples ADD CONSTRAINT ai_training_examples_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE contacts ADD CONSTRAINT contacts_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE demand_comments ADD CONSTRAINT demand_comments_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE demands ADD CONSTRAINT demands_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE events ADD CONSTRAINT events_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE google_calendar_integrations ADD CONSTRAINT google_calendar_integrations_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE integrations ADD CONSTRAINT integrations_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE marketing_campaigns ADD CONSTRAINT marketing_campaigns_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE political_alliances ADD CONSTRAINT political_alliances_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE survey_campaigns ADD CONSTRAINT survey_campaigns_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE survey_landing_pages ADD CONSTRAINT survey_landing_pages_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;

-- 5. FOREIGN KEYS que referenciam political_parties
ALTER TABLE political_alliances ADD CONSTRAINT political_alliances_party_id_political_parties_id_fk FOREIGN KEY (party_id) REFERENCES political_parties(id) ON DELETE CASCADE;

-- 6. FOREIGN KEYS que referenciam outras tabelas
ALTER TABLE api_key_usage ADD CONSTRAINT api_key_usage_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE;
ALTER TABLE demand_comments ADD CONSTRAINT demand_comments_demand_id_demands_id_fk FOREIGN KEY (demand_id) REFERENCES demands(id) ON DELETE CASCADE;
ALTER TABLE google_ads_campaign_assets ADD CONSTRAINT google_ads_campaign_assets_campaign_id_google_ads_campaigns_id_ FOREIGN KEY (campaign_id) REFERENCES google_ads_campaigns(id) ON DELETE CASCADE;
ALTER TABLE survey_campaigns ADD CONSTRAINT survey_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES survey_templates(id);
ALTER TABLE survey_landing_pages ADD CONSTRAINT survey_landing_pages_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES survey_campaigns(id) ON DELETE CASCADE;
ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES survey_campaigns(id) ON DELETE CASCADE;

-- 7. FOREIGN KEYS que referenciam users (só funcionam se users tiver dados)
-- Estas serão adicionadas depois que users estiver populada
ALTER TABLE users ADD CONSTRAINT users_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT users_party_id_political_parties_id_fk FOREIGN KEY (party_id) REFERENCES political_parties(id);
ALTER TABLE ai_configurations ADD CONSTRAINT ai_configurations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ai_conversations ADD CONSTRAINT ai_conversations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ai_response_templates ADD CONSTRAINT ai_response_templates_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ai_training_examples ADD CONSTRAINT ai_training_examples_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE contacts ADD CONSTRAINT contacts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE demand_comments ADD CONSTRAINT demand_comments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE demands ADD CONSTRAINT demands_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE events ADD CONSTRAINT events_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE google_ads_campaign_assets ADD CONSTRAINT google_ads_campaign_assets_uploaded_by_users_id_fk FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE google_ads_campaigns ADD CONSTRAINT google_ads_campaigns_admin_reviewer_id_users_id_fk FOREIGN KEY (admin_reviewer_id) REFERENCES users(id);
ALTER TABLE google_ads_campaigns ADD CONSTRAINT google_ads_campaigns_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE google_calendar_integrations ADD CONSTRAINT google_calendar_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE integrations ADD CONSTRAINT integrations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE marketing_campaigns ADD CONSTRAINT marketing_campaigns_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE political_alliances ADD CONSTRAINT political_alliances_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE survey_campaigns ADD CONSTRAINT survey_campaigns_admin_reviewer_id_fkey FOREIGN KEY (admin_reviewer_id) REFERENCES users(id);
ALTER TABLE survey_campaigns ADD CONSTRAINT survey_campaigns_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- =====================================================
-- FIM DO SCRIPT
-- =====================================================
