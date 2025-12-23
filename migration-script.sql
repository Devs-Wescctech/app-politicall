-- ============================================================================
-- SCRIPT DE MIGRAÇÃO - POLITICALL
-- Executar no banco de produção após db:push
-- ============================================================================

-- Limpar dados de seed (manter political_parties e survey_templates)
DELETE FROM users WHERE email = 'adm@politicall.com.br';
DELETE FROM survey_campaigns WHERE id = (SELECT id FROM survey_campaigns LIMIT 1);

-- ============================================================================
-- 1. ACCOUNTS (Contas/Gabinetes)
-- ============================================================================
INSERT INTO accounts (id, name, created_at) VALUES
('d0476e06-f1b0-4204-8280-111fa6478fc9', 'Carlos Nedel', '2025-11-16T16:00:51.989343'),
('929fe5a9-df01-4b58-90e5-ac571d619a8f', 'Teste Adm', '2025-11-17T23:42:10.850327'),
('2dd828ec-34d6-4763-8c85-27a2e624f96a', 'outro', '2025-11-18T14:54:41.288753'),
('7ddbec44-e3a8-4780-8e6c-6af16b045fc7', 'teste', '2025-11-17T02:53:57.178772'),
('00746bc6-469f-42e4-b5bf-edf81d8d0aa4', 'joao', '2025-11-18T20:26:04.263712'),
('93536fbb-b9a5-4f4a-8b3b-bc8c2f55eec1', 'Renato Souza', '2025-11-18T20:48:53.140622'),
('82d4f5fa-188b-46ad-b435-d348c1e8519e', 'Roberto Augusto', '2025-11-18T20:53:29.936654'),
('0f15c59c-86c2-4d2a-b39e-6882eba34571', 'Paulo Ricardo', '2025-11-18T21:12:16.163496'),
('4ac276e5-d6c5-4f8f-a83c-5682df53b6f6', 'Ernando Klain', '2025-11-18T21:17:28.447105'),
('d422f9c6-fb93-40f4-b296-5b133e8216a4', 'Marcos Lopes', '2025-11-19T12:12:58.697821'),
('8821bdc3-f156-4e68-9c47-87df0e01773e', 'Cristian Lima', '2025-11-19T18:50:08.488082'),
('4c8180a8-6941-4e06-b25b-7ee4fdbc7db0', 'teste', '2025-11-26T17:51:43.947895'),
('77e171b6-729f-4de7-b5be-5d6b92fcbcca', 'teste', '2025-11-26T17:57:28.456306')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. USERS (Usuários) - todas as senhas são hashes bcrypt
-- ============================================================================
INSERT INTO users (id, account_id, email, password, name, role, permissions, phone, political_position, last_election_votes, created_at) VALUES
('d0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'adm@politicall.com.br', '$2b$10$ytxXOOSXoeukul07TDIL2e/D/EnKVpsEqbQoXyAPc2T.HuaHQxFwG', 'Carlos Nedel', 'admin', '{"ai": true, "users": true, "agenda": true, "demands": true, "contacts": true, "settings": true, "alliances": true, "dashboard": true, "marketing": true, "petitions": true}', '51983237805', 'Vereador', 20000, '2025-11-16T16:00:51.989343'),
('929fe5a9-df01-4b58-90e5-ac571d619a8f', '929fe5a9-df01-4b58-90e5-ac571d619a8f', 'teste@politicall.com.br', '$2b$10$XAnHv3K/RJk/017fjeUgL.2nHX1EzgiX8A5SIRl1pds/O3N5FbPg6', 'Teste Adm', 'admin', '{"ai": true, "users": true, "agenda": true, "demands": true, "contacts": true, "alliances": true, "dashboard": true, "marketing": true}', NULL, NULL, NULL, '2025-11-17T23:42:10.850327'),
('2dd828ec-34d6-4763-8c85-27a2e624f96a', '2dd828ec-34d6-4763-8c85-27a2e624f96a', 'outro@teste.com', '$2b$10$Bs01G1oMwCiROgoBE1sdIudYyQz0XMRGHSvbIh.39CnqMJ4KKx8Ly', 'outro', 'assessor', '{"ai": false, "users": false, "agenda": true, "demands": true, "contacts": true, "alliances": false, "dashboard": true, "marketing": false, "petitions": false}', NULL, NULL, NULL, '2025-11-18T14:54:41.288753'),
('7ddbec44-e3a8-4780-8e6c-6af16b045fc7', '7ddbec44-e3a8-4780-8e6c-6af16b045fc7', 'appoficial2025@gmail.com', '$2b$10$HwENw71JvyMURfd4wX.xPu9bR.MEvmg65TbhVXaWts/TxHkmiAtpq', 'teste', 'assessor', '{"ai": false, "users": false, "agenda": true, "demands": true, "contacts": true, "alliances": false, "dashboard": true, "marketing": false, "petitions": false}', NULL, NULL, NULL, '2025-11-17T02:53:57.178772'),
('00746bc6-469f-42e4-b5bf-edf81d8d0aa4', '00746bc6-469f-42e4-b5bf-edf81d8d0aa4', 'joao@hotmail.com', '$2b$10$fMlYBRUeyzbmPdPz4K94wub0Pp247zhT3plaeXzTNvHgSa0y0MRcu', 'joao', 'assessor', '{"ai": false, "users": false, "agenda": true, "demands": true, "contacts": true, "alliances": false, "dashboard": true, "marketing": false, "petitions": false}', NULL, NULL, NULL, '2025-11-18T20:26:04.263712'),
('c65860d3-9e8f-4aeb-be9f-d4077c37e947', 'd422f9c6-fb93-40f4-b296-5b133e8216a4', 'abc@hotmail.com', '$2b$10$ZVdycPwCEJtz2pmsVKf1Zuop4ejHbhfXxl0xWivUsAXRxEL2boAHG', 'Assistente NYX', 'assessor', '{"ai": false, "users": false, "agenda": true, "demands": false, "contacts": false, "alliances": false, "dashboard": true, "marketing": false}', NULL, NULL, NULL, '2025-11-19T12:26:01.22172'),
('4f19ea38-8650-4766-9f2e-ea3951e545b5', 'd422f9c6-fb93-40f4-b296-5b133e8216a4', 'rob@hotmail.com', '$2b$10$A0qT2.eJEjZVGJiLdla3e./dRiUAforvQy62CXiS/yr28rpxxx1o2', 'rob', 'assessor', '{"ai": false, "users": false, "agenda": false, "demands": true, "contacts": false, "alliances": false, "dashboard": true, "marketing": false}', NULL, NULL, NULL, '2025-11-19T12:46:14.847873'),
('3108836a-f828-47be-b197-445401513e74', '8821bdc3-f156-4e68-9c47-87df0e01773e', 'cgl212212@gmail.com', '$2b$10$Ek374T4CjRFpx0KEhEDlee95ZzLFJU/EMTZ6eakF3btdjgWUtm1Mi', 'Cristian Lima', 'admin', '{"ai": true, "users": false, "agenda": true, "demands": true, "contacts": true, "alliances": true, "dashboard": true, "marketing": true, "petitions": true}', NULL, NULL, NULL, '2025-11-19T18:50:08.537331'),
('90a1d528-a3b9-4b72-aa45-78fbb44b0939', 'd422f9c6-fb93-40f4-b296-5b133e8216a4', 'marcos@hotmail.com', '$2b$10$RAwixrJihcm8F8SXa1ODeODnqvIazCXy5V41FXBmGo84aBGWIOsUq', 'Marcos Lopes', 'admin', '{"ai": true, "users": false, "agenda": true, "demands": true, "contacts": true, "alliances": true, "dashboard": true, "marketing": true, "petitions": true}', '51983237805', 'Vereador', 15000, '2025-11-19T12:12:58.741526'),
('a3805bd9-7e77-437d-bbbe-7f71b776e855', '77e171b6-729f-4de7-b5be-5d6b92fcbcca', 'abc2@hotmail.com', '$2b$10$eoIv4YfUjCUVKy7miwMBs.pqyoEXYN8ppssdbDqJLI9TE0d1U4dZ2', 'abc', 'assessor', '{"ai": false, "users": false, "agenda": false, "demands": false, "contacts": true, "settings": false, "alliances": false, "dashboard": true, "marketing": false, "petitions": false}', NULL, NULL, NULL, '2025-11-26T19:29:16.84199'),
('5ee1ff5a-aa2d-4447-afa8-d741d0459c2b', '77e171b6-729f-4de7-b5be-5d6b92fcbcca', 'teste@nyx.com.br', '$2b$10$fbu7DDo3DdF9Z1RmLEi4yOmv5vcjDMoeCcjlyuzKWTGwjQmLgTNmK', 'teste', 'admin', '{"ai": false, "users": false, "agenda": false, "demands": false, "contacts": true, "settings": false, "alliances": false, "dashboard": true, "marketing": false, "petitions": false}', NULL, NULL, NULL, '2025-11-26T17:57:28.542322'),
('03b65b98-8d13-4cfb-82a6-f960c7002022', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'davidntrs@hotmail.com', '$2b$10$F0IMdb9wniJcxpiQt2OHAeMHtkxBIP/eiD5cUOrtZtHF/AqRf7jwC', 'teste', 'voluntario', '{"ai": false, "users": false, "agenda": false, "demands": false, "contacts": true, "settings": false, "alliances": false, "dashboard": false, "marketing": false, "petitions": false}', NULL, NULL, NULL, '2025-12-02T19:09:39.317848')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. CONTACTS (Eleitores/Contatos)
-- ============================================================================
INSERT INTO contacts (id, account_id, user_id, name, normalized_name, email, phone, age, gender, state, city, interests, source, notes, created_at) VALUES
('23544716-c895-435d-8773-e1a1f00b8d3e', 'd422f9c6-fb93-40f4-b296-5b133e8216a4', '90a1d528-a3b9-4b72-aa45-78fbb44b0939', 'teste', 'teste', 'admin@salesflow.com', '51983237805', NULL, NULL, 'Rio Grande do Sul', 'São Leopoldo', ARRAY['Outras Religiões','Religião Umbanda/Candomblé','Religião Espírita'], NULL, '', '2025-11-19T12:19:14.132018'),
('59cbe4bc-db3b-49f2-920a-2656f58c4231', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'João de Souza', 'joao de souza', 'adm@politicall.com.br', '51983278543', 27, 'Feminino', 'Rio Grande do Sul', 'São Leopoldo', ARRAY['Futebol','Religião Evangélica','Religião Espírita','Religião Umbanda/Candomblé'], 'Indicação', 'dsadsadasd', '2025-11-16T16:26:51.057877'),
('c4fa4bef-dcd5-400f-8a51-18e4bbe5cd5e', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'João da Silva', 'joao da silva', 'joao.silva@example.com', '(11) 98765-4321', NULL, NULL, 'SP', 'São Paulo', NULL, NULL, NULL, '2025-11-19T19:27:08.888838'),
('e59cf7c3-723c-46b7-9519-b3fd5ee09b17', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'David Flores Andrade', 'david flores andrade', 'davidntrs@hotmail.com', '(51) 98323-7805', 18, 'Masculino', 'Rio Grande do Sul', 'São Leopoldo', ARRAY['Vôlei','Futebol','Basquete'], 'Politicall', '', '2025-11-19T20:10:17.021714'),
('e5f470ad-55a6-40ff-b70d-6343f828413c', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'joão silva', 'joao silva', 'joaozinho@email.com', '11777777777', NULL, NULL, '', '', ARRAY['Religião Umbanda/Candomblé','Outras Religiões','Vôlei'], '', 'Aconteceu tal coisa', '2025-11-19T20:21:31.516521'),
('c9139e61-da4c-4f73-979e-356b5335dfa7', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Alex Riegel', 'alex riegel', 'terra@gmai.com', '(51) 99177-7183', NULL, NULL, 'Rio Grande do Sul', 'Porto Alegre', NULL, 'Cabo Cristian Dias', NULL, '2025-12-10T13:57:29.82164'),
('2e0d4d04-5b9b-4e3d-a6ca-547d2a8a04ea', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Teste Teste', 'teste teste', 'teste@teste.com', '(51) 99487-8787', NULL, NULL, 'Rio Grande do Sul', 'Porto Alegre', NULL, 'Cabo Cristian Dias', NULL, '2025-12-10T14:00:57.068341'),
('1a7d9755-0bb4-4728-8c99-c7261d0be215', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Bruno Souza', 'bruno souza', 'bruno@bruno.com', '(51) 99999-9999', NULL, NULL, 'Rio Grande do Sul', 'Porto Alegre', NULL, 'Cabo Cristian Dias', NULL, '2025-12-10T14:06:16.038743'),
('f04dd1fb-a23b-4a7b-88b4-7e8b5c5908ac', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Bruna Teste', 'bruna teste', 'brs@vrs.com', '(51) 98797-9879', NULL, NULL, 'Rio Grande do Sul', 'Porto Alegre', NULL, 'Cabo Cristian Dias', NULL, '2025-12-10T14:09:59.104447'),
('99a11d5f-7997-4630-a4ca-290c5ddb759e', 'd0476e06-f1b0-4204-8280-111fa6478fc9', '03b65b98-8d13-4cfb-82a6-f960c7002022', 'Ronaldinho Gaucho', 'ronaldinho gaucho', 'teste@nyx.com.br', '(51) 11111-1111', 35, 'Masculino', 'Rio Grande do Sul', 'São Leopoldo', ARRAY['Futebol','Esportes Radicais','Vinhos'], 'Vol. teste', 'Muito bom', '2025-12-17T14:53:08.650315')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. DEMANDS (Demandas)
-- ============================================================================
INSERT INTO demands (id, account_id, user_id, title, description, status, priority, assignee, due_date, created_at, updated_at, recurrence, collaborators) VALUES
('2ac67f28-aa1f-40ac-8086-ac63255bf33b', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Reunião com Secretaria de Saúde', 'Discutir implementação do novo programa de vacinação no município', 'in_progress', 'urgent', 'Carlos Silva', '2025-11-13T19:11:22.917527', '2025-11-16T19:11:22.917527', '2025-11-18T20:58:28', 'none', NULL),
('ef1254f2-9bc8-445c-9644-0e97e26ecb07', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Resposta ao ofício da Câmara', 'Preparar resposta formal sobre questionamentos do projeto de lei 234/2024', 'in_progress', 'high', 'Pedro Oliveira', '2025-11-11T19:11:22.917527', '2025-11-16T19:11:22.917527', '2025-11-18T21:10:54.572', 'none', NULL),
('3ca44cc3-6915-4c07-8829-29f1fbd46f3b', 'd422f9c6-fb93-40f4-b296-5b133e8216a4', '90a1d528-a3b9-4b72-aa45-78fbb44b0939', 'teste', 'fddsfsdfsdf', 'pending', 'high', 'David', '2025-11-20T03:00:00', '2025-11-19T12:20:38.492334', '2025-11-19T12:20:38.492334', 'none', ARRAY[]::text[]),
('6823f539-5790-425d-914a-59fc9107c429', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Entrevista para TV local', 'Participar do programa Cidade em Foco para falar sobre obras', 'pending', 'medium', 'Lucia Mendes', '2025-11-17T15:11:22.917', '2025-11-16T19:11:22.917527', '2025-11-19T20:26:48.477', 'none', NULL),
('5620f70c-dcbb-47fc-9a6d-c237a2347371', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'zczxczxc', 'czxzxc', 'pending', 'medium', 'xczczxc', '2025-11-17T03:00:00', '2025-11-16T18:43:46.75061', '2025-11-16T18:48:07.123', 'daily', ARRAY[]::text[]),
('b077a924-c73f-4a6f-9242-7af2963e9e3f', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Audiência pública sobre transporte', 'Organizar audiência para discutir melhorias no transporte público', 'in_progress', 'urgent', 'Maria Santos', '2025-11-17T00:11:22.917527', '2025-11-16T19:11:22.917527', '2025-11-16T19:11:22.917527', 'none', NULL),
('f158a218-ecc1-4967-b9f9-ab098f3b1d72', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Entrevista para TV local', 'Participar do programa Cidade em Foco para falar sobre obras', 'pending', 'high', 'Lucia Mendes', '2025-11-17T15:11:22.917527', '2025-11-16T19:11:22.917527', '2025-11-16T19:11:22.917527', 'none', NULL),
('b8675672-b200-4649-b526-13dbaa9ecdd8', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Preparar projeto de lei habitacional', 'Elaborar minuta do projeto de habitação popular para o bairro Jardim Esperança', 'in_progress', 'medium', 'Roberto Lima', '2025-11-23T19:11:22.917527', '2025-11-16T19:11:22.917527', '2025-11-16T19:11:22.917527', 'none', NULL),
('73cdb197-cec2-4674-a7c0-1116e7d3a4ab', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Análise de propostas de fornecedores', 'Avaliar propostas para reforma do gabinete', 'completed', 'low', 'Marcos Ribeiro', '2025-12-16T19:11:22.917527', '2025-11-16T19:11:22.917527', '2025-11-16T19:29:42.632', 'none', NULL),
('8dd6f3f0-f537-4cfa-a919-ca78ea77d000', '2dd828ec-34d6-4763-8c85-27a2e624f96a', '2dd828ec-34d6-4763-8c85-27a2e624f96a', 'teste', 'fsdfdsfsdf', 'pending', 'medium', '', '2025-11-19T03:00:00', '2025-11-18T15:09:10.909386', '2025-11-18T15:09:10.909386', 'none', ARRAY[]::text[]),
('f166ebf5-7d9c-4bba-93e6-766c0ce25650', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Visita à escola municipal', 'Visitar Escola Municipal João Paulo II para inauguração da quadra', 'pending', 'low', 'João Ferreira', '2025-11-17T07:11:22.917', '2025-11-16T19:11:22.917527', '2025-11-19T20:27:10.902', 'none', NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. EVENTS (Agenda)
-- ============================================================================
INSERT INTO events (id, account_id, user_id, title, description, start_date, end_date, category, border_color, location, recurrence, reminder, reminder_minutes, created_at) VALUES
('7b457271-1fad-4fd0-b2af-6ef8f1a66e46', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'czxczxczxczxc', 'xzczxczxc', '2025-11-16T21:40:00', '2025-11-16T22:00:00', 'meeting', '#9333ea', 'dsdsasdasdasda', NULL, true, 5, '2025-11-16T21:25:42.293874'),
('bb15abb7-e9e2-45ef-a6e3-6f13d9cfe3f1', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'xcvvxcvxcv', 'cxvxcvxc', '2025-11-16T21:50:00', '2025-11-16T22:00:00', 'meeting', '#f97316', NULL, NULL, true, 5, '2025-11-16T21:40:27.956975'),
('611e595c-6bae-4489-939d-a8c945990eab', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'gfhgfhfhgf', 'fhgfghfhfh', '2025-11-16T22:00:00', '2025-11-16T22:05:00', 'meeting', '#3b82f6', NULL, NULL, true, 5, '2025-11-16T21:49:15.028047'),
('b6f16b9a-db56-4c81-9c69-320020191bdb', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'fgdfdfggdg', 'fgdfgdfg', '2025-11-17T21:00:00', '2025-11-17T17:00:00', 'meeting', '#14b8a6', 'dfgdfgdfg', NULL, true, 30, '2025-11-16T21:51:06.206084'),
('c972cb94-64fc-46ab-8e15-696a6e3bb202', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'ertretertret', 'erterter', '2025-11-17T14:00:00', '2025-11-17T22:00:00', 'meeting', '#ef4444', 'reergerg', NULL, true, 30, '2025-11-16T21:52:31.617076'),
('dc1a6342-381c-4f78-b844-001234d97c45', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'vxvxcvxcv', 'cvxcvxcvxc', '2025-11-16T23:00:00', '2025-11-16T23:30:00', 'personal', '#ef4444', 'vxcvxcvxcv', 'none', true, 5, '2025-11-16T22:13:05.698885'),
('d1942869-2a44-452a-b35c-d780805c3c31', '2dd828ec-34d6-4763-8c85-27a2e624f96a', '2dd828ec-34d6-4763-8c85-27a2e624f96a', 'teste', 'fdsfsdfs', '2025-11-19T15:00:00', '2025-11-19T16:00:00', 'meeting', '#3b82f6', 'salão', 'none', true, 30, '2025-11-18T15:09:53.680171'),
('f58218d9-5ec0-47fd-92da-7b9e3185e8e4', 'd422f9c6-fb93-40f4-b296-5b133e8216a4', '90a1d528-a3b9-4b72-aa45-78fbb44b0939', 'dsfsdfdsf', 'sdfdsfsdf', '2025-11-19T13:00:00', '2025-11-19T14:00:00', 'meeting', '#10b981', NULL, 'none', NULL, 30, '2025-11-19T12:21:10.861287'),
('e4b8bc16-9248-4154-b4b4-195029fa6652', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'dsfdsf', 'dsfdsfdsf', '2025-11-27T20:00:00', '2025-11-27T21:00:00', 'meeting', '#3b82f6', NULL, 'none', NULL, 30, '2025-11-27T18:11:54.584103')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. POLITICAL_ALLIANCES (Alianças Políticas)
-- Usa subquery para buscar party_id pela sigla (acronym)
-- ============================================================================
INSERT INTO political_alliances (id, account_id, user_id, party_id, ally_name, position, state, city, phone, email, notes, created_at) VALUES
('c5d360cb-b261-452f-a6dd-9c4f6f0e630f', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', (SELECT id FROM political_parties WHERE acronym = 'PL'), 'DAVID FLORES ANDRADE', 'Prefeito', NULL, NULL, '51983237805', 'teste@nyx.com.br', 'teste', '2025-11-16T17:32:05.623405'),
('c0a32186-3e7f-4275-b383-64974ecd029e', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', (SELECT id FROM political_parties WHERE acronym = 'PL'), 'DAVID FLORES ANDRADE', 'Vereador', 'RS', 'São Leopoldo', '51983237805', 'teste@nyx.com.br', 'teste', '2025-11-16T17:42:21.439833'),
('cbdb206b-09c1-40df-81e9-ed67d8ffe1c6', 'd422f9c6-fb93-40f4-b296-5b133e8216a4', '90a1d528-a3b9-4b72-aa45-78fbb44b0939', (SELECT id FROM political_parties WHERE acronym = 'AVANTE'), 'David Flores Andrade', 'Governador', 'RS', 'São Leopoldo', '(51) 11111-1111', 'davidntrs@hotmail.com', '', '2025-11-19T12:20:12.47144'),
('633a99f3-305a-4ddf-a574-6c4fa37eee38', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', (SELECT id FROM political_parties WHERE acronym = 'AGIR'), 'David Flores Andrade', 'Vereador', 'RS', 'São Leopoldo', '(51) 98323-7805', 'davidntrs@hotmail.com', 'muito obrigado.', '2025-12-15T17:14:07.883515')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 7. LEADS (Leads/Inbox)
-- ============================================================================
INSERT INTO leads (id, name, email, phone, position, state, city, message, created_at) VALUES
('10bc6e7c-ad73-4787-b9d6-c0201d635c5c', 'João Silva Teste', 'joao.teste@email.com', '(11) 99999-1234', 'Vereador', 'SP', 'São Paulo', 'Esta é uma mensagem de teste para verificar a funcionalidade de exclusão da caixa de entrada.', '2025-12-03T14:39:52.740084'),
('bb066fd5-137e-4b9a-8ecc-d7f97bbeb7f5', 'David Flores Andrade', 'davidntrs@hotmail.com', '(51) 11111-1111', 'Governador', 'Rio Grande do Sul', 'São Leopoldo', '', '2025-12-03T14:44:11.221336')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 8. MARKETING_CAMPAIGNS (Campanhas de Marketing)
-- ============================================================================
INSERT INTO marketing_campaigns (id, account_id, user_id, name, type, subject, message, recipients, scheduled_for, status, sent_at, created_at) VALUES
('189c1897-8af2-4d3f-af5f-e5dbcdc81ec3', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'Campanha de Teste - Boas Vindas', 'email', 'Bem-vindo à nossa plataforma!', 'Olá! Esta é uma campanha teste para demonstrar o sistema de campanhas de marketing. Aqui você pode criar campanhas de email ou WhatsApp, agendar envios e gerenciar seus contatos.', '["exemplo1@email.com", "exemplo2@email.com", "exemplo3@email.com"]', '2025-11-18T01:09:31.351', 'draft', NULL, '2025-11-17T01:09:31.371824')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 9. AI_CONFIGURATIONS (Configurações de IA - SEM API KEYS por segurança)
-- ============================================================================
INSERT INTO ai_configurations (id, account_id, user_id, mode, updated_at) VALUES
('734bfd4f-37b1-42de-b89c-a26cfcfa183a', 'd422f9c6-fb93-40f4-b296-5b133e8216a4', '90a1d528-a3b9-4b72-aa45-78fbb44b0939', 'formal', '2025-11-19T12:21:20.096616'),
('39b6afb2-7ccf-4a20-a597-b54fe53c4b8c', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'd0476e06-f1b0-4204-8280-111fa6478fc9', 'formal', '2025-12-15T15:42:15.118')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- MIGRAÇÃO CONCLUÍDA!
-- As API keys de OpenAI devem ser reconfiguradas manualmente por segurança.
-- ============================================================================
SELECT 'Migração concluída com sucesso!' as status;
