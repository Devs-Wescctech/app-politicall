-- =====================================================
-- SCRIPT PARA INSERIR USUÁRIOS
-- Execute: sudo -u postgres psql politicall < insert_users.sql
-- =====================================================

-- Usuário 1: teste@politicall.com.br
INSERT INTO users (id, email, password, name, created_at, role, permissions, phone, party_id, political_position, last_election_votes, avatar, state, city, whatsapp, plan_value, expiry_date, payment_status, last_payment_date, account_id, slug, election_number, volunteer_code, landing_background)
VALUES (
  '929fe5a9-df01-4b58-90e5-ac571d619a8f',
  'teste@politicall.com.br',
  '$2b$10$XAnHv3K/RJk/017fjeUgL.2nHX1EzgiX8A5SIRl1pds/O3N5FbPg6',
  'Teste Adm',
  '2025-11-17 23:42:10.850327',
  'admin',
  '{"ai": true, "users": true, "agenda": true, "demands": true, "contacts": true, "alliances": true, "dashboard": true, "marketing": true}',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  '1.580,00', '16/12/2025', 'pago', '18/11/2025',
  '929fe5a9-df01-4b58-90e5-ac571d619a8f',
  'testeadm', NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- Usuário 2: adm@politicall.com.br (Carlos Nedel) - ADMIN PRINCIPAL
INSERT INTO users (id, email, password, name, created_at, role, permissions, phone, party_id, political_position, last_election_votes, avatar, state, city, whatsapp, plan_value, expiry_date, payment_status, last_payment_date, account_id, slug, election_number, volunteer_code, landing_background)
VALUES (
  'd0476e06-f1b0-4204-8280-111fa6478fc9',
  'adm@politicall.com.br',
  '$2b$10$i1UTTld6ZSkpFxFga8/UsOa9eQlNejBTOZ91DjPIdSp6wR5RbVlM.',
  'Carlos Nedel',
  '2025-11-16 16:00:51.989343',
  'admin',
  '{"ai": true, "users": true, "agenda": true, "demands": true, "contacts": true, "settings": true, "alliances": true, "dashboard": true, "marketing": false, "petitions": false}',
  '51983237805',
  '594cf1a4-4e65-4919-a2dc-50c63920a456',
  'Vereador',
  20000,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  'd0476e06-f1b0-4204-8280-111fa6478fc9',
  'carlosnedel', NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- Usuário 3: outro@teste.com
INSERT INTO users (id, email, password, name, created_at, role, permissions, phone, party_id, political_position, last_election_votes, avatar, state, city, whatsapp, plan_value, expiry_date, payment_status, last_payment_date, account_id, slug, election_number, volunteer_code, landing_background)
VALUES (
  '2dd828ec-34d6-4763-8c85-27a2e624f96a',
  'outro@teste.com',
  '$2b$10$Bs01G1oMwCiROgoBE1sdIudYyQz0XMRGHSvbIh.39CnqMJ4KKx8Ly',
  'outro',
  '2025-11-18 14:54:41.288753',
  'assessor',
  '{"ai": false, "users": false, "agenda": true, "demands": true, "contacts": true, "alliances": false, "dashboard": true, "marketing": false, "petitions": false}',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  '2dd828ec-34d6-4763-8c85-27a2e624f96a',
  NULL, NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- Usuário 4: appoficial2025@gmail.com
INSERT INTO users (id, email, password, name, created_at, role, permissions, phone, party_id, political_position, last_election_votes, avatar, state, city, whatsapp, plan_value, expiry_date, payment_status, last_payment_date, account_id, slug, election_number, volunteer_code, landing_background)
VALUES (
  '7ddbec44-e3a8-4780-8e6c-6af16b045fc7',
  'appoficial2025@gmail.com',
  '$2b$10$HwENw71JvyMURfd4wX.xPu9bR.MEvmg65TbhVXaWts/TxHkmiAtpq',
  'teste',
  '2025-11-17 02:53:57.178772',
  'assessor',
  '{"ai": false, "users": false, "agenda": true, "demands": true, "contacts": true, "alliances": false, "dashboard": true, "marketing": false, "petitions": false}',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  '7ddbec44-e3a8-4780-8e6c-6af16b045fc7',
  NULL, NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- Usuário 5: joao@hotmail.com
INSERT INTO users (id, email, password, name, created_at, role, permissions, phone, party_id, political_position, last_election_votes, avatar, state, city, whatsapp, plan_value, expiry_date, payment_status, last_payment_date, account_id, slug, election_number, volunteer_code, landing_background)
VALUES (
  '00746bc6-469f-42e4-b5bf-edf81d8d0aa4',
  'joao@hotmail.com',
  '$2b$10$fMlYBRUeyzbmPdPz4K94wub0Pp247zhT3plaeXzTNvHgSa0y0MRcu',
  'joao',
  '2025-11-18 20:26:04.263712',
  'assessor',
  '{"ai": false, "users": false, "agenda": true, "demands": true, "contacts": true, "alliances": false, "dashboard": true, "marketing": false, "petitions": false}',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  '00746bc6-469f-42e4-b5bf-edf81d8d0aa4',
  NULL, NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- Usuário 6: davidntrs@hotmail.com (voluntário)
INSERT INTO users (id, email, password, name, created_at, role, permissions, phone, party_id, political_position, last_election_votes, avatar, state, city, whatsapp, plan_value, expiry_date, payment_status, last_payment_date, account_id, slug, election_number, volunteer_code, landing_background)
VALUES (
  '03b65b98-8d13-4cfb-82a6-f960c7002022',
  'davidntrs@hotmail.com',
  '$2b$10$86tv27vIfTwLq8QHWebOh.txvN998em3cj8gjcsgW07m/PQC6erUa',
  'teste',
  '2025-12-02 19:09:39.317848',
  'voluntario',
  '{"ai": false, "users": false, "agenda": false, "demands": false, "contacts": true, "settings": false, "alliances": false, "dashboard": false, "marketing": false, "petitions": false}',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  'd0476e06-f1b0-4204-8280-111fa6478fc9',
  NULL, NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- Usuário 7: abc@hotmail.com
INSERT INTO users (id, email, password, name, created_at, role, permissions, phone, party_id, political_position, last_election_votes, avatar, state, city, whatsapp, plan_value, expiry_date, payment_status, last_payment_date, account_id, slug, election_number, volunteer_code, landing_background)
VALUES (
  'c65860d3-9e8f-4aeb-be9f-d4077c37e947',
  'abc@hotmail.com',
  '$2b$10$ZVdycPwCEJtz2pmsVKf1Zuop4ejHbhfXxl0xWivUsAXRxEL2boAHG',
  'Assistente NYX',
  '2025-11-19 12:26:01.22172',
  'assessor',
  '{"ai": false, "users": false, "agenda": true, "demands": false, "contacts": false, "alliances": false, "dashboard": true, "marketing": false}',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  'd422f9c6-fb93-40f4-b296-5b133e8216a4',
  NULL, NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- Usuário 8: rob@hotmail.com
INSERT INTO users (id, email, password, name, created_at, role, permissions, phone, party_id, political_position, last_election_votes, avatar, state, city, whatsapp, plan_value, expiry_date, payment_status, last_payment_date, account_id, slug, election_number, volunteer_code, landing_background)
VALUES (
  '4f19ea38-8650-4766-9f2e-ea3951e545b5',
  'rob@hotmail.com',
  '$2b$10$A0qT2.eJEjZVGJiLdla3e./dRiUAforvQy62CXiS/yr28rpxxx1o2',
  'rob',
  '2025-11-19 12:46:14.847873',
  'assessor',
  '{"ai": false, "users": false, "agenda": false, "demands": true, "contacts": false, "alliances": false, "dashboard": true, "marketing": false}',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  'd422f9c6-fb93-40f4-b296-5b133e8216a4',
  NULL, NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- Usuário 9: cgl212212@gmail.com (Cristian Lima)
INSERT INTO users (id, email, password, name, created_at, role, permissions, phone, party_id, political_position, last_election_votes, avatar, state, city, whatsapp, plan_value, expiry_date, payment_status, last_payment_date, account_id, slug, election_number, volunteer_code, landing_background)
VALUES (
  '3108836a-f828-47be-b197-445401513e74',
  'cgl212212@gmail.com',
  '$2b$10$Ek374T4CjRFpx0KEhEDlee95ZzLFJU/EMTZ6eakF3btdjgWUtm1Mi',
  'Cristian Lima',
  '2025-11-19 18:50:08.537331',
  'admin',
  '{"ai": true, "users": false, "agenda": true, "demands": true, "contacts": true, "alliances": true, "dashboard": true, "marketing": true, "petitions": true}',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  '8821bdc3-f156-4e68-9c47-87df0e01773e',
  'cristianlima', NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- Usuário 10: marcos@hotmail.com (Marcos Lopes) - IMPORTANTE: referenciado em muitas tabelas
INSERT INTO users (id, email, password, name, created_at, role, permissions, phone, party_id, political_position, last_election_votes, avatar, state, city, whatsapp, plan_value, expiry_date, payment_status, last_payment_date, account_id, slug, election_number, volunteer_code, landing_background)
VALUES (
  '90a1d528-a3b9-4b72-aa45-78fbb44b0939',
  'marcos@hotmail.com',
  '$2b$10$RAwixrJihcm8F8SXa1ODeODnqvIazCXy5V41FXBmGo84aBGWIOsUq',
  'Marcos Lopes',
  '2025-11-19 12:12:58.741526',
  'admin',
  '{"ai": true, "users": false, "agenda": true, "demands": true, "contacts": true, "alliances": true, "dashboard": true, "marketing": true, "petitions": true}',
  '51983237805',
  'ac2a99d9-7abf-4550-af32-04d41cb3d83c',
  'Vereador',
  15000,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  'd422f9c6-fb93-40f4-b296-5b133e8216a4',
  'marcoslopes', NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- Usuário 11: abc2@hotmail.com
INSERT INTO users (id, email, password, name, created_at, role, permissions, phone, party_id, political_position, last_election_votes, avatar, state, city, whatsapp, plan_value, expiry_date, payment_status, last_payment_date, account_id, slug, election_number, volunteer_code, landing_background)
VALUES (
  'a3805bd9-7e77-437d-bbbe-7f71b776e855',
  'abc2@hotmail.com',
  '$2b$10$eoIv4YfUjCUVKy7miwMBs.pqyoEXYN8ppssdbDqJLI9TE0d1U4dZ2',
  'abc',
  '2025-11-26 19:29:16.84199',
  'assessor',
  '{"ai": false, "users": false, "agenda": false, "demands": false, "contacts": true, "settings": false, "alliances": false, "dashboard": true, "marketing": false, "petitions": false}',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  '77e171b6-729f-4de7-b5be-5d6b92fcbcca',
  NULL, NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- Usuário 12: teste@nyx.com.br
INSERT INTO users (id, email, password, name, created_at, role, permissions, phone, party_id, political_position, last_election_votes, avatar, state, city, whatsapp, plan_value, expiry_date, payment_status, last_payment_date, account_id, slug, election_number, volunteer_code, landing_background)
VALUES (
  '5ee1ff5a-aa2d-4447-afa8-d741d0459c2b',
  'teste@nyx.com.br',
  '$2b$10$fbu7DDo3DdF9Z1RmLEi4yOmv5vcjDMoeCcjlyuzKWTGwjQmLgTNmK',
  'teste',
  '2025-11-26 17:57:28.542322',
  'admin',
  '{"ai": false, "users": false, "agenda": false, "demands": false, "contacts": true, "settings": false, "alliances": false, "dashboard": true, "marketing": false, "petitions": false}',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  '77e171b6-729f-4de7-b5be-5d6b92fcbcca',
  'teste', NULL, NULL, NULL
) ON CONFLICT (id) DO NOTHING;

-- Agora adicionar as FOREIGN KEYS que falharam antes
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
