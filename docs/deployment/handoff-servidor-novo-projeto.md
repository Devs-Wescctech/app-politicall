# Passagem tecnica do servidor para publicar um novo projeto

Documento sanitizado para entregar a outra IA ou a um operador. Ele registra somente a topologia e os procedimentos observados. Senhas, tokens, cookies, chaves privadas e strings de conexao completas foram deliberadamente omitidos.

## Instrucao pronta para a outra IA

> Voce vai publicar um projeto novo no servidor descrito neste documento. Antes de alterar qualquer recurso, faca somente inventario e preflight. Nao pare, remova, recrie, renomeie ou conecte containers existentes. Nao altere o Politicall, Nginx de outros dominios, PostgreSQL compartilhado, Portainer, redes ou volumes existentes. O novo projeto deve ter diretorio, stack, container, porta local, dominio, volume e banco/schema exclusivos. Valide conflitos antes do deploy, faca backup do que sera alterado, use imagem imutavel por digest, mantenha rollback documentado e somente abra trafego depois de healthcheck, logs e teste HTTP/HTTPS aprovados. Nunca imprima secrets no terminal, logs ou relatorio.

## Ambiente observado

| Item | Informacao confirmada |
| --- | --- |
| Host | Ubuntu Server 24.04.3 LTS, Linux x86_64 |
| Endereco interno observado | `172.27.34.100` |
| Administracao de containers | Portainer Community Edition, exposto em HTTPS na porta `9443` |
| Runtime | Docker Engine + Docker Compose v2 |
| Proxy reverso | Nginx `1.24.0` instalado no host |
| Registry utilizado | GitHub Container Registry, `ghcr.io` |
| Diretorio do Politicall | `/var/www/html/app-politicall` |
| Compose do Politicall | `/var/www/html/app-politicall/docker-compose.yml` |
| Uploads persistentes | `/var/www/html/app-politicall/uploads` montado em `/app/uploads` |
| Dominio principal | `https://politicall.com.br` |
| Alias observado | `https://www.politicall.com.br` |
| Aplicacao Politicall | Container `app-politicall`, porta interna `5000` |
| Porta publicada do Politicall | Host `5000` para container `5000` |
| Imagem do Politicall | `ghcr.io/devs-wescctech/app-politicall`, preferencialmente fixada por digest |
| Politica de reinicio | `unless-stopped` |
| Banco | PostgreSQL separado da aplicacao; nao e criado pelo Compose do Politicall |

O banco observado estava no mesmo servidor, mas em outro contexto/container Docker. A configuracao legada do Politicall acessava o PostgreSQL por um endereco do host Docker. Para um projeto novo, prefira uma rede Docker dedicada/compartilhada controlada e o nome DNS do container do banco, sem publicar PostgreSQL para a internet.

## Recursos existentes que nao podem ser afetados

No Portainer foram observados diversos sistemas alem do Politicall, incluindo aplicacoes, N8N, APIs, bancos e stacks independentes. Alguns nomes vistos foram:

- `app-politicall`
- `app-bomflow`
- `app-n8n-n8n-1`
- `app-salestwo`
- `app-unycoprod`
- `infra-api-1`
- `infra-web-1`
- `neo-tempus-api`
- `neo-tempus-postgres`
- `peticoesbr-backend`

Essa lista e apenas um inventario parcial. A outra IA deve executar um inventario somente leitura antes de escolher nomes, portas, redes e volumes. A ausencia de um recurso nesta lista nao significa que ele esteja livre.

## Nginx observado

Os arquivos do Politicall foram localizados em:

```text
/etc/nginx/sites-available/politicall.conf
/etc/nginx/sites-enabled/politicall.conf
```

Tambem existe configuracao separada para `crm.politicall.com.br`. Portanto, nunca sobrescrever arquivos genericos nem reutilizar um `server_name` existente.

Para o novo projeto:

1. Criar um arquivo exclusivo em `/etc/nginx/sites-available/<novo-projeto>.conf`.
2. Criar o link simbolico correspondente em `sites-enabled` somente depois da revisao.
3. Apontar `proxy_pass` para `127.0.0.1:<porta-exclusiva>`.
4. Se houver WebSocket, configurar `Upgrade`, `Connection`, HTTP/1.1 e timeouts adequados.
5. Executar `sudo nginx -t` antes de qualquer reload.
6. Usar `sudo systemctl reload nginx`; nao reiniciar Nginx sem necessidade.
7. Validar HTTP, HTTPS, certificado, redirecionamento e WebSocket antes de concluir.

O Politicall usa o endpoint WebSocket exato `/api/attendance/realtime`. Esse endpoint e especifico do Politicall e nao deve ser copiado para outro sistema sem que o novo projeto realmente possua o mesmo contrato.

## Padrao seguro para o novo projeto

Cada projeto novo deve possuir:

- pasta exclusiva: `/var/www/html/<novo-projeto>`;
- stack exclusiva no Portainer;
- `container_name` exclusivo;
- imagem exclusiva e imutavel no GHCR;
- porta de host exclusiva, vinculada preferencialmente a `127.0.0.1`;
- rede Docker exclusiva ou uma rede externa previamente aprovada;
- volume/pasta persistente exclusivo;
- banco, database ou schema exclusivo, com usuario de menor privilegio;
- dominio/subdominio exclusivo;
- arquivo Nginx exclusivo;
- healthcheck e readiness próprios;
- limites de memoria, processos, logs e arquivos;
- backup e rollback testados.

Nunca reutilizar no projeto novo:

- porta `5000`, sem confirmar que ela esta livre;
- nome `app-politicall`;
- pasta `/var/www/html/app-politicall`;
- volume `/var/www/html/app-politicall/uploads`;
- database `politicall`;
- secrets do Politicall;
- rede do Politicall sem aprovacao e justificativa;
- configuracao Nginx do dominio `politicall.com.br`.

## Preflight somente leitura

Executar estes comandos antes de decidir qualquer configuracao. Eles nao alteram o servidor:

```bash
hostnamectl
df -h
free -h
docker version
docker compose version
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker network ls
docker volume ls
sudo ss -lntup
sudo nginx -T >/tmp/nginx-inventory.txt
sudo nginx -t
```

Nao anexar o conteudo integral de `docker inspect`, `docker compose config`, arquivos `.env` ou `nginx -T` ao relatorio: esses comandos podem revelar secrets. Extraia apenas nomes, portas, redes, mounts e estados, removendo valores sensiveis.

## Checklist de escolha de porta e dominio

1. Confirmar que a porta nao aparece em `docker ps` nem em `ss -lntup`.
2. Publicar a porta somente em loopback: `127.0.0.1:<porta>:<porta-container>`.
3. Confirmar que o DNS do novo dominio aponta para o servidor correto.
4. Confirmar que nenhum `server_name` existente usa o dominio.
5. Emitir certificado apenas depois do DNS e do Nginx estarem corretos.
6. Nao expor diretamente a porta da aplicacao na internet quando Nginx for o ponto de entrada.

## Modelo de Compose para adaptar

O modelo abaixo e intencionalmente generico e nao contem credenciais:

```yaml
services:
  app:
    image: "${IMAGE_REFERENCE:?required}"
    container_name: "${CONTAINER_NAME:?required}"
    restart: unless-stopped
    stop_grace_period: 30s
    ports:
      - "127.0.0.1:${APP_PORT:?required}:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: "${DATABASE_URL:?required}"
      SESSION_SECRET: "${SESSION_SECRET:?required}"
      PUBLIC_APP_URL: "${PUBLIC_APP_URL:?required}"
    volumes:
      - "${DATA_HOST_PATH:?required}:/app/data"
    networks:
      - app_network
    mem_limit: 1g
    memswap_limit: 2g
    pids_limit: 256
    security_opt:
      - no-new-privileges:true
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

networks:
  app_network:
    external: true
    name: "${APP_NETWORK_NAME:?required}"
```

O `healthcheck`, porta interna, volume e variaveis devem ser adaptados ao contrato real do novo projeto. Nao copiar cegamente este exemplo.

## Registry e pipeline

O fluxo observado usa GitHub Actions e GHCR. O padrao recomendado e:

1. Pull request executa typecheck, testes, build e auditoria de seguranca.
2. Merge na `main` cria imagem Docker.
3. A imagem e analisada antes da publicacao.
4. A imagem publicada recebe tag imutavel `sha-<commit>`.
5. Produção usa preferencialmente `ghcr.io/<org>/<projeto>@sha256:<digest>`.
6. Portainer guarda credencial GHCR somente para leitura do package privado.
7. Nunca usar apenas `latest` como referencia de deploy ou rollback.

## Banco de dados

Regras para o projeto novo:

- nao usar o database `politicall`;
- nao usar o usuario do Politicall;
- nao colocar senha no Compose versionado;
- criar usuario e database exclusivos;
- restringir acesso por rede e firewall;
- executar migrations aditivas e idempotentes;
- fazer backup antes de migrations destrutivas;
- registrar ordem, versao e resultado das migrations;
- testar rollback ou restauracao;
- nunca remover ou recriar o container PostgreSQL compartilhado.

Se o novo projeto exigir seu proprio PostgreSQL, use container, volume, rede, database e politica de backup exclusivos. Se usar o PostgreSQL existente, obter aprovacao explicita e criar somente recursos isolados para o novo projeto.

## Segredos

Guardar secrets no Portainer, secret manager ou arquivo com permissao restrita no host. Nunca enviar para a IA:

- senhas de banco;
- `SESSION_SECRET`;
- chaves de criptografia;
- tokens GHCR/GitHub;
- tokens WHU, SMS, e-mail ou WhatsApp;
- private keys e certificados;
- cookies ou Authorization headers;
- arquivos `.env` completos.

Se algum secret ja tiver sido colado em chat, issue, commit ou log, considerar comprometido e rotacionar antes da publicacao.

## Backup minimo antes do deploy

O backup deve cobrir o estado que o novo deploy pode alterar:

- dump consistente do banco/database do novo projeto;
- volume ou pasta persistente do novo projeto;
- Compose/stack anterior;
- arquivo Nginx anterior;
- digest da imagem em execucao;
- hashes dos artefatos de backup;
- comando e criterio de rollback.

Nao criar backup apenas com `docker commit`: imagem de container nao substitui dump do banco nem copia do volume persistente.

## Sequencia recomendada de deploy

1. Inventario somente leitura.
2. Definicao de nomes, porta, dominio, rede, volume e banco exclusivos.
3. Validacao do pipeline e da imagem por digest.
4. Backup e registro do rollback.
5. Criacao da pasta e do volume do novo projeto.
6. Criacao controlada de rede/banco exclusivos, se necessario.
7. Validacao do Compose com `docker compose config --quiet`.
8. Pull da imagem exata.
9. Subida apenas da stack nova.
10. Espera do healthcheck.
11. Teste direto em `127.0.0.1:<porta>`.
12. Criacao e teste da configuracao Nginx.
13. Emissao/validacao TLS.
14. Smoke test externo completo.
15. Revisao de logs sem expor secrets.
16. Entrega do relatorio com evidencia e rollback.

## Validacao obrigatoria

```bash
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 app
curl -fsS http://127.0.0.1:<porta>/api/health
sudo nginx -t
curl -fsSI https://<novo-dominio>/
```

Tambem validar manualmente:

- login e logout, quando existirem;
- uma operacao de leitura e uma de escrita;
- assets estaticos;
- upload persistente, quando existir;
- WebSocket/SSE, quando existir;
- reinicio do container sem perda de dados;
- cookies `Secure`, `HttpOnly` e `SameSite`;
- ausencia de erros no console do navegador;
- ausencia de erros repetitivos nos logs.

## Criterios para interromper o trabalho

A outra IA deve parar e pedir decisao antes de prosseguir se encontrar:

- porta, dominio, container, rede, volume ou pasta ja ocupados;
- necessidade de alterar stack de outro sistema;
- necessidade de reiniciar Docker, PostgreSQL, Portainer ou o servidor inteiro;
- migration destrutiva sem backup validado;
- falta de credencial armazenada de forma segura;
- imagem sem digest ou sem testes aprovados;
- Nginx invalido;
- healthcheck falhando;
- falta de espaco em disco ou memoria;
- qualquer comando que possa remover dados ou afetar outros containers.

## Informacoes que ainda precisam ser fornecidas para o novo projeto

- nome tecnico do projeto;
- repositorio GitHub;
- imagem GHCR ou Dockerfile;
- dominio/subdominio desejado;
- porta interna da aplicacao;
- healthcheck real;
- necessidade de banco e tipo de banco;
- necessidade de uploads/volumes;
- variaveis obrigatorias, sem seus valores;
- consumo esperado de CPU/memoria;
- estrategia de migrations;
- estrategia de backup e retencao;
- responsavel pela aprovacao do deploy;
- janela de manutencao e criterio de rollback.

## Observacao final

O servidor hospeda varios sistemas. O principio principal para o projeto novo e isolamento: nao aproveitar nomes, portas, pastas, volumes, databases ou configuracoes existentes por conveniencia. O deploy so esta concluido quando a stack nova esta saudavel, o dominio responde por HTTPS, os dados persistem apos restart e nenhum sistema preexistente sofreu alteracao ou indisponibilidade.
