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

# Seed test data (11 cases: 8 scenario cases + 3 historical sub-cases for S6)
npm run db:seed -w packages/backend
```

### 5. Ingest RAG Corpus

```bash
# Fetch and embed 41 GitHub Docs pages into pgvector
npm run ingest -w packages/backend
```

This may take 2–3 minutes on first run (41 HTTP fetches + OpenAI embedding calls).

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

---

## 🖥️ Using the Application

Once all three services are running you interact entirely through the Angular frontend at **http://localhost:4200**. There are three pages:

| Route        | Page                | Purpose                                                                |
| ------------ | ------------------- | ---------------------------------------------------------------------- |
| `/`          | **Submit Case**     | Manually author a new case using real entity UUIDs                     |
| `/cases`     | **Case List**       | Browse all support cases (newest first)                                |
| `/cases/:id` | **Case Detail**     | Live SSE pipeline stream + final outcome for any case                  |
| `/scenarios` | **Scenario Runner** | One-click execution of all 8 pre-seeded test cases — no UUIDs required |

---

### Path A — Scenario Runner _(recommended for first-time use)_

This is the fastest way to see the system in action. The Scenario Runner page reads all seeded cases from the database and maps them to their scenario cards automatically — you do not need to supply any IDs.

1. Open **http://localhost:4200/scenarios**.
2. You will see 8 cards, one per scenario (S1–S8), each showing the expected primary agent and verdict.
3. Click **Run** on any card.
   - The app queries `GET /api/cases` for all open cases in the DB.
   - It finds the seeded case whose title matches the scenario (e.g. _"GitHub Actions minutes not available"_ for S1).
   - It navigates to `/cases/:id`, immediately opens an SSE stream, and starts the pipeline.
4. Watch the event cards appear in real time as each agent works through the case (see [Understanding pipeline events](#-understanding-pipeline-events) below).
5. When the stream ends with a `complete` event, the full outcome panel is rendered below the event log.

> **No seeded data?** If `npm run db:seed` was never run you will see an error banner. Run the seed command and refresh the page.

---

### Path B — Submit a Custom Case

Use this when you want to test a description you have written yourself, or when simulating a real customer ticket. The form requires a **Customer ID** and an **Org ID** — both are UUIDs generated at seed time and stored in the database. Here is exactly how to obtain them.

#### Step 1 — Get a Customer ID

```bash
docker compose exec db psql -U postgres -d github_support \
  -c "SELECT customer_id, customer_name, support_tier, status FROM customers ORDER BY customer_name;"
```

Example output:

```
              customer_id             | customer_name | support_tier | status
--------------------------------------+---------------+--------------+--------
 3f2a1b4c-…                          | Acme Corp     | premium      | active
 9d8e7f6a-…                          | TechStart Inc | basic        | active
```

Copy the `customer_id` value (the full UUID string including hyphens) for the customer you want to associate the case with.

The two seeded customers represent different tiers and scenarios:

| Customer          | `support_tier` | Used in scenarios      |
| ----------------- | -------------- | ---------------------- |
| **Acme Corp**     | `premium`      | S1, S2, S3, S5, S6, S8 |
| **TechStart Inc** | `basic`        | S4, S7                 |

#### Step 2 — Get an Org ID that belongs to that customer

```bash
docker compose exec db psql -U postgres -d github_support \
  -c "SELECT org_id, org_name, customer_id, current_plan, billing_status, sso_enabled FROM github_orgs ORDER BY org_name;"
```

Example output:

```
              org_id               |    org_name     |          customer_id          | current_plan | billing_status | sso_enabled
-----------------------------------+-----------------+-------------------------------+--------------+----------------+-------------
 a1b2c3d4-…                       | acme-data       | 3f2a1b4c-…                   | Enterprise   | past_due       | f
 e5f6a7b8-…                       | acme-engineering| 3f2a1b4c-…                   | Team         | active         | t
 c9d0e1f2-…                       | techstart-dev   | 9d8e7f6a-…                   | Free         | active         | f
```

The `org_id` you choose **must belong to the customer** you selected in Step 1 (the `customer_id` columns must match). The three seeded orgs have different characteristics that influence which agent runs and what verdict is produced:

| Org                  | Plan       | `billing_status` | SSO | Notes                                                         |
| -------------------- | ---------- | ---------------- | --- | ------------------------------------------------------------- |
| **acme-engineering** | Team       | `active`         | ✅  | Default Acme org; used for auth + entitlement scenarios       |
| **acme-data**        | Enterprise | `past_due`       | ❌  | Overdue invoice seeded; triggers BillingPlanAgent → `resolve` |
| **techstart-dev**    | Free       | `active`         | ❌  | Used for rate-limit + ambiguous scenarios                     |

#### Step 3 — Fill in the form

Go to **http://localhost:4200** and complete all five fields:

| Field           | Validation                                        | Guidance                                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Title**       | 5–500 chars, required                             | A concise one-line description of the problem. The Orchestrator uses this along with the description to classify the issue category.                                                                                                         |
| **Description** | ≥10 chars, required                               | Full detail of the customer's problem. The richer this is, the more accurate the triage and RAG retrieval. Write it as a real customer would (e.g. _"My PAT with repo and read:org scopes returns 403 when cloning from acme-engineering"_). |
| **Severity**    | one of `low / medium / high / critical`, required | Stored on the case record. `critical` cases with repeated history may trigger auto-escalation.                                                                                                                                               |
| **Customer ID** | UUID pattern `/^[0-9a-f-]{36}$/i`, required       | The UUID you copied in Step 1.                                                                                                                                                                                                               |
| **Org ID**      | UUID pattern `/^[0-9a-f-]{36}$/i`, required       | The UUID you copied in Step 2. Must belong to the chosen customer.                                                                                                                                                                           |

Click **Submit Case**. The API creates a row in `support_cases` and returns the new `case_id`. The app navigates to `/cases/:case_id` automatically.

#### Step 4 — Start the pipeline

On the Case Detail page, click the **Run Pipeline** button. This calls `POST /api/cases/:id/run`, which:

1. Opens an SSE connection back to the browser.
2. Spawns the full agent pipeline in the background.
3. Emits an `AgentEvent` over the stream for every meaningful step.

---

### 📡 Understanding Pipeline Events

Each event card that appears during streaming corresponds to one `AgentEvent` object. The event types in order are:

| Event type      | Emitted by        | What it means                                                                                                        |
| --------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `triage`        | OrchestratorAgent | Issue classified into one of: `billing_plan`, `entitlement`, `auth_token`, `api_rate_limit`, `saml_sso`, `ambiguous` |
| `rag_retrieved` | OrchestratorAgent | Top-5 document chunks fetched from `document_chunks` by cosine similarity to the case description                    |
| `routing`       | OrchestratorAgent | List of specialist agents selected (e.g. `["AuthTokenAgent", "ResolutionAgent"]`)                                    |
| `agent_start`   | Each specialist   | A specialist agent has begun gathering evidence                                                                      |
| `tool_called`   | Each specialist   | An MCP tool was invoked (e.g. `get_token_record`, `check_subscription`)                                              |
| `agent_done`    | Each specialist   | Agent produced an `AgentFinding` with root causes and a recommended verdict                                          |
| `verdict`       | ResolutionAgent   | Resolution agent has synthesised all findings                                                                        |
| `complete`      | ResolutionAgent   | Pipeline finished; full `CaseOutcome` is available                                                                   |
| `error`         | Any agent         | An unrecoverable error occurred; `data.message` contains the reason                                                  |

---

### 📋 Reading the Outcome

Once `complete` fires, the outcome panel expands below the event log. It contains:

| Section               | What it shows                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------- |
| **Verdict badge**     | `resolve`, `clarify`, or `escalate` — colour coded green / amber / red                    |
| **Customer Response** | Markdown response ready to send to the customer. Actionable steps, never internal jargon. |
| **Internal Note**     | Engineer-facing note citing which MCP tool results and RAG chunks led to the conclusion   |
| **RAG Citations**     | The document chunks used as evidence, with source URL and relevance score (0–1)           |
| **Tool Results**      | Every MCP tool that was called, its input, and its full output                            |
| **Escalation ID**     | Present only when verdict = `escalate`; links to the `escalations` table row              |

---

### API Reference

| Method   | Route                   | Description                                                                |
| -------- | ----------------------- | -------------------------------------------------------------------------- |
| `POST`   | `/api/cases`            | Create a support case. Returns `{ case_id }`.                              |
| `GET`    | `/api/cases`            | List all cases (newest first, limit 50).                                   |
| `GET`    | `/api/cases/:id`        | Fetch the stored `CaseOutcome` for a completed case.                       |
| `GET`    | `/api/cases/:id/case`   | Fetch the raw `SupportCase` database row.                                  |
| `POST`   | `/api/cases/:id/run`    | Run the agent pipeline; returns a live SSE stream of `AgentEvent` objects. |
| `GET`    | `/api/cases/:id/stream` | Replay stored `AgentEvent` objects from Redis (for already-run cases).     |
| `DELETE` | `/api/cases/:id`        | Delete a case and its cached outcome from Redis.                           |
| `POST`   | `/api/ingest`           | Trigger RAG corpus ingestion. Requires `X-Admin-Key` header (admin only).  |

SSE event format (each `data:` frame is a JSON-serialised `AgentEvent`):

```bash
curl -N -H "Accept: text/event-stream" \
  -X POST http://localhost:3000/api/cases/<case_id>/run
```

Fetch a completed outcome:

```bash
curl http://localhost:3000/api/cases/<case_id>
```

---

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

All 11 DB cases run through the full pipeline. Expected: **11 passed, 0 failed**.

### Option B — Angular UI

Navigate to [http://localhost:4200/scenarios](http://localhost:4200/scenarios) and click **Run All Scenarios** to watch live SSE streaming for each case.

## 🧪 Scenario Results

| #   | Title                                           | Primary Agent     | Actual Verdict       |
| --- | ----------------------------------------------- | ----------------- | -------------------- |
| S1  | GitHub Actions minutes not available            | EntitlementsAgent | `escalate`           |
| S2  | All premium features suddenly locked            | BillingPlanAgent  | `resolve`            |
| S3  | PAT returns 403 for org repos                   | AuthTokenAgent    | `resolve`            |
| S4  | Getting rate limited on REST API                | ApiRateLimitAgent | `resolve`            |
| S5  | SAML SSO authentication fails                   | AuthTokenAgent    | `escalate`           |
| S6  | Repeated token auth failure (×4)                | AuthTokenAgent    | `escalate` (auto ≥3) |
| S7  | GitHub not working (vague)                      | OrchestratorAgent | `clarify`            |
| S8  | Billing issue blocking CI/CD and API automation | BillingPlanAgent  | `resolve`            |

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
