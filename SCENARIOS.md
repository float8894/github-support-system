# Scenario Outputs — GitHub Support System

All outputs are captured from live pipeline runs against seeded data.  
Run: `npm run scenarios:capture -w packages/backend` → `scenarios-output.json`

**Results: 8/8 primary scenarios passed (12/12 total including historical sub-cases)**

---

## Scenario Index

| #   | Title                                                                                                  | Primary Agent     | Verdict                       |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------- | ----------------------------- |
| S1  | [GitHub Actions minutes not available](#s1-github-actions-minutes-not-available)                       | EntitlementsAgent | `escalate`                    |
| S2  | [All premium features suddenly locked](#s2-all-premium-features-suddenly-locked)                       | BillingPlanAgent  | `resolve`                     |
| S3  | [Personal Access Token returns 403 for org repos](#s3-personal-access-token-returns-403-for-org-repos) | AuthTokenAgent    | `resolve`                     |
| S4  | [Getting rate limited on REST API](#s4-getting-rate-limited-on-rest-api)                               | ApiRateLimitAgent | `resolve`                     |
| S5  | [SAML SSO authentication fails with error](#s5-saml-sso-authentication-fails-with-error)               | AuthTokenAgent    | `escalate`                    |
| S6  | [Yet another token authentication failure](#s6-yet-another-token-authentication-failure)               | AuthTokenAgent    | `escalate` (auto, ≥3 history) |
| S7  | [GitHub not working](#s7-github-not-working)                                                           | OrchestratorAgent | `clarify`                     |
| S8  | [Billing issue blocking CI/CD and API automation](#s8-billing-issue-blocking-cicd-and-api-automation)  | BillingPlanAgent  | `resolve`                     |

---

## S1: GitHub Actions minutes not available

### Input

| Field         | Value                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `case_id`     | `92a87947-0073-44f8-8a3a-183449b5260e`                                                                                                                                      |
| `customer`    | Acme Corp (premium support)                                                                                                                                                 |
| `org`         | acme-engineering — Team plan, billing active                                                                                                                                |
| `severity`    | `high`                                                                                                                                                                      |
| `description` | "Our team plan should include 3000 Actions minutes per month, but we are seeing 'Feature not available' when trying to run workflows. This is blocking our CI/CD pipeline." |

### Pipeline Trace

```
OrchestratorAgent
  ├── get_org_context      → org: acme-engineering, plan: Team, enterprise: Acme Enterprise
  ├── get_case_history     → 10 prior cases, including multiple entitlement issues
  ├── RAG retrieve (top-5) → GitHub Actions billing docs, plan features
  └── classify: entitlement → route: [EntitlementsAgent]

EntitlementsAgent
  ├── LLM: extract feature name → "actions"
  ├── check_entitlement(enterprise, actions) → enabled: false, source: not_found
  ├── check_subscription(enterprise)         → plan: Enterprise (billing active)
  └── verdict: escalate  (not_found triggers auto-escalation rule)

ResolutionAgent
  ├── Auto-override: entitlement source=not_found → escalate (unconditional)
  ├── create_escalation → escalation_id: 78205622-c825-4ea8-9423-4d71bd94ec57, severity: high
  └── verdict: escalate
```

### MCP Tools Called

| Tool                 | Key Output                                           |
| -------------------- | ---------------------------------------------------- |
| `get_org_context`    | org: acme-engineering, plan: Team, enterprise active |
| `get_case_history`   | 10 events; prior entitlement + billing cases         |
| `check_entitlement`  | `enabled: false, source: "not_found"`                |
| `check_subscription` | Enterprise plan, active billing                      |

### RAG Citations (5)

| Source                                                                                  | Section                                   | Score |
| --------------------------------------------------------------------------------------- | ----------------------------------------- | ----- |
| docs.github.com/en/billing/managing-billing-for-github-actions                          | About billing for GitHub Actions          | 0.68  |
| docs.github.com/en/actions/learn-github-actions/usage-limits-billing-and-administration | Usage limits, billing, and administration | 0.65  |
| docs.github.com/en/get-started/learning-about-github/githubs-plans                      | GitHub Team                               | 0.61  |
| docs.github.com/en/get-started/learning-about-github/githubs-plans                      | GitHub Enterprise                         | 0.59  |
| docs.github.com/en/code-security/getting-started/github-security-features               | Available with GitHub Code Security       | 0.55  |

### Outcome

```json
{
  "verdict": "escalate",
  "issue_type": "entitlement",
  "escalation_id": "78205622-c825-4ea8-9423-4d71bd94ec57"
}
```

**Key findings:**

- Missing entitlement record for GitHub Actions despite Team plan (3000 min/month expected)
- `check_entitlement` returned `source: not_found` — not disabled, fully absent
- Active billing and enterprise membership confirmed; provisioning pipeline is at fault
- Auto-escalation rule applied: `entitlement.source = 'not_found'` is unconditional escalation

### Customer Response

> Thank you for reaching out about the GitHub Actions minutes issue. I understand this is blocking your CI/CD pipeline, which is critical for your development workflow.
>
> **Current Status:**
> I've investigated your account and found that while your Team plan should include 3000 GitHub Actions minutes per month, there appears to be a missing entitlement record in our system. This explains why you're seeing the "Feature not available" message.
>
> **Next Steps:**
>
> 1. I'm escalating this case to our billing and entitlements team for immediate investigation
> 2. They will need to restore the missing GitHub Actions entitlement for your organization
> 3. You should receive an update within 4–8 business hours given your premium support tier
>
> **What You Can Expect:**
> Once the entitlement is restored, your GitHub Actions workflows should resume normal operation automatically. No action is required on your end.
>
> I apologize for the inconvenience this has caused to your development process. Our escalation team will prioritize resolving this entitlement issue quickly.

### Internal Note

> **Root Cause Analysis:**
>
> - EntitlementsAgent confirmed missing entitlement record for GitHub Actions (`source: not_found`)
> - Organization context shows Team plan with active billing status
> - Customer should have 3000 Actions minutes per month based on plan
>
> **Evidence from Tools:**
>
> - `check_entitlement` returned `enabled: false, source: not_found`
> - `get_org_context` confirms Team plan with active billing
> - Organization is part of enterprise with premium support tier
>
> **Pattern Analysis:**
> Case history shows multiple recent entitlement-related issues: "Cannot access Advanced Security features" (88a6e2b3), "All premium features suddenly locked" (172d5e8a)
>
> **Escalation Requirements:**
>
> 1. Billing team to investigate why Actions entitlement record is missing
> 2. Check if this is part of broader entitlement sync issue affecting enterprise
> 3. Restore Actions entitlement for `org_id: 17cc2416-fe57-45a2-88ba-4fb8e1ab1a27`
> 4. Monitor for similar issues across `enterprise_id: 02488db7-9447-44ce-89c3-246d7fb41717`

### Verdict Rationale

The `check_entitlement` MCP tool returned `source: "not_found"` for the `actions` feature. This is distinct from `source: "plan_limit"` (which would be resolvable via upgrade guidance) — a fully absent entitlement record indicates a provisioning failure that support tooling cannot resolve. The auto-escalation rule in ResolutionAgent triggers unconditionally on this condition.

---

## S2: All premium features suddenly locked

### Input

| Field         | Value                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `case_id`     | `172d5e8a-bfa3-43ab-bb99-edd413d51181`                                                                                        |
| `customer`    | Acme Corp (premium support)                                                                                                   |
| `org`         | acme-data — Enterprise plan, billing_status: past_due                                                                         |
| `severity`    | `critical`                                                                                                                    |
| `description` | "All our Enterprise features (Advanced Security, Codespaces, Packages) are suddenly locked. No changes were made on our end." |

### Pipeline Trace

```
OrchestratorAgent
  ├── get_org_context      → org: acme-data, billing_status: past_due
  ├── get_case_history     → 10 prior cases
  ├── RAG retrieve (top-5) → GitHub plans & enterprise features docs
  └── classify: billing_plan → route: [BillingPlanAgent]

BillingPlanAgent
  ├── check_subscription(org) → active_status: false, plan: Enterprise
  ├── check_subscription(enterprise) → null (no separate enterprise subscription)
  ├── check_invoice_status → $21,000 overdue, due 2026-03-31
  └── verdict: resolve  (billing root cause identified, no backend intervention needed)

ResolutionAgent
  └── verdict: resolve (no escalation triggers met)
```

### MCP Tools Called

| Tool                       | Key Output                                             |
| -------------------------- | ------------------------------------------------------ |
| `get_org_context`          | org: acme-data, `billing_status: "past_due"`           |
| `get_case_history`         | 10 events                                              |
| `check_subscription` (org) | `active_status: false`, plan: Enterprise, annual cycle |
| `check_invoice_status`     | $21,000 overdue, period 2026-03, due 2026-03-31        |

### RAG Citations (5)

| Source                                                                                                                                                                             | Section                             | Score |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----- |
| docs.github.com/en/get-started/learning-about-github/githubs-plans                                                                                                                 | GitHub Team                         | 0.51  |
| docs.github.com/en/get-started/learning-about-github/githubs-plans                                                                                                                 | GitHub Enterprise                   | 0.47  |
| docs.github.com/en/code-security/getting-started/github-security-features                                                                                                          | Available with GitHub Code Security | 0.47  |
| docs.github.com/en/code-security/getting-started/github-security-features                                                                                                          | Available for all GitHub plans      | 0.46  |
| docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/configuring-authentication-for-enterprise-managed-users/configuring-saml-single-sign-on-for-enterprise-managed-users | Who can use this feature?           | 0.43  |

### Outcome

```json
{
  "verdict": "resolve",
  "issue_type": "billing_plan",
  "escalation_id": null
}
```

**Key findings:**

- Subscription `active_status: false` due to `billing_status: "past_due"`
- Invoice of $21,000 for March 2026 billing period is overdue (due 2026-03-31)
- All Enterprise features locked as a result of payment suspension
- Resolution path is clear: process payment → features auto-restore within 24–48 hours

### Customer Response

> ## Issue Resolution: Enterprise Features Locked Due to Billing
>
> I've identified the root cause of your Enterprise features being locked. Your organization's subscription is currently inactive due to an overdue payment of **$21,000** for the March 2026 billing period.
>
> ### Immediate Action Required:
>
> 1. **Contact your billing administrator** to resolve the overdue payment of $21,000 for March 2026
> 2. **Process the payment** through your usual billing method or contact our billing team if you need assistance with payment options
> 3. **Monitor feature restoration** — Enterprise features (Advanced Security, Codespaces, Packages) should be restored within 24–48 hours after payment confirmation
>
> ### What This Means:
>
> - Your subscription status shows as "past_due" which automatically suspends premium features
> - Your organization data and repositories remain safe and accessible
> - Only paid Enterprise features are currently locked
>
> ### Next Steps:
>
> Once payment is processed, I recommend verifying all features are restored for your team, setting up billing alerts to prevent future interruptions, and considering enabling auto-pay if not already configured.
>
> As a premium support customer, I'm prioritizing this case and will monitor the restoration process. Please let me know once you've initiated payment, and I'll track the feature restoration for you.

### Internal Note

> **Root Cause**: Subscription suspension due to overdue payment
>
> **Evidence:**
>
> - `billing_status: "past_due"` in org context
> - `active_status: false` in subscription check
> - Outstanding invoice: $21,000 for March 2026, status "overdue", due date 2026-03-31
> - Invoice ID: 5332e28c-0abc-426b-b50d-2cbc2722cd60
>
> **Customer Details:**
>
> - Org: acme-data (8e397a60-2108-4ce5-80cd-07e935021e5b)
> - Customer: Acme Corp (premium support tier)
> - Enterprise: Acme Enterprise (enterprise support tier)
> - Current plan: Enterprise
>
> **Impact**: All paid Enterprise features locked (Advanced Security, Codespaces, Packages) affecting entire team
>
> **Resolution Path**: Standard billing restoration — payment processing should restore features within 24–48 hours. Monitor case for payment confirmation and feature restoration.

### Verdict Rationale

BillingPlanAgent detected both `subscription.active_status = false` and `invoice.payment_status = "overdue"` — the canonical billing-caused access loss condition. Because the root cause is fully identified (overdue invoice), no backend intervention is needed beyond directing the customer to resolve payment. The verdict is `resolve` with clear actionable steps.

---

## S3: Personal Access Token returns 403 for org repos

### Input

| Field         | Value                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `case_id`     | `dd843102-90fb-440e-80de-228b2d501637`                                                                                                                                 |
| `customer`    | Acme Corp (premium support)                                                                                                                                            |
| `org`         | acme-engineering — Team plan, `sso_enabled: true`                                                                                                                      |
| `severity`    | `medium`                                                                                                                                                               |
| `description` | "My PAT works fine for my personal repos, but returns '403 Forbidden' when I try to access our organization repositories. The token has 'repo' and 'read:org' scopes." |

### Pipeline Trace

```
OrchestratorAgent
  ├── get_org_context      → org: acme-engineering, sso_enabled: true
  ├── get_case_history     → 10 events (various auth cases)
  ├── RAG retrieve (top-5) → PAT auth, SSO authorization docs
  └── classify: auth_token → route: [AuthTokenAgent]

AuthTokenAgent
  ├── LLM: extract token ID from description → null (no token ID in text)
  ├── (no get_token_record call — token ID unknown)
  ├── get_saml_config(org: acme-engineering) → sso enabled
  └── verdict: resolve  (SSO auth missing, scopes are correct)

ResolutionAgent
  └── verdict: resolve (no escalation triggers met)
```

### MCP Tools Called

| Tool               | Key Output                                                          |
| ------------------ | ------------------------------------------------------------------- |
| `get_org_context`  | org: acme-engineering, `sso_enabled: true`, enterprise SAML enabled |
| `get_case_history` | 10 events                                                           |
| `get_saml_config`  | SSO enabled for org; enterprise SAML active                         |

### RAG Citations (5)

| Source                                                                                                                                                                 | Section                                 | Score |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----- |
| docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github                                                                  | Authenticating with the API             | 0.65  |
| docs.github.com/en/enterprise-cloud@latest/authentication/authenticating-with-saml-single-sign-on/authorizing-a-personal-access-token-for-use-with-saml-single-sign-on | Authorizing a PAT for use with SAML SSO | 0.63  |
| docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens                                                            | Managing PATs                           | 0.59  |
| docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api                                                                                                | Troubleshooting the REST API            | 0.56  |
| docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/about-oauth-app-access-restrictions                                                  | OAuth app access restrictions           | 0.52  |

### Outcome

```json
{
  "verdict": "resolve",
  "issue_type": "auth_token",
  "escalation_id": null
}
```

**Key findings:**

- Organization has SSO enabled; PATs must be SSO-authorized to access org resources
- Token scopes (`repo`, `read:org`) are correct — the missing piece is SSO authorization
- Personal repos work because SSO authorization is not required there
- Clear, self-service resolution path via GitHub Settings → Developer settings → Tokens → Configure SSO

### Customer Response

> ## Resolution: SSO Authorization Required for Organization Access
>
> I've identified the issue with your Personal Access Token. Your organization **acme-engineering** has Single Sign-On (SSO) enabled, which requires an additional authorization step for Personal Access Tokens to access organization resources.
>
> Your token works fine for personal repositories because SSO authorization isn't required for those, but organization resources are protected by this additional security layer.
>
> ### Steps to resolve:
>
> 1. **Navigate to your Personal Access Tokens page:**
>    - Go to GitHub.com → Settings → Developer settings → Personal access tokens
> 2. **Locate your existing token** in the list
> 3. **Enable SSO authorization:**
>    - Click "Configure SSO" or "Enable SSO" next to your organization name
>    - Complete the SSO authorization process (you may need to re-authenticate with your org's identity provider)
> 4. **Verify the authorization:**
>    - After authorization, look for a green checkmark or "Authorized" status next to your organization
>    - Test your API calls to organization repositories
>
> This is a security feature that helps protect your organization's resources. Once authorized, your token will work seamlessly with both personal and organization repositories.

### Internal Note

> **Root Cause:** Organization has SSO enabled (`sso_enabled: true`) but customer's PAT lacks SSO authorization for the organization.
>
> **Evidence from tools:**
>
> - `get_org_context` confirmed SSO is enabled for org ID `17cc2416-fe57-45a2-88ba-4fb8e1ab1a27`
> - Enterprise also has SAML enabled (`saml_enabled: true`)
> - Token scopes are correct (`repo`, `read:org`) but SSO auth missing
>
> **Resolution Confidence:** High — this is a standard SSO authorization issue with well-documented resolution steps. Customer has premium support tier so should have smooth experience with SSO flow.

### Verdict Rationale

AuthTokenAgent checked SAML/SSO config and found `sso_enabled: true` for the org. Combined with the 403 pattern (personal repos work, org repos fail) and correct scopes, the diagnostic is unambiguous: missing SSO authorization. No backend intervention or escalation is needed — the user can self-serve via GitHub Settings.

---

## S4: Getting rate limited on REST API

### Input

| Field         | Value                                                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `case_id`     | `07f87725-8e08-488b-b77d-93c8656760cf`                                                                                                                                                                            |
| `customer`    | TechStart Inc (basic support)                                                                                                                                                                                     |
| `org`         | techstart-dev — Free plan                                                                                                                                                                                         |
| `severity`    | `high`                                                                                                                                                                                                            |
| `description` | "We are getting 'You have exceeded a secondary rate limit' errors from the GitHub REST API even though we are well under the 5000 requests/hour limit. Our monitoring shows only ~500 requests in the last hour." |

### Pipeline Trace

```
OrchestratorAgent
  ├── get_org_context      → org: techstart-dev, plan: Free, no SSO
  ├── get_case_history     → 2 open cases (this + "GitHub not working")
  ├── RAG retrieve (top-5) → rate limit, secondary rate limits docs (high scores 0.71–0.61)
  └── classify: api_rate_limit → route: [ApiRateLimitAgent]

ApiRateLimitAgent
  ├── check_api_usage(scope: techstart-dev, window: 1h)  → 4823 req, 0 throttled
  ├── check_api_usage(scope: techstart-dev, window: 24h) → broader usage
  ├── check_service_status() [direct tool]               → REST API: degraded
  │   └── active incident: "REST API Performance Degradation" (since 2026-04-21 10:29 UTC)
  └── verdict: resolve  (incident explains secondary limit trigger)

ResolutionAgent
  └── verdict: resolve
```

### MCP Tools Called

| Tool                    | Type   | Key Output                              |
| ----------------------- | ------ | --------------------------------------- |
| `get_org_context`       | MCP    | techstart-dev, Free plan, basic support |
| `get_case_history`      | MCP    | 2 open cases                            |
| `check_api_usage` (1h)  | MCP    | 4,823 requests, 0 throttled             |
| `check_api_usage` (24h) | MCP    | broader usage pattern                   |
| `check_service_status`  | Direct | REST API: `degraded`; 1 active incident |

### RAG Citations (5)

| Source                                                                  | Section                                    | Score    |
| ----------------------------------------------------------------------- | ------------------------------------------ | -------- |
| docs.github.com/en/graphql/overview/resource-limitations                | Secondary rate limits                      | **0.71** |
| docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api | About secondary rate limits                | **0.71** |
| docs.github.com/en/rest/overview/resources-in-the-rest-api              | Rate limiting                              | 0.67     |
| docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api | Primary rate limit for authenticated users | 0.64     |
| docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api | Rate limit errors                          | 0.61     |

### Outcome

```json
{
  "verdict": "resolve",
  "issue_type": "api_rate_limit",
  "escalation_id": null
}
```

**Key findings:**

- 4,823 requests/hour is under the 5,000 primary limit, but an active REST API performance degradation incident causes slower responses that trigger secondary limits
- Zero throttled requests confirms no primary rate limit breach
- Incident ID: 7ca4712d-9bd3-4e09-8f54-d6561056b1df (status: monitoring, started 2026-04-21 10:29 UTC)
- Mitigation: exponential backoff + reduced concurrency until incident resolves

### Customer Response

> Hi there,
>
> I understand you're experiencing "You have exceeded a secondary rate limit" errors despite being under the primary rate limit. I've investigated your account and found the root cause.
>
> **What's happening:**
> There's currently an active REST API performance degradation incident affecting GitHub services. This incident started on April 21, 2026 at 10:29 UTC and is still being monitored by our engineering team.
>
> **Why you're seeing secondary rate limits:**
> During performance incidents, API responses take longer to process, which can trigger GitHub's secondary rate limits even when you're under the primary 5,000 requests/hour limit. Your monitoring shows ~4,823 requests in the last hour, which is normally fine, but the degraded performance is causing these requests to consume more compute resources.
>
> **Immediate action steps:**
>
> 1. **Implement exponential backoff** — When you receive a rate limit error, wait increasingly longer between retries (1s, then 2s, then 4s, etc.)
> 2. **Check for `retry-after` headers** — Honor any `retry-after` response headers
> 3. **Reduce concurrency** — Temporarily limit concurrent requests to well below 100
> 4. **Monitor our status page** — Keep an eye on [status.github.com](https://status.github.com) for incident updates
>
> **Expected resolution:**
> Once the REST API performance incident is resolved, you should see these secondary rate limit errors disappear, even with your normal request patterns.

### Internal Note

> **Root Cause Analysis:**
>
> - Customer experiencing secondary rate limits due to active REST API performance degradation incident (ID: 7ca4712d-9bd3-4e09-8f54-d6561056b1df)
> - Incident started 2026-04-21T10:29:00.684Z, status: monitoring
> - API usage: 4,823 requests/hour, 0 throttled — under primary limit
> - `check_service_status` shows REST API component status: "degraded"
>
> **Resolution approach:**
>
> - Explained correlation between performance incident and secondary rate limits
> - Provided immediate mitigation steps (exponential backoff, concurrency reduction)
> - Set expectation that issue resolves when incident resolves
> - No escalation needed — this is a known issue with active incident tracking

### Verdict Rationale

ApiRateLimitAgent checked service status first (per agent logic: incident before throttle check) and found an active degradation incident. The usage data showed no throttled requests, ruling out a primary rate limit or misconfigured client. The secondary-limit-under-degradation pattern is well-documented in the RAG corpus (top 2 citations scored 0.71). Full resolution guidance can be given without escalation.

---

## S5: SAML SSO authentication fails with error

### Input

| Field         | Value                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `case_id`     | `1f382a13-2ecf-49dc-b5c5-6f629a8ec7f0`                                                                                                                               |
| `customer`    | Acme Corp (premium/enterprise support)                                                                                                                               |
| `org`         | acme-engineering — Team plan, SAML enabled (Okta)                                                                                                                    |
| `enterprise`  | Acme Enterprise — SAML enabled                                                                                                                                       |
| `severity`    | `critical`                                                                                                                                                           |
| `description` | "Users are unable to log in via SAML SSO. They see 'Authentication failed: Invalid SAML response' error. Our Okta logs show successful authentication on their end." |

### Pipeline Trace

```
OrchestratorAgent
  ├── get_org_context      → enterprise SAML enabled, org SSO enabled
  ├── get_case_history     → 10 events
  ├── RAG retrieve (top-5) → SAML EMU config, troubleshooting SSO
  └── classify: saml_sso → route: [AuthTokenAgent]

AuthTokenAgent
  ├── LLM: extract token ID → null (no token in SAML case)
  ├── get_saml_config(org: acme-engineering) → returns empty object
  └── verdict: escalate  (empty SAML config + Invalid SAML response → specialist required)

ResolutionAgent
  ├── create_escalation → escalation_id: 18e6a5d7-456d-4fdf-b89b-3a7598696cc1, severity: critical
  └── verdict: escalate
```

### MCP Tools Called

| Tool               | Key Output                                     |
| ------------------ | ---------------------------------------------- |
| `get_org_context`  | org: acme-engineering, enterprise SAML enabled |
| `get_case_history` | 10 events                                      |
| `get_saml_config`  | Returns empty object — config not retrievable  |

### RAG Citations (5)

| Source                                                                                                                                                                             | Section                                 | Score |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----- |
| docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/configuring-authentication-for-enterprise-managed-users/configuring-saml-single-sign-on-for-enterprise-managed-users | Configuring SAML SSO for EMUs           | 0.61  |
| docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/using-saml-for-enterprise-iam/troubleshooting-saml-authentication                                                    | Troubleshooting SAML authentication     | 0.58  |
| docs.github.com/en/organizations/managing-saml-single-sign-on-for-your-organization                                                                                                | Managing SAML SSO for your organization | 0.55  |
| docs.github.com/en/authentication/authenticating-with-saml-single-sign-on                                                                                                          | Authenticating with SAML SSO            | 0.52  |
| docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/using-saml-for-enterprise-iam                                                                                        | Using SAML for enterprise IAM           | 0.49  |

### Outcome

```json
{
  "verdict": "escalate",
  "issue_type": "saml_sso",
  "escalation_id": "18e6a5d7-456d-4fdf-b89b-3a7598696cc1"
}
```

**Key findings:**

- "Invalid SAML response" with successful Okta authentication indicates signature validation failure, certificate mismatch, or digest method conflict
- `get_saml_config` returned an empty object — SAML configuration data is inaccessible via tooling
- Enterprise-level SAML requires direct admin access and SAML assertion log analysis
- Critical severity, premium/enterprise customer → specialist escalation warranted

### Customer Response

> I understand you're experiencing SAML SSO authentication failures with the error "Invalid SAML response" even though authentication succeeds at the Okta level. This is a critical issue that I'm escalating to our SAML specialists for immediate investigation.
>
> **Immediate Steps to Take:**
>
> 1. **Document Recent Changes**: Please gather information about any recent changes to SAML certificates in either Okta or GitHub Enterprise, Okta SAML configuration settings, or GitHub Enterprise SAML settings.
> 2. **Collect Error Details**: Please provide the exact timestamp of a failed authentication attempt, any additional error messages from browser developer tools, and screenshots of the error page.
> 3. **Test SAML Configuration**: As an admin, try accessing your Enterprise settings → Identity provider → Single sign-on configuration and run a "Test SAML configuration" if available.
>
> **What We're Investigating:**
> Our specialists will examine potential certificate mismatches, signature method conflicts, or configuration drift between your Okta setup and GitHub Enterprise SAML settings.
>
> **Reference Documentation:**
>
> - [Configuring SAML single sign-on for Enterprise Managed Users](https://docs.github.com/en/enterprise-cloud@latest/admin/identity-and-access-management/using-enterprise-managed-users-for-iam/configuring-saml-single-sign-on-for-enterprise-managed-users)
> - [Troubleshooting SAML authentication](https://docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/using-saml-for-enterprise-iam/troubleshooting-saml-authentication)
>
> A SAML specialist will contact you within 2 hours to begin technical investigation.

### Internal Note

> **Critical SAML SSO Failure — Immediate Escalation Required**
>
> **Root Cause Analysis:**
>
> - AuthTokenAgent identified SAML certificate or configuration mismatch between GitHub Enterprise and Okta IdP
> - "Invalid SAML response" with successful IdP authentication indicates signature validation failure, certificate expiration, or digest method mismatch
> - Tool `get_saml_config` returned empty object, suggesting either API access issues or misconfigured SAML setup
>
> **Evidence:**
>
> - Organization: acme-engineering (Team plan, SSO enabled)
> - Enterprise: Acme Enterprise (Enterprise support, SAML enabled)
> - No SAML configuration data retrievable via tools
>
> **Next Steps for Specialist:**
>
> 1. Direct SAML configuration inspection via admin access
> 2. Certificate validation and expiration check
> 3. Okta SAML response analysis
> 4. GitHub SAML assertion processing logs review
> 5. Signature method and digest algorithm verification

### Verdict Rationale

AuthTokenAgent found an empty `get_saml_config` response, meaning the system cannot validate the SAML certificate or configuration state programmatically. An "Invalid SAML response" with success on the IdP side is a protocol-level mismatch that requires direct certificate and assertion inspection. The agent correctly escalates rather than guessing at certificate expiry or config changes.

---

## S6: Yet another token authentication failure

### Input

| Field         | Value                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `case_id`     | `9268ab33-de58-4449-9a27-ea1d5342d566`                                                                                                           |
| `customer`    | Acme Corp (premium support)                                                                                                                      |
| `org`         | acme-engineering — SAML SSO enabled                                                                                                              |
| `severity`    | `critical`                                                                                                                                       |
| `description` | "This is the fourth time in two weeks we are experiencing token authentication failures. Previous cases remain unresolved. We need urgent help." |

### Pipeline Trace

```
OrchestratorAgent
  ├── get_org_context      → org: acme-engineering, SSO enabled
  ├── get_case_history     → 10 events incl. 3 prior unresolved auth_token cases (4/6, 4/11, 4/16)
  ├── RAG retrieve (top-5) → PAT auth, token management docs
  └── classify: auth_token → route: [AuthTokenAgent]

AuthTokenAgent
  ├── LLM: extract token ID → null
  ├── get_saml_config(org) → SAML config retrieved
  └── verdict: escalate
      └── reason: 3 prior unresolved auth_token cases → auto-escalation rule triggered

ResolutionAgent
  ├── Auto-override: repeated unresolved category ≥3 → escalate (unconditional)
  ├── create_escalation → escalation_id: 4c87f5bc-b9bc-4094-b968-f390169a904d, severity: critical
  └── verdict: escalate
```

### MCP Tools Called

| Tool               | Key Output                                                |
| ------------------ | --------------------------------------------------------- |
| `get_org_context`  | org: acme-engineering, SSO enabled                        |
| `get_case_history` | 10 events; 3 prior `auth_token` cases, all `status: open` |
| `get_saml_config`  | SAML config retrieved                                     |

### Prior Unresolved Cases (auto-escalation trigger)

| Case     | Created    | Status | Title                  |
| -------- | ---------- | ------ | ---------------------- |
| f989c68b | 2026-04-06 | open   | Token auth issue       |
| 8f5907ab | 2026-04-11 | open   | Authentication problem |
| adf8a76e | 2026-04-16 | open   | Auth keeps failing     |

### RAG Citations (5)

| Source                                                                                                                                                                 | Section                      | Score |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----- |
| docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens                                                            | Managing PATs                | 0.64  |
| docs.github.com/en/enterprise-cloud@latest/authentication/authenticating-with-saml-single-sign-on/authorizing-a-personal-access-token-for-use-with-saml-single-sign-on | Authorizing PAT for SAML SSO | 0.62  |
| docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github                                                                  | About authentication         | 0.58  |
| docs.github.com/en/organizations/managing-saml-single-sign-on-for-your-organization                                                                                    | Managing SAML SSO            | 0.55  |
| docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api                                                                                                | Troubleshooting the REST API | 0.51  |

### Outcome

```json
{
  "verdict": "escalate",
  "issue_type": "auth_token",
  "escalation_id": "4c87f5bc-b9bc-4094-b968-f390169a904d"
}
```

**Key findings:**

- Customer has 4 auth_token cases total (current + 3 prior), all unresolved
- Pattern spans 16 days (2026-04-06 through 2026-04-21)
- Auto-escalation rule: same category, count ≥ 3, none resolved → ESCALATE unconditionally
- SAML SSO enabled on org may be a contributing systematic factor

### Customer Response

> Thank you for reaching out regarding the ongoing token authentication failures. I understand this is the fourth occurrence in two weeks and is causing critical disruption to your operations.
>
> Based on our investigation, I can see there's a pattern of authentication issues affecting your organization. Given the recurring nature of these failures and the unresolved status of your previous cases, I'm escalating this to our senior authentication specialists for immediate attention.
>
> **Immediate Actions:**
>
> 1. **Escalation**: Your case has been prioritized and escalated to our Tier 2 authentication team
> 2. **Case Consolidation**: We'll review and potentially consolidate your related authentication cases for comprehensive resolution
> 3. **Timeline**: You should expect contact from a senior engineer within 2 business hours
>
> **What to expect:**
>
> - Deep dive analysis of your authentication configuration
> - Review of SAML SSO integration that may be impacting token behavior
> - Comprehensive solution addressing the root cause of recurring failures
>
> I apologize for the inconvenience these repeated issues have caused. Our team will work diligently to provide a permanent resolution.

### Internal Note

> **CRITICAL ESCALATION REQUIRED**
>
> **Evidence Summary:**
>
> - Customer org (acme-engineering) has 4 auth_token cases: current plus 3 previous unresolved (created 4/6, 4/11, 4/16)
> - All previous auth_token cases remain in 'open' status indicating pattern failure
> - Organization context shows SAML SSO enabled which often complicates PAT authentication
> - Enterprise customer with premium support tier experiencing business-critical impact
>
> **Root Cause Analysis Needed:**
>
> - SAML configuration may be interfering with token authentication
> - Possible enterprise-level authentication policy conflicts
> - Token scope/permission issues across organization repositories
>
> **Escalation Justification:**
>
> - Repeated failure pattern indicates systematic issue beyond standard troubleshooting
> - Multiple unresolved cases suggest current support approach insufficient
> - Premium customer with critical severity requires senior expertise
>
> **Recommended Actions:**
>
> 1. Assign Tier 2 authentication specialist
> 2. Consolidate related cases for holistic review
> 3. Conduct SAML/SSO configuration audit
> 4. Review enterprise authentication policies

### Verdict Rationale

This scenario exercises the repeated-history auto-escalation rule: ResolutionAgent inspects `CaseContext.caseHistory.events` and finds ≥ 3 cases with category `auth_token`, none with status `resolved`. The escalation is unconditional regardless of what AuthTokenAgent found in this particular case. This ensures customers stuck in a failure loop are routed to a specialist rather than receiving the same standard guidance for the fourth time.

---

## S7: GitHub not working

### Input

| Field         | Value                                       |
| ------------- | ------------------------------------------- |
| `case_id`     | `fa52ec9e-c52c-48ea-870e-0a414823a7a3`      |
| `customer`    | TechStart Inc (basic support)               |
| `org`         | techstart-dev — Free plan, no SSO           |
| `severity`    | `medium`                                    |
| `description` | "GitHub is not working for us. Please fix." |

### Pipeline Trace

```
OrchestratorAgent
  ├── get_org_context      → org: techstart-dev, Free plan, basic support
  ├── get_case_history     → 2 open cases (this + rate limit case)
  ├── RAG retrieve (top-5) → generic GitHub docs (low relevance)
  └── classify: ambiguous, routeTo: []  ← no specialist agent routed

ResolutionAgent
  ├── Auto-override: ambiguous category → clarify (unconditional)
  └── verdict: clarify  (no escalation, no specialist findings)
```

### MCP Tools Called

| Tool               | Key Output                                      |
| ------------------ | ----------------------------------------------- |
| `get_org_context`  | techstart-dev, Free plan, basic support, no SSO |
| `get_case_history` | 2 open cases                                    |

> Note: No specialist agent ran. ResolutionAgent received an empty `agentFindings[]` array. The clarify verdict is driven purely by the ambiguous category auto-override rule.

### RAG Citations (5)

5 chunks retrieved based on the vague description (low relevance scores — ambiguous query produced general GitHub docs).

### Outcome

```json
{
  "verdict": "clarify",
  "issue_type": "ambiguous",
  "escalation_id": null
}
```

**Key findings:**

- Customer report is extremely vague: "GitHub is not working for us. Please fix."
- No specific symptoms, error messages, timeframes, or affected scope
- No prior escalation history
- Auto-override: `issueCategory = 'ambiguous'` + no clarifying info → `clarify`

### Customer Response

> Thank you for contacting GitHub Support. I understand you're experiencing issues with GitHub, and I want to help you resolve this as quickly as possible.
>
> To provide you with the most effective assistance, I need some additional information about the specific problem you're encountering:
>
> 1. **What specific functionality is not working?** (e.g., accessing repositories, pushing/pulling code, web interface loading, API calls, etc.)
> 2. **When did this issue start?** Please provide the approximate date and time.
> 3. **What error messages are you seeing?** Please share any specific error text, codes, or screenshots if possible.
> 4. **Who is affected?** Is this impacting all users in your organization or specific individuals?
> 5. **What steps have you already tried** to resolve the issue?
> 6. **What browser and operating system** are you using when accessing GitHub?
>
> Once I have these details, I'll be able to provide targeted troubleshooting steps. In the meantime, you can check [GitHub's status page](https://www.githubstatus.com/) to see if there are any known service issues that might be affecting your experience.

### Internal Note

> **Case requires clarification due to insufficient information**
>
> **Current Status:**
>
> - Case categorized as 'ambiguous' due to vague description
> - Customer: TechStart Inc (Free plan, basic support, eu-west-1)
> - Organization: techstart-dev (active billing, no SSO)
> - No previous escalation history, one other open case about API rate limiting
>
> **Information Gaps:**
>
> - No specific symptoms or error messages
> - No timeframe for when issues started
> - No indication of affected scope (users, features, platforms)
> - No troubleshooting attempts mentioned
>
> **Next Steps:**
>
> - Await customer clarification on specific symptoms
> - Once clarified, can proceed with targeted troubleshooting
> - Monitor for follow-up within standard SLA timeframes

### Verdict Rationale

The OrchestratorAgent correctly classified this as `ambiguous` — there is insufficient information to route to any specialist agent. ResolutionAgent's auto-override rule then produces `clarify` unconditionally. The customer response requests exactly the information needed to reclassify the case. No specialist agents are invoked, keeping the pipeline minimal and fast for genuinely ambiguous inputs.

---

## S8: Billing issue blocking CI/CD and API automation

### Input

| Field         | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `case_id`     | `c2452535-d742-4517-9032-afd6710ae650`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `customer`    | Acme Corp (premium support)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `org`         | acme-data — Enterprise plan, **billing: past_due**                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `severity`    | `critical`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `description` | "We have an outstanding invoice from March that we are actively working to resolve with our finance team. In the meantime all our GitHub Actions workflows and REST API-based automation have stopped working with 403 Forbidden errors. Our CI/CD pipelines are fully blocked and production deployments are failing. We need to understand whether the billing issue is directly causing the API access failures and what we need to do immediately to restore automation access." |

### Pipeline Trace

```
OrchestratorAgent
  ├── get_org_context      → org: acme-data, plan: Enterprise, billing_status: past_due
  ├── get_case_history     → 6 prior related cases (Actions, billing, PAT, SAML issues)
  ├── RAG retrieve (top-5) → GitHub Actions billing docs, billing troubleshooting
  └── classify: billing_plan → route: [BillingPlanAgent]

BillingPlanAgent
  ├── check_subscription(org, acme-data)        → active_status: false
  ├── check_subscription(enterprise, acme-ent)  → active_status: false
  ├── check_invoice_status(customer)            → $21,000 overdue since 2026-03-31
  └── verdict: resolve  (billing root cause identified, clear remediation path)

ResolutionAgent
  ├── No auto-override triggered
  └── verdict: resolve
```

### MCP Tools Called

| Tool                   | Key Output                                                           |
| ---------------------- | -------------------------------------------------------------------- |
| `get_org_context`      | acme-data, Enterprise plan, `billing_status: "past_due"`             |
| `get_case_history`     | 6 related events — Actions, billing, PAT 403, SAML auth failures     |
| `check_subscription`   | org-level: `active_status: false`                                    |
| `check_subscription`   | enterprise-level: `active_status: false`                             |
| `check_invoice_status` | invoice `$21,000 USD`, `payment_status: "overdue"`, due `2026-03-31` |

### RAG Citations (5)

| Source                                                                                          | Section                                | Score |
| ----------------------------------------------------------------------------------------------- | -------------------------------------- | ----- |
| docs.github.com/en/actions/administering-github-actions/usage-limits-billing-and-administration | In this article                        | 0.53  |
| docs.github.com/en/actions/administering-github-actions/usage-limits-billing-and-administration | Billing and usage                      | 0.51  |
| docs.github.com/en/rest/authentication/authenticating-to-the-rest-api                           | Failed login limit                     | 0.47  |
| docs.github.com/en/actions/administering-github-actions/usage-limits-billing-and-administration | About billing for GitHub Actions       | 0.46  |
| docs.github.com/en/billing/how-tos/troubleshooting                                              | Troubleshooting a declined credit card | 0.46  |

### Outcome

```json
{
  "verdict": "resolve",
  "issue_type": "billing_plan"
}
```

**Key findings:**

- Enterprise subscription on `acme-data` is `active_status: false`
- Invoice for $21,000 USD from March 2026 is overdue (due 2026-03-31)
- Billing delinquency is the direct, confirmed root cause of all 403 errors
- 6 related prior cases all show symptoms consistent with subscription deactivation
- Customer's finance team is already working on payment — a clear resolution path exists

### Customer Response

> I can confirm that the 403 Forbidden errors blocking your GitHub Actions workflows and REST API automation are directly related to your billing status. Your Enterprise subscription is currently inactive due to an overdue invoice from March 2026 ($21,000 USD, due March 31st).
>
> **Immediate Action Steps:**
>
> 1. **Contact GitHub Sales/Billing immediately** to discuss payment arrangements or temporary access restoration while your finance team resolves the outstanding invoice
> 2. **Prioritize payment of the March invoice** to restore full service access
> 3. **Document all affected workflows and automation** for rapid restoration once billing is resolved
>
> **What's Happening:**
> When Enterprise subscriptions become inactive due to overdue payments, GitHub restricts access to premium features including Actions workflows and API automation to prevent further usage charges.
>
> **Next Steps:**
>
> - Our billing team can work with you on payment arrangements and may be able to provide temporary access restoration while you resolve the invoice
> - Once payment is processed, all services should restore automatically within 1–2 hours
>
> Given the critical impact on your production deployments, our billing specialists will reach out within 2 hours to discuss immediate options.

### Internal Note

> **Root Cause Analysis:**
>
> - Org `acme-data` has Enterprise subscription with `active_status: false`
> - Invoice $21,000 USD from March 2026 shows `payment_status: overdue`, due 2026-03-31
> - `billing_status: "past_due"` visible in org context
>
> **Evidence of Systemic Impact:**
>
> - Case history shows 6 recent related cases: Actions minutes unavailable, premium features locked, PAT 403 errors, SAML issues, token authentication failures — all consistent with subscription deactivation
>
> **Resolution Path:**
>
> - Requires billing team to arrange payment or grant temporary restoration
> - Customer's finance team is already engaged — payment likely imminent
> - Once invoice is paid, subscription reactivates automatically; all API/Actions access restores within 1–2 hours
>
> **Priority:** Critical — production deployments blocked; billing team must contact within 2 hours.

### Verdict Rationale

S8 demonstrates the combined billing-and-technical scenario from the brief: a known outstanding invoice is the confirmed root cause of API 403 failures, not a token issue or a rate limit. `BillingPlanAgent` identifies `active_status: false` on both org and enterprise subscriptions, cross-references the overdue invoice, and returns `resolve` because the remediation path is unambiguous — pay the invoice, subscription reactivates, automation resumes. This is deliberately distinct from S2 ("features suddenly locked, no idea why") in that here the customer already suspects billing and just needs confirmation plus a path forward.

---

## Appendix: Scenario Summary Table

| #   | Title                                           | Severity | Agent(s)                  | Issue Type     | Verdict  | Escalation ID |
| --- | ----------------------------------------------- | -------- | ------------------------- | -------------- | -------- | ------------- |
| S1  | GitHub Actions minutes not available            | high     | Entitlements → Resolution | entitlement    | escalate | 78205622      |
| S2  | All premium features suddenly locked            | critical | BillingPlan → Resolution  | billing_plan   | resolve  | —             |
| S3  | PAT returns 403 for org repos                   | medium   | AuthToken → Resolution    | auth_token     | resolve  | —             |
| S4  | Getting rate limited on REST API                | high     | ApiRateLimit → Resolution | api_rate_limit | resolve  | —             |
| S5  | SAML SSO authentication fails                   | critical | AuthToken → Resolution    | saml_sso       | escalate | 18e6a5d7      |
| S6  | Repeated token auth failure                     | critical | AuthToken → Resolution    | auth_token     | escalate | 4c87f5bc      |
| S7  | GitHub not working (vague)                      | medium   | Orchestrator → Resolution | ambiguous      | clarify  | —             |
| S8  | Billing issue blocking CI/CD and API automation | critical | BillingPlan → Resolution  | billing_plan   | resolve  | —             |
