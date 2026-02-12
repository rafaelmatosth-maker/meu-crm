# Backend - Meu CRM

API REST em Node.js + Express + PostgreSQL.

## Rodar localmente

1. Copie `.env.example` para `.env` e ajuste os valores.
2. Se usar Supabase, preencha `DATABASE_URL` (com `sslmode=require`).
3. Instale dependências:

```bash
npm install
```

4. Inicie o servidor:

```bash
npm run dev
```

Servidor: `http://localhost:3000`

## Multi-tenant (escritórios)

- O backend usa `X-Escritorio-Id` para definir o contexto do escritório.
- Se o header não for enviado, usa o `escritorio_id` do token.
- Login e `/auth/me` retornam `escritorios` e `escritorio_atual`.
- Migration: `database/migrations/20260212_multi_tenant_escritorios.sql`

## Rotas

- `POST /auth/login`
- `POST /auth/register/start`
- `POST /auth/register/verify`
- `GET /auth/oauth/google/start`
- `GET /auth/oauth/google/callback`
- `GET /auth/oauth/apple/start`
- `GET /auth/oauth/apple/callback`
- `POST /auth/logout`
- `GET /auth/me`

- `GET /escritorios`
- `POST /escritorios`
- `GET /escritorios/:id/membros`
- `POST /escritorios/:id/colaboradores`

- `GET /clientes`
- `POST /clientes`
- `PUT /clientes/:id`
- `DELETE /clientes/:id`

- `GET /processos`
- `POST /processos`
- `PUT /processos/:id`
- `DELETE /processos/:id`
- `GET /processos/:id/andamentos`
- `POST /processos/:id/andamentos/sync`
- `POST /processos/:id/andamentos/seen`
- `GET /processos/:id/andamentos/logs`

- `GET /atividades`
- `POST /atividades`
- `PUT /atividades/:id`
- `DELETE /atividades/:id`

- `GET /documentos?processo_id=1`
- `POST /documentos` (multipart/form-data: `processo_id` e `arquivo`)
- `GET /documentos/:id/download`
- `DELETE /documentos/:id`

- `GET /publicacoes-djen?oab=SP123456&uf=SP&data=2026-02-11&page=1&limit=20`

## Filtros e paginação

As rotas de listagem aceitam `page`, `limit` e filtros:

- `GET /clientes?search=ana&status=ativo`
- `GET /processos?cliente_id=1&status=Em%20andamento`
- `GET /atividades?processo_id=1&prioridade=alta&search=defesa`

## DataJud (andamentos)

Para habilitar a sincronização automática de andamentos:

- `DATAJUD_API_KEY`: chave pública da API do DataJud.
- `DATAJUD_AUTO_SYNC`: defina como `false` para não sincronizar automaticamente em criação/edição.
- `DATAJUD_STALE_HOURS`: horas para considerar dados desatualizados (padrão: 24).
- `DATAJUD_DAILY_SYNC`: defina como `false` para desativar o sync diário automático (padrão: ativo).
- `DATAJUD_DAILY_HOUR`: hora do sync diário (padrão: 3).
- `DATAJUD_DAILY_MINUTE`: minuto do sync diário (padrão: 0).

## DJEN (publicações)

- `DJEN_API_BASE`: URL base da API pública do DJEN (padrão: `https://comunicaapi.pje.jus.br/api/v1`).
- `DJEN_TIMEOUT_MS`: timeout da consulta em milissegundos (padrão: `15000`).

## E-mail (cadastro com verificação)

- `EMAIL_PROVIDER`: `resend`
- `RESEND_API_KEY`: chave da API do Resend
- `EMAIL_FROM`: remetente validado no provedor (ex.: `no-reply@seudominio.com`)
- `CADASTRO_CODE_TTL_MINUTES`: validade do código (padrão: `10`)
- `CADASTRO_MAX_ATTEMPTS`: limite de tentativas (padrão: `5`)

## OAuth social (Google e Apple/iCloud)

- `OAUTH_GOOGLE_CLIENT_ID`
- `OAUTH_GOOGLE_CLIENT_SECRET`
- `OAUTH_GOOGLE_CALLBACK_URL`
- `OAUTH_APPLE_CLIENT_ID`
- `OAUTH_APPLE_TEAM_ID`
- `OAUTH_APPLE_KEY_ID`
- `OAUTH_APPLE_PRIVATE_KEY` (private key em linha única com `\\n`)
- `OAUTH_APPLE_CALLBACK_URL`

Migration adicional para ambiente existente:

- `database/migrations/20260212_oauth_google_apple.sql`

Migration adicional para ambiente existente:

- `database/migrations/20260212_email_verification_signup.sql`

## Exemplos (escritórios)

- Criar escritório:
  - `POST /escritorios` com body `{ "nome": "Meu Escritório" }`
- Criar colaborador:
  - `POST /escritorios/1/colaboradores` com body `{ "nome": "Maria", "email": "maria@x.com", "senha": "Senha123!", "papel": "colaborador" }`
