# Meu CRM (local)

Aplicação web local estilo mini-CRM com backend, frontend e banco PostgreSQL.

## Requisitos

- Node.js
- PostgreSQL

## Passo a passo (execução local)

1. Instale o Node.js.
2. Instale o PostgreSQL.
3. Crie um banco local chamado `meu_crm`.
4. Rode o schema e o seed:

```bash
psql -U postgres -d meu_crm -f ./database/schema.sql
psql -U postgres -d meu_crm -f ./database/seed.sql
```

5. Configure o arquivo `.env` no backend:

```bash
cp ./backend/.env.example ./backend/.env
```

Se for usar Supabase/Postgres remoto, configure `DATABASE_URL` no `backend/.env`.
Se `DATABASE_URL` estiver preenchida, ela tem prioridade sobre `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`.

6. (Opcional) Execute a migration de multi-tenant no banco remoto:

```bash
psql "<DATABASE_URL>" -f ./database/migrations/20260212_multi_tenant_escritorios.sql
```

7. (Opcional) Para habilitar cadastro com verificação por e-mail em banco existente:

```bash
psql "<DATABASE_URL>" -f ./database/migrations/20260212_email_verification_signup.sql
```

8. (Opcional) Para habilitar login social (Google/Apple) em banco existente:

```bash
psql "<DATABASE_URL>" -f ./database/migrations/20260212_oauth_google_apple.sql
```

9. Instale as dependências do backend:

```bash
cd ./backend
npm install
```

10. Inicie o servidor:

```bash
npm run dev
```

11. Abra o frontend:

- Acesse `http://localhost:3000` para o frontend servido pelo backend.
- Alternativamente, abra `frontend/pages/login.html` com Live Server.

## Credenciais iniciais

- Email: `admin@local.dev`
- Senha: `Admin123!`

## Estrutura

- `backend/`: API Node.js + Express
- `frontend/`: páginas HTML + JS
- `database/`: schema e seed

## Upload de documentos

Os documentos são enviados na tela de Processos e ficam armazenados em `backend/uploads`.
