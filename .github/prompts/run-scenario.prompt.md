---
mode: 'agent'
description: 'Execute a pre-seeded support scenario end-to-end and report the outcome'
---

Run a numbered test scenario through the GitHub Support Resolution System
and report the full agent trace and resolution outcome.

## Scenario Catalogue

| #   | Category       | Description                                           | Key agents                         |
| --- | -------------- | ----------------------------------------------------- | ---------------------------------- |
| 1   | Entitlements   | Advanced Security feature not unlocking after upgrade | EntitlementsAgent, ResolutionAgent |
| 2   | Billing/Plan   | Seats over-provisioned, invoice dispute               | BillingPlanAgent, ResolutionAgent  |
| 3   | Auth/Token     | OAuth token returning 401 after org SSO enforced      | AuthTokenAgent, ResolutionAgent    |
| 4   | API Rate Limit | GitHub Actions hitting secondary rate limits          | ApiRateLimitAgent, ResolutionAgent |
| 5   | Auth/Token     | SAML authentication loop on enterprise login          | AuthTokenAgent, ResolutionAgent    |
| 6   | Auth/Token     | PAT scopes insufficient after policy tightened        | AuthTokenAgent, ResolutionAgent    |
| 7   | Mixed          | Org migration breaking webhooks + Actions             | OrchestratorAgent (multi-agent)    |
| 8   | Billing/Plan   | Plan downgrade causing feature loss mid-cycle         | BillingPlanAgent, ResolutionAgent  |

## Pre-flight checks

Before running, verify:

1. Docker services are up: `docker compose ps` → postgres + redis must be healthy.
2. DB is seeded: `npm run db:seed -w packages/backend`
3. Backend and MCP server are running (or start them now).

## How to run

```bash
# From workspace root
npm run dev -w packages/backend &
npm run dev -w packages/mcp-server &

# Then POST the scenario case to the API:
curl -X POST http://localhost:3000/api/cases \
  -H 'Content-Type: application/json' \
  -d '{"scenario": ${input:scenarioNumber}}'
```

Or, if the API is already running, use the Angular dashboard's
**Scenario Runner** panel to trigger scenario `${input:scenarioNumber}`.

## Expected output

Report back:

- `case_id` assigned
- Which agents ran (in order)
- Each agent's `verdict`, `confidence`, and `summary`
- Final `CaseOutcome` verdict: `resolve | clarify | escalate`
- Any MCP tool errors or RAG misses encountered

## What to do

Run scenario **${input:scenarioNumber}** and show me the full agent trace and final outcome.
If any service is not running, start it first and explain what you started.
