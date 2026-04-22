---
mode: 'agent'
description: 'Drop and recreate the database schema then re-run seed data'
---

Reset the `github_support` PostgreSQL database to a clean state.

## Steps (run in order)

```bash
# 1. Drop + recreate the database
docker compose exec db psql -U postgres -c "DROP DATABASE IF EXISTS github_support;"
docker compose exec db psql -U postgres -c "CREATE DATABASE github_support;"

# 2. Enable pgvector extension
docker compose exec db psql -U postgres -d github_support \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 3. Apply schema
npm run db:migrate -w packages/backend

# 4. Seed test data
npm run db:seed -w packages/backend
```

## Verification

After the reset, confirm the following tables exist and have rows:

```sql
-- Run via: docker compose exec db psql -U postgres -d github_support
\dt
SELECT COUNT(*) FROM support_cases;
SELECT COUNT(*) FROM orgs;
SELECT COUNT(*) FROM document_chunks;
```

## Schema file

[packages/backend/src/db/schema.sql](../../packages/backend/src/db/schema.sql)

## Seed file

[packages/backend/src/db/seed.ts](../../packages/backend/src/db/seed.ts)

## What to do

Execute the full database reset sequence above. Report the row counts from
the verification queries so I can confirm the seed ran correctly.
Warn me before dropping the database and wait for confirmation.
