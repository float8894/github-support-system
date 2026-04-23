# GitHub Support Resolution System

A multi-agent AI support system that uses RAG (Retrieval-Augmented Generation), MCP (Model Context Protocol), and Claude to automatically resolve GitHub support cases.

## 🏗️ Architecture

This is a **monorepo** containing:

- **`packages/backend`** — Express API + Agent Pipeline (Node 24 + TypeScript)
- **`packages/mcp-server`** — MCP stdio server exposing 8 entity tools
- **`packages/frontend`** — Angular 21 dashboard with SSE streaming

### Tech Stack

| Component  | Technology                          |
| ---------- | ----------------------------------- |
| Runtime    | Node 24.x                           |
| Language   | TypeScript 5.x (strict mode)        |
| Backend    | Express 5                           |
| Database   | PostgreSQL 17 + pgvector 0.2        |
| Cache      | Redis 7                             |
| LLM        | Claude Sonnet 4 (via Anthropic SDK) |
| Embeddings | OpenAI text-embedding-3-small       |
| MCP        | @modelcontextprotocol/sdk ^1.10     |
| Frontend   | Angular 21 (standalone + signals)   |
| UI Library | Angular Material 21                 |
| Testing    | Vitest                              |

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

### 4. Migrate and Seed Database

```bash
# Apply schema
npm run db:migrate -w packages/backend

# Seed test data (12 cases, 8 scenarios + historical sub-cases)
npm run db:seed -w packages/backend
```

### 5. Ingest RAG Corpus

```bash
# Fetch and embed 22 GitHub Docs pages into pgvector
npm run ingest -w packages/backend
```

This may take 2–3 minutes on first run (22 HTTP fetches + OpenAI embedding calls).

### 6. Start All Services

Open three terminals:

**Terminal 1 — MCP Server:**

```bash
npm run dev:mcp
```

**Terminal 2 — Backend API (port 3000):**

```bash
npm run dev:backend
```

**Terminal 3 — Angular Frontend (port 4200):**

```bash
npm run dev:frontend
```

Then open [http://localhost:4200](http://localhost:4200).

## 🏃 Build Phases — All Complete

| Phase | Scope                       | Status      |
| ----- | --------------------------- | ----------- |
| 1     | Foundation & Data Model     | ✅ Complete |
| 2     | RAG Corpus Ingestion        | ✅ Complete |
| 3     | MCP Server (8 tools)        | ✅ Complete |
| 4     | Agent Pipeline (6 agents)   | ✅ Complete |
| 5     | Express API + SSE Streaming | ✅ Complete |
| 6     | Angular Frontend            | ✅ Complete |
| 7     | Scenarios & Documentation   | ✅ Complete |

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

## 🎬 Running Scenarios

### Option A — Headless (all 8 scenarios, writes JSON)

```bash
npm run scenarios:capture -w packages/backend
# Output: scenarios-output.json at repo root
```

All 12 DB cases run through the full pipeline. Expected: **12 passed, 0 failed**.

### Option B — Angular UI

Navigate to [http://localhost:4200/scenarios](http://localhost:4200/scenarios) and click **Run All Scenarios** to watch live SSE streaming for each case.

## 🧪 Scenario Results

| #   | Title                                | Primary Agent     | Actual Verdict       |
| --- | ------------------------------------ | ----------------- | -------------------- |
| S1  | GitHub Actions minutes not available | EntitlementsAgent | `escalate`           |
| S2  | All premium features suddenly locked | BillingPlanAgent  | `resolve`            |
| S3  | PAT returns 403 for org repos        | AuthTokenAgent    | `resolve`            |
| S4  | Getting rate limited on REST API     | ApiRateLimitAgent | `resolve`            |
| S5  | SAML SSO authentication fails        | AuthTokenAgent    | `escalate`           |
| S6  | Repeated token auth failure (×4)     | AuthTokenAgent    | `escalate` (auto ≥3) |
| S7  | GitHub not working (vague)           | OrchestratorAgent | `clarify`            |
| S8  | Advanced Security not provisioned    | EntitlementsAgent | `escalate`           |

See [SCENARIOS.md](./SCENARIOS.md) for full pipeline traces, MCP tool calls, RAG citations, customer responses, and internal notes for every scenario.

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
- **5434** — PostgreSQL (non-default to avoid conflicts)
- **6380** — Redis (non-default to avoid conflicts)

Change in `.env` and `docker-compose.yml` if needed.

## 📚 Documentation

- [SCENARIOS.md](./SCENARIOS.md) — Live pipeline outputs for all 8 scenarios with RAG citations, MCP tool calls, customer responses, and internal notes
- [DESIGN_NOTE.md](./DESIGN_NOTE.md) — Architecture decisions: multi-agent design, MCP stdio transport, RAG corpus, auto-escalation rules, SSE streaming

## 📝 License

Private - Internal Use Only
