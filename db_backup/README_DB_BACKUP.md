# Backup do Banco de Dados - POLITICALL

## Informações do Banco

| Campo | Valor |
|-------|-------|
| **Tipo de Banco** | PostgreSQL |
| **ORM** | Drizzle ORM |
| **Provider** | Neon Serverless (compatível com qualquer PostgreSQL) |
| **Data do Backup** | 08/12/2025 |

## Estrutura do Banco

O banco contém as seguintes tabelas principais:

- `accounts` - Contas/Gabinetes políticos
- `users` - Usuários do sistema
- `contacts` - Contatos/Eleitores
- `demands` - Demandas do gabinete
- `events` - Agenda de eventos
- `political_parties` - Partidos políticos brasileiros (29 partidos)
- `political_alliances` - Alianças políticas
- `ai_configurations` - Configurações de IA
- `marketing_campaigns` - Campanhas de marketing
- `notifications` - Notificações
- `survey_campaigns` - Campanhas de pesquisa
- E outras tabelas auxiliares

## Como Restaurar o Backup

### Opção 1: Usando psql (linha de comando)

```bash
# Substitua as variáveis pelos seus valores
export PGHOST=seu_host
export PGPORT=5432
export PGUSER=seu_usuario
export PGPASSWORD=sua_senha
export PGDATABASE=seu_banco

# Restaurar o backup
psql "$DATABASE_URL" < db_backup/backup_YYYYMMDD_HHMMSS.sql
```

### Opção 2: Usando DATABASE_URL diretamente

```bash
psql "postgresql://usuario:senha@host:porta/banco" < db_backup/backup_YYYYMMDD_HHMMSS.sql
```

### Opção 3: Via Drizzle (recomendado para novo ambiente)

1. Configure a variável `DATABASE_URL` no seu `.env`
2. Execute as migrações:
```bash
npm run db:push
```
3. Depois restaure os dados:
```bash
psql "$DATABASE_URL" < db_backup/backup_YYYYMMDD_HHMMSS.sql
```

## Variáveis de Ambiente Necessárias

Crie um arquivo `.env` com:

```env
DATABASE_URL=postgresql://usuario:senha@host:porta/banco
```

Ou configure individualmente:

```env
PGHOST=seu_host
PGPORT=5432
PGUSER=seu_usuario
PGPASSWORD=sua_senha
PGDATABASE=seu_banco
```

## Notas Importantes

1. **Senhas de usuários**: Estão hasheadas com bcrypt, são seguras
2. **Partidos políticos**: Já incluem todos os 29 partidos brasileiros de 2025
3. **Permissões**: O backup não inclui permissões do banco, apenas dados e estrutura
4. **Ordem de restauração**: O SQL já está na ordem correta de dependências

## Suporte

Desenvolvido por: David Flores Andrade
Website: www.politicall.com.br
