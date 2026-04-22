# GitHub Support System - Project Structure

## 📁 Directory Tree

```
github-support-system/
│
├── 📋 Configuration Files (Root)
│   ├── package.json              # Monorepo workspace configuration
│   ├── docker-compose.yml        # PostgreSQL + Redis containers
│   ├── .env.example              # Environment variables template
│   ├── .gitignore                # Git ignore rules
│   ├── README.md                 # Setup and usage guide
│   └── PHASE_1_COMPLETE.md       # Phase 1 completion checklist
│
├── 🤖 AI Assistant Configuration
│   ├── .claude/
│   │   ├── CLAUDE_PROJECT_INSTRUCTIONS.md
│   │   └── CLAUDE.md
│   ├── .github/copilot/
│   │   └── copilot-instructions.md
│   └── .vscode/
│       ├── settings.json
│       └── extensions.json
│
└── 📦 Packages
    │
    ├── 🔧 backend/                    # Node 24 + TypeScript Backend
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── config/
    │       │   └── env.ts            # Zod environment validation ✅
    │       ├── errors/
    │       │   └── index.ts          # Custom error classes ✅
    │       ├── lib/
    │       │   ├── logger.ts         # Pino logger singleton ✅
    │       │   ├── database.ts       # PostgreSQL pool ✅
    │       │   └── redis.ts          # Redis client ✅
    │       ├── types/
    │       │   └── index.ts          # ALL shared interfaces ✅
    │       ├── db/
    │       │   ├── schema.sql        # 16 tables + pgvector ✅
    │       │   └── seed.ts           # 8 test scenarios ✅
    │       ├── agents/               # Phase 4 (Not yet created)
    │       │   ├── orchestrator.agent.ts
    │       │   ├── billing-plan.agent.ts
    │       │   ├── entitlements.agent.ts
    │       │   ├── auth-token.agent.ts
    │       │   ├── api-rate-limit.agent.ts
    │       │   └── resolution.agent.ts
    │       ├── rag/                  # Phase 2 (Not yet created)
    │       │   ├── ingest.ts
    │       │   └── retrieve.ts
    │       ├── tools/                # Phase 4 (Not yet created)
    │       │   ├── service-status.tool.ts
    │       │   └── escalation.tool.ts
    │       ├── api/                  # Phase 5 (Not yet created)
    │       │   ├── app.ts
    │       │   ├── cases.router.ts
    │       │   └── middleware/
    │       └── index.ts              # Entry point ✅
    │
    ├── 🔌 mcp-server/                 # MCP Stdio Server
    │   ├── package.json              ✅
    │   ├── tsconfig.json             ✅
    │   └── src/
    │       └── server.ts             # Phase 3 (Not yet created)
    │
    └── 🎨 frontend/                   # Angular 21 Dashboard
        ├── package.json              ✅
        ├── tsconfig.json             ✅
        └── src/app/
            ├── core/services/        # Phase 6 (Not yet created)
            ├── shared/components/    # Phase 6 (Not yet created)
            ├── features/             # Phase 6 (Not yet created)
            │   ├── case-submit/
            │   ├── case-detail/
            │   └── scenario-runner/
            ├── app.config.ts         # Phase 6 (Not yet created)
            └── app.routes.ts         # Phase 6 (Not yet created)
```

## ✅ Phase 1 Completed Files (26 total)

### Root Level (5 files)
1. `package.json`
2. `docker-compose.yml`
3. `.env.example`
4. `.gitignore`
5. `README.md`

### AI Configuration (5 files)
6. `.claude/CLAUDE_PROJECT_INSTRUCTIONS.md`
7. `.claude/CLAUDE.md`
8. `.github/copilot/copilot-instructions.md`
9. `.vscode/settings.json`
10. `.vscode/extensions.json`

### Backend Package (13 files)
11. `packages/backend/package.json`
12. `packages/backend/tsconfig.json`
13. `packages/backend/src/config/env.ts`
14. `packages/backend/src/errors/index.ts`
15. `packages/backend/src/lib/logger.ts`
16. `packages/backend/src/lib/database.ts`
17. `packages/backend/src/lib/redis.ts`
18. `packages/backend/src/types/index.ts`
19. `packages/backend/src/db/schema.sql`
20. `packages/backend/src/db/seed.ts`
21. `packages/backend/src/index.ts`

### MCP Server Package (2 files)
22. `packages/mcp-server/package.json`
23. `packages/mcp-server/tsconfig.json`

### Frontend Package (2 files)
24. `packages/frontend/package.json`
25. `packages/frontend/tsconfig.json`

### Documentation (1 file)
26. `PHASE_1_COMPLETE.md`

## 🗄️ Database Schema (16 Tables)

### Customer & Organization (3 tables)
- `customers` - Customer accounts with support tiers
- `enterprise_accounts` - Enterprise subscriptions
- `github_orgs` - GitHub organizations

### Billing (2 tables)
- `subscriptions` - Active subscriptions with renewal dates
- `invoices` - Payment records and status

### Access Control (3 tables)
- `entitlements` - Feature access permissions
- `token_records` - Personal Access Tokens & OAuth
- `saml_configs` - SAML SSO configurations

### API & Usage (1 table)
- `api_usage` - API request counts and throttling

### Support (3 tables)
- `support_cases` - Support tickets
- `case_history` - Case event log
- `escalations` - Escalated cases

### Service Health (2 tables)
- `service_status` - Component health status
- `incidents` - Active incidents

### RAG (1 table)
- `document_chunks` - Embedded documentation chunks (vector(1536))

## 🧪 Test Scenarios (8 Total)

| ID | Scenario | Agent | Data Created |
|----|----------|-------|--------------|
| S1 | Feature entitlement dispute | EntitlementsAgent | Org, subscription, entitlement, case |
| S2 | Paid features locked | BillingPlanAgent | Org, subscription, invoice, case |
| S3 | PAT failing for org | AuthTokenAgent | Org, token, case |
| S4 | REST API rate limit | ApiRateLimitAgent | Org, API usage, incident, case |
| S5 | SAML SSO failure | AuthTokenAgent | Org, SAML config, case |
| S6 | Repeated auth issues | AuthTokenAgent | Org, token, 4 cases + history |
| S7 | Ambiguous complaint | OrchestratorAgent | Org, case |
| S8 | Billing + technical | Multiple agents | Org, subscription, token, case |

## 🚀 Next Steps

### Phase 2: RAG Corpus Ingestion
**Files to create:** 2
- `packages/backend/src/rag/ingest.ts`
- `packages/backend/src/rag/retrieve.ts`

**Goal:** Ingest 22 GitHub Docs URLs into `document_chunks` table

### Phase 3: MCP Server
**Files to create:** 1
- `packages/mcp-server/src/server.ts` (8 tools)

**Goal:** Expose all entity data via MCP protocol

### Phase 4: Agent Pipeline
**Files to create:** 8
- 6 agent classes
- 2 direct tools

**Goal:** Complete AI resolution pipeline

### Phase 5: Express API + SSE
**Files to create:** 5+
- Express app + routes + middleware

**Goal:** REST API with streaming events

### Phase 6: Angular Frontend
**Files to create:** 15+
- Components, services, routing

**Goal:** Support dashboard UI

### Phase 7: Testing & Docs
**Files to create:** 3
- SCENARIOS.md
- DESIGN_NOTE.md
- LIMITATIONS.md

**Goal:** Production documentation
