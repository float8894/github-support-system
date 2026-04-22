# Quick Start Guide

## ⚡ Get Running in 5 Minutes

### Step 1: Prerequisites Check

Make sure you have:
```bash
node --version  # Should be v24.x or higher
docker --version
docker compose version
```

### Step 2: Set Up Environment

```bash
cd github-support-system

# Copy environment template
cp .env.example .env

# Edit .env and add your API keys
# Required:
#   ANTHROPIC_API_KEY=sk-ant-api03-...
#   OPENAI_API_KEY=sk-...
```

### Step 3: Install Dependencies

```bash
npm install
```

This installs all packages in the monorepo.

### Step 4: Start Infrastructure

```bash
npm run docker:up
```

**Wait for health checks to pass:**
```bash
docker ps
```

You should see both containers as `healthy`:
- `github-support-postgres`
- `github-support-redis`

### Step 5: Initialize Database

```bash
npm run db:seed
```

**Expected output:**
```
Created Scenario 1: Feature Entitlement Dispute
Created Scenario 2: Paid Features Locked Due to Billing
Created Scenario 3: PAT Failing for Org Resources
Created Scenario 4: REST API Rate Limit Complaint
Created Scenario 5: SAML SSO Login Failure
Created Scenario 6: Repeated Unresolved Auth Issues
Created Scenario 7: Ambiguous Complaint
Created Scenario 8: Billing + Technical Issue
Database seed completed successfully!
```

### Step 6: Test Backend

```bash
npm run dev:backend
```

**Expected output:**
```
GitHub Support System Backend starting...
Database connection: OK
Redis connection: OK
All systems operational
```

Press `Ctrl+C` to stop.

---

## ✅ Phase 1 Complete!

You now have:
- ✅ PostgreSQL 17 + pgvector running
- ✅ Redis 7 running
- ✅ Database schema created (16 tables)
- ✅ Test data seeded (8 scenarios)
- ✅ Backend validates and connects

---

## 🔍 Verify Your Setup

### Check Database Tables

```bash
docker exec -it github-support-postgres psql -U github_support -d github_support -c "\dt"
```

You should see 16 tables.

### Check Seed Data

```bash
docker exec -it github-support-postgres psql -U github_support -d github_support -c "SELECT case_id, title, severity FROM support_cases;"
```

You should see 11 cases (8 scenarios + 3 historical cases for S6).

### Check Redis

```bash
docker exec -it github-support-redis redis-cli PING
```

Should return `PONG`.

---

## 🐛 Common Issues

### Port Already in Use

If PostgreSQL port 5432 is taken:
```bash
# Edit docker-compose.yml
# Change "5432:5432" to "5433:5432"

# Then update .env
# DATABASE_URL=postgresql://...@localhost:5433/github_support
```

### Docker Not Running

```bash
# Start Docker Desktop or Docker daemon
# Then retry: npm run docker:up
```

### Permission Errors

```bash
# On Linux, if permission denied:
sudo chown -R $USER:$USER .
```

---

## 📊 Database Connection Details

- **Host:** localhost
- **Port:** 5432
- **Database:** github_support
- **User:** github_support
- **Password:** dev_password_change_in_prod

**Connection string:**
```
postgresql://github_support:dev_password_change_in_prod@localhost:5432/github_support
```

---

## 🎯 What's Next?

Now that Phase 1 is complete, you can proceed to:

### Phase 2: RAG Corpus Ingestion
Create the document ingestion pipeline to load GitHub documentation into pgvector.

**Command to run when ready:**
```bash
# After creating ingest.ts
tsx packages/backend/src/rag/ingest.ts
```

### Phase 3: MCP Server
Build the MCP stdio server that exposes 8 tools for querying entities.

**Command to run when ready:**
```bash
npm run dev:mcp
```

### Phase 4: Agent Pipeline
Implement the 6 agent classes that orchestrate the resolution flow.

### Phase 5: Express API
Add REST endpoints and Server-Sent Events for real-time updates.

**Command to run when ready:**
```bash
npm run dev:backend
```

### Phase 6: Angular Frontend
Build the support dashboard UI.

**Command to run when ready:**
```bash
npm run dev:frontend
```

---

## 📚 Key Files to Review

1. **Database Schema**
   - `packages/backend/src/db/schema.sql`
   - All 16 tables with comments

2. **Seed Data**
   - `packages/backend/src/db/seed.ts`
   - All 8 test scenarios

3. **Type Definitions**
   - `packages/backend/src/types/index.ts`
   - Every interface used in the system

4. **Project Instructions**
   - `.claude/CLAUDE_PROJECT_INSTRUCTIONS.md`
   - Complete implementation guide

---

## 🛠️ Useful Commands

```bash
# Stop infrastructure
npm run docker:down

# View backend logs
npm run dev:backend

# Re-seed database (drops and recreates data)
npm run db:seed

# Run tests (when available)
npm test

# Build all packages
npm run build

# Clean install
rm -rf node_modules package-lock.json
npm install
```

---

## 💡 Tips

1. **Use tsx for development** - It's faster than ts-node and supports Node 24 features
2. **Check logs** - Pino logger outputs structured JSON in production
3. **Use Zod schemas** - All env vars are validated at startup
4. **Read the skills** - Node24 and Angular21 skills have detailed patterns
5. **Follow phases** - Don't skip ahead - each phase builds on the previous

---

## 🎉 Success!

If you see this, Phase 1 is complete:

```
✅ Infrastructure running
✅ Database initialized
✅ Test data loaded
✅ Backend connects successfully
```

**Ready for Phase 2!** 🚀
