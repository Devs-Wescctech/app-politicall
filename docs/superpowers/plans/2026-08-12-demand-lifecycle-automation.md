# Plano de implementacao da automacao de demandas

1. Criar testes de dominio para classificacao de alertas e validacao de anexos.
2. Adicionar migracao `0016_demand_lifecycle_automation.sql` e registrar nos executores.
3. Implementar servicos de anexos e alertas com isolamento por conta e idempotencia.
4. Integrar notificacoes transacionais nas alteracoes de responsavel e status.
5. Adicionar rotas autenticadas de lista, upload, download e exclusao.
6. Implementar a aba de anexos na pagina Demandas e testes de componente.
7. Aplicar a migracao somente no PostgreSQL local isolado.
8. Executar testes focados, suite completa, TypeScript, build, seguranca e QA no navegador.
9. Atualizar `docs/DEMANDAS.md` e criar checkpoint Git local, sem publicar.
