# GitHub Support Resolution System

A multi-agent AI support system that uses RAG (Retrieval-Augmented Generation), MCP (Model Context Protocol), and Claude to automatically resolve GitHub support cases.

## 🏗️ Architecture

This is a **monorepo** containing:

- **`packages/backend`** — Express API + Agent Pipeline (Node 24 + TypeScript)
- **`packages/mcp-server`** — MCP stdio server exposing 8 entity tools
- **`packages/frontend`** — Angular 21 dashboard with SSE streaming

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node 24.x |
| Language | TypeScript 5.x (strict mode) |
| Backend | Express 5 |
| Database | PostgreSQL 17 + pgvector 0.2 |
| Cache | Redis 7 |
| LLM | Claude Sonnet 4 (via Anthropic SDK) |
| Embeddings | OpenAI text-embedding-3-small |
| MCP | @modelcontextprotocol/sdk ^1.10 |
| Frontend | Angular 21 (standalone + signals) |
| UI Library | Angular Material 21 |
| Testing | Vitest |

## 📋 Prerequisites

- **Node.js** 24.x or higher
- **Docker** and **Docker Compose**
- **npm** 10.x or higher
- **Anthropic API key** (Claude)
- **OpenAI API key** (for embeddings)

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/float8894/github-support-system.git
cd github-support-system
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
OPENAI_API_KEY=sk-your-openai-key-here
```

### 3. Start Infrastructure

```bash
npm run docker:up
```

This starts:
- PostgreSQL 17 with pgvector (port **5434**)
- Redis 7 (port **6380**)

### 4. Seed Database

```bash
npm run db:seed
```

This creates:
- 3 customers
- 3 GitHub organizations
- 1 enterprise account
- 8 test scenarios covering all issue categories

### 5. Run Services

**Terminal 1 - Backend API:**
```bash
npm run dev:backend
```

**Terminal 2 - MCP Server (Phase 3+):**
```bash
npm run dev:mcp
```

**Terminal 3 - Frontend (Phase 6+):**
```bash
npm run dev:frontend
```

## 🏃 Development Workflow

### Phase 1 ✅ — Foundation (COMPLETED)

- [x] Monorepo structure
- [x] Docker Compose (Postgres + Redis)
- [x] Database schema (16 tables)
- [x] Seed script (8 scenarios)
- [x] Core libraries (env, logger, database, redis)
- [x] Type definitions
- [x] Error classes

**Status:** All Phase 1 files created. Ready to run `docker compose up` and `npm run db:seed`.

### Phase 2 — RAG Corpus Ingestion

**Goal:** Ingest 22 GitHub Docs URLs into pgvector

**Files to create:**
- `packages/backend/src/rag/ingest.ts`
- `packages/backend/src/rag/retrieve.ts`

**Acceptance criteria:**
- `tsx src/rag/ingest.ts` populates `document_chunks` table
- `retrieveChunks('token expired')` returns scored results

### Phase 3 — MCP Server

**Goal:** Standalone MCP stdio server with 8 tools

**Files to create:**
- `packages/mcp-server/src/server.ts`

**Tools to implement:**
1. `get_org_context`
2. `check_subscription`
3. `check_entitlement`
4. `get_token_record`
5. `get_saml_config`
6. `check_api_usage`
7. `get_case_history`
8. `check_invoice_status`

### Phase 4 — Agent Pipeline

**Goal:** All 6 agent classes + direct tools

**Files to create:**
- `packages/backend/src/agents/orchestrator.agent.ts`
- `packages/backend/src/agents/billing-plan.agent.ts`
- `packages/backend/src/agents/entitlements.agent.ts`
- `packages/backend/src/agents/auth-token.agent.ts`
- `packages/backend/src/agents/api-rate-limit.agent.ts`
- `packages/backend/src/agents/resolution.agent.ts`
- `packages/backend/src/tools/service-status.tool.ts`
- `packages/backend/src/tools/escalation.tool.ts`

### Phase 5 — Express API + SSE

**Goal:** REST API with Server-Sent Events

**Files to create:**
- `packages/backend/src/api/app.ts`
- `packages/backend/src/api/cases.router.ts`
- `packages/backend/src/api/middleware/*`
- `packages/backend/src/index.ts`

### Phase 6 — Angular Frontend

**Goal:** Internal support dashboard

**Files to create:**
- `packages/frontend/src/app/app.config.ts`
- `packages/frontend/src/app/app.routes.ts`
- `packages/frontend/src/app/core/services/*`
- `packages/frontend/src/app/features/*`

### Phase 7 — Testing & Documentation

**Goal:** Run all scenarios, capture outputs

**Files to create:**
- `SCENARIOS.md`
- `DESIGN_NOTE.md`
- `LIMITATIONS.md`

## 📊 Database Schema

**16 tables organized by domain:**

### Customer & Organization
- `customers`
- `enterprise_accounts`
- `github_orgs`

### Billing
- `subscriptions`
- `invoices`

### Access Control
- `entitlements`
- `token_records`
- `saml_configs`

### API Usage
- `api_usage`

### Support
- `support_cases`
- `case_history`
- `escalations`

### Service Health
- `service_status`
- `incidents`

### RAG
- `document_chunks` (with vector embeddings)

## 🧪 Test Scenarios

| # | Scenario | Primary Agent | Expected Verdict |
|---|----------|---------------|------------------|
| S1 | Feature entitlement dispute | EntitlementsAgent | resolve or escalate |
| S2 | Paid features locked | BillingPlanAgent | resolve |
| S3 | PAT failing for org resources | AuthTokenAgent | resolve |
| S4 | REST API rate limit | ApiRateLimitAgent | resolve |
| S5 | SAML SSO login failure | AuthTokenAgent | resolve or escalate |
| S6 | Repeated auth issues | AuthTokenAgent | escalate (auto) |
| S7 | Ambiguous complaint | OrchestratorAgent | clarify |
| S8 | Billing + technical | BillingPlanAgent | resolve or escalate |

## 🔧 Project Structure

```
github-support-system/
├── .claude/                         # Claude project config
├── .github/copilot/                 # GitHub Copilot config
├── .vscode/                         # VSCode settings
├── packages/
│   ├── backend/
│   │   └── src/
│   │       ├── config/              # Env validation
│   │       ├── errors/              # Custom error classes
│   │       ├── lib/                 # Logger, DB, Redis
│   │       ├── types/               # All TypeScript interfaces
│   │       ├── agents/              # Agent classes (Phase 4)
│   │       ├── rag/                 # Ingest + retrieve (Phase 2)
│   │       ├── tools/               # Direct tools (Phase 4)
│   │       ├── api/                 # Express routes (Phase 5)
│   │       └── db/                  # Schema + seed
│   ├── mcp-server/
│   │   └── src/
│   │       └── server.ts            # MCP stdio server (Phase 3)
│   └── frontend/
│       └── src/app/
│           ├── core/                # Services
│           ├── shared/              # Reusable components
│           └── features/            # Feature modules (Phase 6)
├── docker-compose.yml
└── package.json
```

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Check if Postgres is running
docker ps | grep postgres

# View logs
docker logs github-support-postgres

# Restart containers
npm run docker:down
npm run docker:up
```

### Port Conflicts

Default ports:
- **3000** — Backend API
- **4200** — Frontend
- **5432** — PostgreSQL
- **6379** — Redis

Change in `.env` if needed.

## 📚 Additional Resources

- [Phase-by-phase implementation guide](./.claude/CLAUDE_PROJECT_INSTRUCTIONS.md)
- [Node 24 patterns](/mnt/skills/user/node24/SKILL.md)
- [Angular 21 patterns](/mnt/skills/user/angular21/SKILL.md)

## 📝 License

Private - Internal Use Only
