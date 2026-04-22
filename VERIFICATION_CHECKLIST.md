# Installation Verification Checklist

Use this checklist to verify that Phase 1 is correctly installed and working.

## ✅ Prerequisites

- [ ] Node.js 24.x or higher installed
  ```bash
  node --version
  # Expected: v24.x.x or higher
  ```

- [ ] Docker and Docker Compose installed
  ```bash
  docker --version
  docker compose version
  ```

- [ ] npm 10.x or higher installed
  ```bash
  npm --version
  # Expected: 10.x.x or higher
  ```

---

## ✅ Project Setup

- [ ] Project files extracted to working directory
  ```bash
  cd github-support-system
  ls -la
  # Should see: package.json, docker-compose.yml, packages/, etc.
  ```

- [ ] Environment file created
  ```bash
  cp .env.example .env
  # Then edit .env and add API keys
  ```

- [ ] Dependencies installed
  ```bash
  npm install
  # Should complete without errors
  ```

---

## ✅ Infrastructure

- [ ] Docker containers started
  ```bash
  npm run docker:up
  # Wait 10-15 seconds for containers to be ready
  ```

- [ ] PostgreSQL container healthy
  ```bash
  docker ps | grep postgres
  # Should show status as "healthy"
  ```

- [ ] Redis container healthy
  ```bash
  docker ps | grep redis
  # Should show status as "healthy"
  ```

- [ ] PostgreSQL accessible
  ```bash
  docker exec -it github-support-postgres psql -U github_support -d github_support -c "SELECT 1;"
  # Should return: 1
  ```

- [ ] Redis accessible
  ```bash
  docker exec -it github-support-redis redis-cli PING
  # Should return: PONG
  ```

---

## ✅ Database Schema

- [ ] All 16 tables created
  ```bash
  docker exec -it github-support-postgres psql -U github_support -d github_support -c "\dt"
  # Should list 16 tables
  ```

- [ ] pgvector extension installed
  ```bash
  docker exec -it github-support-postgres psql -U github_support -d github_support -c "\dx"
  # Should show "vector" extension
  ```

- [ ] Vector index exists
  ```bash
  docker exec -it github-support-postgres psql -U github_support -d github_support -c "\di"
  # Should show idx_document_chunks_embedding
  ```

---

## ✅ Seed Data

- [ ] Seed script runs successfully
  ```bash
  npm run db:seed
  # Should complete with "Database seed completed successfully!"
  ```

- [ ] Customers created
  ```bash
  docker exec -it github-support-postgres psql -U github_support -d github_support -c "SELECT COUNT(*) FROM customers;"
  # Expected: 2
  ```

- [ ] GitHub orgs created
  ```bash
  docker exec -it github-support-postgres psql -U github_support -d github_support -c "SELECT COUNT(*) FROM github_orgs;"
  # Expected: 3
  ```

- [ ] Support cases created
  ```bash
  docker exec -it github-support-postgres psql -U github_support -d github_support -c "SELECT COUNT(*) FROM support_cases;"
  # Expected: 11 (8 active scenarios + 3 historical)
  ```

- [ ] All 8 scenarios present
  ```bash
  docker exec -it github-support-postgres psql -U github_support -d github_support -c "SELECT case_id, title FROM support_cases WHERE status = 'open' ORDER BY created_at;"
  # Should show 8 different scenarios
  ```

---

## ✅ Backend Application

- [ ] Backend compiles without errors
  ```bash
  cd packages/backend
  npm run build
  # Should complete with no TypeScript errors
  ```

- [ ] Backend starts successfully
  ```bash
  npm run dev:backend
  # Should show:
  # - "Database connection: OK"
  # - "Redis connection: OK"
  # - "All systems operational"
  ```

- [ ] Environment variables validated
  ```bash
  # If any required env var is missing, backend should fail with clear error
  # Try removing ANTHROPIC_API_KEY from .env temporarily to test
  ```

- [ ] Graceful shutdown works
  ```bash
  # While backend is running, press Ctrl+C
  # Should show "Graceful shutdown complete" without errors
  ```

---

## ✅ Code Quality

- [ ] No TypeScript errors in backend
  ```bash
  cd packages/backend
  npx tsc --noEmit
  # Should exit with code 0
  ```

- [ ] All imports use 'node:' prefix
  ```bash
  grep -r "from 'fs'" packages/backend/src/
  # Should return nothing (should be 'node:fs')
  ```

- [ ] No 'any' types in code
  ```bash
  grep -r ": any" packages/backend/src/
  # Should return nothing
  ```

- [ ] No console.log in production code
  ```bash
  grep -r "console.log" packages/backend/src/ | grep -v "test"
  # Should return nothing
  ```

---

## ✅ Database Verification Queries

Run these queries to verify data integrity:

### Check Scenario 1 (Entitlement Dispute)
```sql
SELECT 
  sc.title,
  e.feature_name,
  e.enabled,
  e.source
FROM support_cases sc
JOIN entitlements e ON e.scope_id = sc.org_id
WHERE sc.title LIKE '%Actions minutes%';
```
**Expected:** One row showing github_actions_minutes disabled due to plan_limit

### Check Scenario 2 (Billing)
```sql
SELECT 
  sc.title,
  i.payment_status,
  i.amount,
  s.active_status
FROM support_cases sc
JOIN invoices i ON i.customer_id = sc.customer_id
JOIN subscriptions s ON s.scope_id = sc.org_id
WHERE sc.title LIKE '%premium features%locked%';
```
**Expected:** One row showing overdue invoice and inactive subscription

### Check Scenario 3 (PAT)
```sql
SELECT 
  sc.title,
  tr.sso_authorized,
  tr.permissions
FROM support_cases sc
JOIN token_records tr ON tr.org_id = sc.org_id
WHERE sc.title LIKE '%Personal Access Token%403%';
```
**Expected:** One row showing PAT with sso_authorized = false

### Check Scenario 6 (Repeated Auth)
```sql
SELECT 
  COUNT(*) as case_count,
  customer_id
FROM support_cases
WHERE issue_category = 'auth_token'
  OR title LIKE '%auth%'
GROUP BY customer_id
HAVING COUNT(*) >= 3;
```
**Expected:** At least one customer with 3+ auth-related cases

---

## ✅ File Structure

- [ ] All configuration files present
  ```bash
  test -f .env.example && \
  test -f docker-compose.yml && \
  test -f package.json && \
  echo "✓ Root config files OK"
  ```

- [ ] All backend source files present
  ```bash
  test -f packages/backend/src/config/env.ts && \
  test -f packages/backend/src/errors/index.ts && \
  test -f packages/backend/src/lib/logger.ts && \
  test -f packages/backend/src/lib/database.ts && \
  test -f packages/backend/src/types/index.ts && \
  test -f packages/backend/src/db/schema.sql && \
  test -f packages/backend/src/db/seed.ts && \
  echo "✓ Backend source files OK"
  ```

- [ ] All documentation files present
  ```bash
  test -f README.md && \
  test -f QUICK_START.md && \
  test -f ARCHITECTURE.md && \
  test -f PROJECT_STRUCTURE.md && \
  test -f PHASE_1_COMPLETE.md && \
  test -f PHASE_2_GUIDE.md && \
  echo "✓ Documentation files OK"
  ```

---

## ✅ Network Connectivity

- [ ] Can connect to PostgreSQL from host
  ```bash
  psql postgresql://github_support:dev_password_change_in_prod@localhost:5432/github_support -c "SELECT 1;"
  # Should return: 1
  ```

- [ ] Can connect to Redis from host
  ```bash
  redis-cli -h localhost -p 6379 PING
  # Should return: PONG
  ```

---

## 🐛 Troubleshooting

### If PostgreSQL won't start:
```bash
# Check logs
docker logs github-support-postgres

# Check if port 5432 is already in use
lsof -i :5432

# If port is taken, edit docker-compose.yml to use different port
```

### If Redis won't start:
```bash
# Check logs
docker logs github-support-redis

# Check if port 6379 is already in use
lsof -i :6379
```

### If seed fails:
```bash
# Drop and recreate schema
docker exec -it github-support-postgres psql -U github_support -d github_support -f /docker-entrypoint-initdb.d/01-schema.sql

# Try seed again
npm run db:seed
```

### If backend won't start:
```bash
# Check .env file has all required variables
cat .env

# Check for TypeScript errors
cd packages/backend
npx tsc --noEmit

# Check if dependencies are installed
npm install
```

---

## ✅ Final Verification

Run all checks at once:

```bash
#!/bin/bash
echo "🔍 Running full verification..."

# Check Node version
echo -n "Node.js version: "
node --version

# Check containers
echo -n "PostgreSQL: "
docker ps | grep postgres | grep healthy > /dev/null && echo "✅ Healthy" || echo "❌ Not healthy"

echo -n "Redis: "
docker ps | grep redis | grep healthy > /dev/null && echo "✅ Healthy" || echo "❌ Not healthy"

# Check tables
echo -n "Database tables: "
TABLE_COUNT=$(docker exec github-support-postgres psql -U github_support -d github_support -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
if [ "$TABLE_COUNT" -eq 16 ]; then
  echo "✅ All 16 tables present"
else
  echo "❌ Expected 16 tables, found $TABLE_COUNT"
fi

# Check seed data
echo -n "Support cases: "
CASE_COUNT=$(docker exec github-support-postgres psql -U github_support -d github_support -t -c "SELECT COUNT(*) FROM support_cases;")
if [ "$CASE_COUNT" -ge 8 ]; then
  echo "✅ $CASE_COUNT cases found"
else
  echo "❌ Expected at least 8 cases, found $CASE_COUNT"
fi

echo ""
echo "✅ Phase 1 verification complete!"
```

---

## 🎉 Success Criteria

**Phase 1 is successfully installed when:**

- ✅ All containers are healthy
- ✅ All 16 tables created
- ✅ All 8 scenarios seeded
- ✅ Backend starts without errors
- ✅ Database and Redis connections work
- ✅ No TypeScript compilation errors
- ✅ Documentation is complete

**If all checkboxes above are checked, you are ready for Phase 2!** 🚀
