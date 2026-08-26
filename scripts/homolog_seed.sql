-- Fictitious, idempotent data for the isolated homologation environment only.
BEGIN;

INSERT INTO accounts (id, name, created_at)
VALUES ('b2222222-2222-2222-2222-222222222222', 'Gabinete Politicall Homologação', now())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO users (
  id, account_id, email, name, password, role, political_position,
  permissions, slug, created_at
)
VALUES (
  'e2222222-2222-4222-8222-222222222222',
  'b2222222-2222-2222-2222-222222222222',
  'adm.homolog@politicall.local',
  'Administradora de Homologação',
  '$2b$10$9ss0AsG3SwRyR8bPMR6t7uwo.icU3.zKjekW2haqrao0SYHfycFSe',
  'admin',
  'Vereadora',
  '{"dashboard":true,"contacts":true,"alliances":true,"demands":true,"agenda":true,"ai":true,"marketing":true,"petitions":true,"users":true,"settings":true,"whatsappAttendance":true,"emailAttendance":true,"socialAttendance":true,"attendanceReports":true,"attendanceSettings":true,"attendanceView":true,"attendanceAssume":true,"attendanceRelease":true,"attendanceTransfer":true,"attendanceClose":true,"attendanceReopen":true,"attendancePause":true,"attendanceReply":true,"attendanceReplyAny":true,"attendanceChangePriority":true,"attendanceChangeAssignee":true,"attendanceManageQueues":true,"attendanceManageDepartments":true,"attendanceManageTags":true,"attendanceFullHistory":true,"attendanceAudit":true,"attendanceExport":true,"attendanceEditMessages":true,"attendanceDeleteMessages":true}'::jsonb,
  'homologacao',
  now()
)
ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password,
  permissions = EXCLUDED.permissions;

INSERT INTO contacts (id, account_id, user_id, name, email, phone, state, city, source, created_at)
VALUES
  ('cnt-hml-001', 'b2222222-2222-2222-2222-222222222222', 'e2222222-2222-4222-8222-222222222222', 'Pessoa Teste Um', 'pessoa1@politicall.local', '(00) 90000-0001', 'RS', 'Cidade Teste', 'Homologação', now()),
  ('cnt-hml-002', 'b2222222-2222-2222-2222-222222222222', 'e2222222-2222-4222-8222-222222222222', 'Pessoa Teste Dois', 'pessoa2@politicall.local', '(00) 90000-0002', 'RS', 'Cidade Teste', 'Homologação', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO demands (id, account_id, user_id, title, description, status, priority, created_at, updated_at)
VALUES ('dem-hml-001', 'b2222222-2222-2222-2222-222222222222', 'e2222222-2222-4222-8222-222222222222', 'Demanda fictícia de homologação', 'Registro sem dados pessoais reais.', 'pending', 'medium', now(), now())
ON CONFLICT (id) DO NOTHING;

COMMIT;
