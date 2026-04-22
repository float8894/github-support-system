# System Architecture Diagram

## 🏗️ Complete System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GITHUB SUPPORT SYSTEM                               │
│                        Multi-Agent RAG Pipeline                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 6: FRONTEND (Angular 21)                                Port 4200    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐   │
│  │ Case Submit    │  │ Pipeline View  │  │ Scenario Runner            │   │
│  │ Form           │  │ (SSE Stream)   │  │ (Pre-filled test cases)    │   │
│  └────────────────┘  └────────────────┘  └────────────────────────────┘   │
│           │                   │                        │                     │
│           └───────────────────┴────────────────────────┘                     │
│                               │                                              │
│                      ┌────────▼─────────┐                                   │
│                      │  CaseService     │                                   │
│                      │  SseService      │                                   │
│                      └────────┬─────────┘                                   │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │ HTTP + SSE
                               │
┌──────────────────────────────▼───────────────────────────────────────────────┐
│  PHASE 5: EXPRESS API                                      Port 3000         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  POST   /api/cases              → Create support case                       │
│  GET    /api/cases/:id          → Get case outcome                          │
│  POST   /api/cases/:id/run      → Start pipeline (SSE stream)              │
│  GET    /api/cases/:id/stream   → SSE: AgentEvent[]                        │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  Middleware: CORS, requestId, error handler, body parser           │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                               │                                              │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────────────┐
│  PHASE 4: AGENT PIPELINE                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  1. OrchestratorAgent                                              │    │
│  │     • Calls get_org_context, get_case_history (MCP)                │    │
│  │     • Retrieves RAG chunks (top 5 cosine similarity)               │    │
│  │     • Classifies issue_category                                    │    │
│  │     • Routes to specialist agents                                  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                               │                                              │
│                ┌──────────────┼──────────────┬──────────────┐              │
│                ▼              ▼              ▼              ▼              │
│  ┌─────────────────┐ ┌────────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ BillingPlan     │ │ Entitlements   │ │ AuthToken    │ │ ApiRateLimit │ │
│  │ Agent           │ │ Agent          │ │ Agent        │ │ Agent        │ │
│  │ (S2, S8)        │ │ (S1)           │ │ (S3,S5,S6)   │ │ (S4)         │ │
│  └─────────────────┘ └────────────────┘ └──────────────┘ └──────────────┘ │
│         │                    │                  │                │          │
│         └────────────────────┴──────────────────┴────────────────┘          │
│                               │                                              │
│                               ▼                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  5. ResolutionAgent                                                │    │
│  │     • Aggregates all AgentFindings                                 │    │
│  │     • Applies auto-escalation rules                                │    │
│  │     • Generates CaseOutcome (verdict + responses)                  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
                     │                            │
        ┌────────────┘                            └───────────────┐
        │ MCP Tool Calls                                  Direct Tools │
        ▼                                                         ▼
┌──────────────────────────────────────┐    ┌────────────────────────────┐
│  PHASE 3: MCP SERVER (stdio)         │    │  Direct Tools (no MCP)     │
├──────────────────────────────────────┤    ├────────────────────────────┤
│                                       │    │                            │
│  8 Tools:                            │    │  • check_service_status    │
│  • get_org_context                   │    │  • create_escalation       │
│  • check_subscription                │    │                            │
│  • check_entitlement                 │    └────────────────────────────┘
│  • get_token_record                  │
│  • get_saml_config                   │
│  • check_api_usage                   │
│  • get_case_history                  │
│  • check_invoice_status              │
│                                       │
└───────────────┬───────────────────────┘
                │ Parameterized SQL
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: DATABASE (PostgreSQL 17 + pgvector)             Port 5432         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  16 Tables:                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │ Customer Domain  │  │ Billing Domain   │  │ Auth Domain      │         │
│  ├──────────────────┤  ├──────────────────┤  ├──────────────────┤         │
│  │ • customers      │  │ • subscriptions  │  │ • token_records  │         │
│  │ • github_orgs    │  │ • invoices       │  │ • saml_configs   │         │
│  │ • enterprises    │  │ • entitlements   │  │                  │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
│                                                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │ Support Domain   │  │ Service Domain   │  │ RAG Domain       │         │
│  ├──────────────────┤  ├──────────────────┤  ├──────────────────┤         │
│  │ • support_cases  │  │ • service_status │  │ • document_chunks│         │
│  │ • case_history   │  │ • incidents      │  │   (vector 1536)  │         │
│  │ • escalations    │  │ • api_usage      │  │                  │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: RAG LAYER                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌────────────────────────────┐       ┌────────────────────────────┐       │
│  │  ingest.ts                 │       │  retrieve.ts               │       │
│  ├────────────────────────────┤       ├────────────────────────────┤       │
│  │  1. Fetch 22 GitHub URLs   │       │  retrieveChunks(query)     │       │
│  │  2. HTML → Markdown         │       │                            │       │
│  │  3. Chunk (~500 tokens)    │       │  SELECT ... WHERE          │       │
│  │  4. OpenAI embeddings      │       │  embedding <=> $1::vector  │       │
│  │  5. INSERT into DB         │       │  LIMIT 5                   │       │
│  └────────────────────────────┘       └────────────────────────────┘       │
│              │                                       │                       │
│              └───────────────┬───────────────────────┘                       │
│                              ▼                                               │
│                    document_chunks table                                     │
│                    (chunk_text + embedding)                                  │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL SERVICES                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────────────┐    ┌──────────────────────┐                      │
│  │  Anthropic API       │    │  OpenAI API          │                      │
│  │  (Claude Sonnet 4)   │    │  (text-embed-3-small)│                      │
│  └──────────────────────┘    └──────────────────────┘                      │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  CACHE LAYER (Redis 7)                                     Port 6379         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  • Agent context caching                                                     │
│  • RAG chunk caching                                                         │
│  • Tool result caching                                                       │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 📊 Data Flow: Support Case Resolution

```
1. User Submits Case
   └─> POST /api/cases
       └─> Insert into support_cases table
           └─> Return case_id

2. Start Pipeline
   └─> POST /api/cases/:id/run
       └─> SSE stream opens
           │
           ├─> Event: triage
           │   └─> OrchestratorAgent.run()
           │       ├─> MCP: get_org_context
           │       ├─> MCP: get_case_history
           │       ├─> RAG: retrieveChunks(description)
           │       └─> LLM: Classify issue_category
           │
           ├─> Event: routing
           │   └─> Determine routeTo: AgentType[]
           │
           ├─> Event: agent_start (for each specialist)
           │   └─> BillingPlanAgent / EntitlementsAgent / etc.
           │       ├─> MCP: check_subscription / check_entitlement / etc.
           │       ├─> RAG: retrieveChunks(agent-specific query)
           │       ├─> LLM: Analyze with context
           │       └─> Return AgentFinding
           │
           ├─> Event: agent_done (for each specialist)
           │
           ├─> Event: verdict
           │   └─> ResolutionAgent.run()
           │       ├─> Aggregate all AgentFindings
           │       ├─> Apply auto-escalation rules
           │       ├─> LLM: Generate customer_response + internal_note
           │       └─> Return CaseOutcome
           │
           └─> Event: complete
               └─> Close SSE stream

3. Retrieve Outcome
   └─> GET /api/cases/:id
       └─> Return CaseOutcome with citations
```

## 🎯 Agent Routing Logic

```
issue_category → routeTo agents

billing_plan     → [BillingPlanAgent]
entitlement      → [EntitlementsAgent]
auth_token       → [AuthTokenAgent]
saml_sso         → [AuthTokenAgent]
api_rate_limit   → [ApiRateLimitAgent]
ambiguous        → [] (clarify immediately)

Special cases:
• S6: >=3 unresolved auth cases → Auto-escalate
• S8: billing + technical → [BillingPlanAgent, EntitlementsAgent]
```

## 🔄 MCP vs Direct Tools

### MCP Tools (via stdio server)
- get_org_context
- check_subscription
- check_entitlement
- get_token_record
- get_saml_config
- check_api_usage
- get_case_history
- check_invoice_status

**Why MCP:** Reusable, standardized, can be called by any LLM client

### Direct Tools (in backend)
- check_service_status
- create_escalation

**Why Direct:** Stateful operations, need immediate DB writes

## 🧩 Technology Choices

| Layer | Technology | Reason |
|-------|-----------|--------|
| Database | PostgreSQL 17 + pgvector | Native vector search, ACID guarantees |
| Cache | Redis 7 | Fast key-value store for context caching |
| Backend | Node 24 + TypeScript | Native ESM, .env loading, latest features |
| Framework | Express 5 | Simple, proven, wide ecosystem |
| LLM | Claude Sonnet 4 | Best reasoning for complex multi-step tasks |
| Embeddings | OpenAI text-embedding-3-small | Fast, cheap, 1536 dimensions |
| MCP | @modelcontextprotocol/sdk | Standard protocol for tool calling |
| Frontend | Angular 21 | Enterprise-ready, signals for fine-grained reactivity |
| UI | Angular Material 21 | Production-ready components |
| Testing | Vitest | Fast, ESM-native, unified with backend |

---

**Phase 1 Status:** ✅ COMPLETE — All foundation files created and tested
