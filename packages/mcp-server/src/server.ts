/**
 * MCP Server — GitHub Support Resolution System
 * Phase 3: 8 tools exposing PostgreSQL data for the agent pipeline.
 * Transport: StdioServerTransport (spawned as child process by backend).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { pool } from './db.js';
import { McpToolError } from './errors.js';
import { logger } from './logger.js';

// ============================================================================
// Row types — mirrors schema.sql columns; defined here since mcp-server
// cannot import from packages/backend/src/types/index.ts
// ============================================================================

interface OrgRow {
  org_id: string;
  org_name: string;
  customer_id: string;
  enterprise_id: string | null;
  current_plan: string;
  billing_status: string;
  sso_enabled: boolean;
}

interface CustomerRow {
  customer_id: string;
  customer_name: string;
  region: string;
  support_tier: string;
  status: string;
}

interface EnterpriseRow {
  enterprise_id: string;
  enterprise_name: string;
  support_tier: string;
  saml_enabled: boolean;
  account_status: string;
}

interface SubscriptionRow {
  subscription_id: string;
  scope_type: string;
  scope_id: string;
  plan_name: string;
  billing_cycle: string;
  renewal_date: string;
  active_status: boolean;
  pending_change: string | null;
}

interface EntitlementRow {
  entitlement_id: string;
  scope_type: string;
  scope_id: string;
  feature_name: string;
  enabled: boolean;
  source: string;
}

interface TokenRow {
  token_id: string;
  token_type: string;
  owner: string;
  org_id: string;
  permissions: string[];
  sso_authorized: boolean;
  expiration_date: string | null;
  revoked: boolean;
}

interface SamlRow {
  saml_config_id: string;
  org_id_or_enterprise_id: string;
  scope_type: string;
  enabled: boolean;
  idp_name: string;
  certificate_expiry: string;
  last_validated: string;
}

interface ApiUsageRow {
  usage_id: string;
  org_id_or_user_id: string;
  api_type: string;
  time_window: string;
  request_count: number;
  throttled_requests: number;
}

// CaseHistoryRow is enriched with support_cases fields (issue_category, status)
// so AuthTokenAgent can detect ≥3 unresolved same-category cases (Scenario 6).
interface CaseHistoryRow {
  case_id: string;
  issue_category: string | null;
  status: string;
  title: string;
  case_created_at: string;
  event_id: string | null;
  event_type: string | null;
  actor: string | null;
  event_timestamp: string | null;
  notes: string | null;
  total_count: number;
}

interface InvoiceRow {
  invoice_id: string;
  billing_period: string;
  amount: string; // DECIMAL → string in node-postgres
  currency: string;
  payment_status: string;
  due_date: string;
}

// ============================================================================
// Server bootstrap
// ============================================================================

const server = new McpServer({ name: 'github-support-mcp', version: '1.0.0' });

// ============================================================================
// Tool: get_org_context
// ============================================================================

server.tool(
  'get_org_context',
  'Query PostgreSQL for GitHub org, customer, and optional enterprise account context. ' +
    'Returns org plan, billing_status, sso_enabled, customer support_tier, and enterprise SAML settings. ' +
    'Use when: loading account context before case analysis, checking org plan or billing status, ' +
    'determining whether SSO is enabled, identifying enterprise membership.',
  {
    org_id: z.string().uuid().describe('GitHub org UUID'),
  },
  async ({ org_id }) => {
    const log = logger.child({ tool: 'get_org_context' });
    try {
      const orgResult = await pool.query<OrgRow>(
        `SELECT org_id, org_name, customer_id, enterprise_id, current_plan, billing_status, sso_enabled
         FROM github_orgs
         WHERE org_id = $1`,
        [org_id],
      );
      const org = orgResult.rows[0] ?? null;
      if (!org) {
        log.warn({ org_id }, 'Org not found');
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(null) }],
        };
      }

      const customerResult = await pool.query<CustomerRow>(
        `SELECT customer_id, customer_name, region, support_tier, status
         FROM customers
         WHERE customer_id = $1`,
        [org.customer_id],
      );
      const customer = customerResult.rows[0] ?? null;

      let enterprise: EnterpriseRow | null = null;
      if (org.enterprise_id !== null) {
        const enterpriseResult = await pool.query<EnterpriseRow>(
          `SELECT enterprise_id, enterprise_name, support_tier, saml_enabled, account_status
           FROM enterprise_accounts
           WHERE enterprise_id = $1`,
          [org.enterprise_id],
        );
        enterprise = enterpriseResult.rows[0] ?? null;
      }

      const result =
        enterprise !== null ? { org, customer, enterprise } : { org, customer };
      log.info({ org_id }, 'get_org_context succeeded');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      throw new McpToolError(
        'Failed to get org context',
        'get_org_context',
        err,
      );
    }
  },
);

// ============================================================================
// Tool: check_subscription
// ============================================================================

server.tool(
  'check_subscription',
  'Query PostgreSQL for the active subscription for an org or enterprise account. ' +
    'Returns plan_name, billing_cycle, renewal_date, active_status, and any pending plan change. ' +
    'Use when: diagnosing feature access loss, checking if a subscription is active or lapsed, ' +
    'determining whether a billing issue is causing access problems.',
  {
    scope_type: z
      .enum(['org', 'enterprise'])
      .describe("Scope of the subscription: 'org' or 'enterprise'"),
    scope_id: z.string().uuid().describe('UUID of the org or enterprise'),
  },
  async ({ scope_type, scope_id }) => {
    const log = logger.child({ tool: 'check_subscription' });
    try {
      const result = await pool.query<SubscriptionRow>(
        `SELECT subscription_id, scope_type, scope_id, plan_name, billing_cycle,
                renewal_date, active_status, pending_change
         FROM subscriptions
         WHERE scope_type = $1 AND scope_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [scope_type, scope_id],
      );
      const subscription = result.rows[0] ?? null;
      log.info({ scope_type, scope_id }, 'check_subscription succeeded');
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(subscription) },
        ],
      };
    } catch (err) {
      throw new McpToolError(
        'Failed to check subscription',
        'check_subscription',
        err,
      );
    }
  },
);

// ============================================================================
// Tool: check_entitlement
// ============================================================================

server.tool(
  'check_entitlement',
  'Query PostgreSQL for a specific feature entitlement for an org or enterprise. ' +
    'Returns enabled flag, source (plan_limit | admin_disabled | provisioned | not_found), and entitlement_id. ' +
    'Use when: a user reports a feature is inaccessible, diagnosing why a feature is disabled, ' +
    'determining whether an upgrade or admin action is needed.',
  {
    scope_type: z
      .enum(['org', 'enterprise'])
      .describe("Scope of the entitlement: 'org' or 'enterprise'"),
    scope_id: z.string().uuid().describe('UUID of the org or enterprise'),
    feature_name: z
      .string()
      .min(1)
      .describe('Name of the feature to check, e.g. github_actions_minutes'),
  },
  async ({ scope_type, scope_id, feature_name }) => {
    const log = logger.child({ tool: 'check_entitlement' });
    try {
      const result = await pool.query<EntitlementRow>(
        `SELECT entitlement_id, scope_type, scope_id, feature_name, enabled, source
         FROM entitlements
         WHERE scope_type = $1 AND scope_id = $2 AND feature_name = $3`,
        [scope_type, scope_id, feature_name],
      );
      const row = result.rows[0];
      // If no row exists, the feature is not provisioned for this scope.
      const entitlement =
        row !== undefined
          ? {
              enabled: row.enabled,
              source: row.source,
              entitlement_id: row.entitlement_id,
            }
          : { enabled: false, source: 'not_found', entitlement_id: null };
      log.info(
        { scope_type, scope_id, feature_name },
        'check_entitlement succeeded',
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(entitlement) }],
      };
    } catch (err) {
      throw new McpToolError(
        'Failed to check entitlement',
        'check_entitlement',
        err,
      );
    }
  },
);

// ============================================================================
// Tool: get_token_record
// ============================================================================

server.tool(
  'get_token_record',
  'Query PostgreSQL for a specific OAuth or PAT token record. ' +
    'Returns token_type, owner, org_id, permissions, sso_authorized, expiration_date, and revoked status. ' +
    'Use when: diagnosing a failing personal access token (PAT), investigating 401/403 auth errors, ' +
    'checking whether a token is expired, revoked, or missing SSO authorization.',
  {
    token_id: z.string().uuid().describe('UUID of the token record'),
  },
  async ({ token_id }) => {
    const log = logger.child({ tool: 'get_token_record' });
    try {
      const result = await pool.query<TokenRow>(
        `SELECT token_id, token_type, owner, org_id, permissions, sso_authorized, expiration_date, revoked
         FROM token_records
         WHERE token_id = $1`,
        [token_id],
      );
      const token = result.rows[0] ?? null;
      log.info({ token_id }, 'get_token_record succeeded');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(token) }],
      };
    } catch (err) {
      throw new McpToolError(
        'Failed to get token record',
        'get_token_record',
        err,
      );
    }
  },
);

// ============================================================================
// Tool: get_saml_config
// ============================================================================

server.tool(
  'get_saml_config',
  'Query PostgreSQL for the SAML/SSO configuration for an org or enterprise. ' +
    'Returns enabled flag, idp_name, certificate_expiry, and last_validated timestamp. ' +
    'Use when: diagnosing SAML SSO login failures, checking if a certificate is expired, ' +
    'investigating why a user cannot authenticate via SSO.',
  {
    scope_id: z.string().uuid().describe('UUID of the org or enterprise'),
    scope_type: z
      .enum(['org', 'enterprise'])
      .describe("Scope of the SAML config: 'org' or 'enterprise'"),
  },
  async ({ scope_id, scope_type }) => {
    const log = logger.child({ tool: 'get_saml_config' });
    try {
      const result = await pool.query<SamlRow>(
        `SELECT saml_config_id, org_id_or_enterprise_id, scope_type, enabled, idp_name,
                certificate_expiry, last_validated
         FROM saml_configs
         WHERE org_id_or_enterprise_id = $1 AND scope_type = $2`,
        [scope_id, scope_type],
      );
      const config = result.rows[0] ?? null;
      log.info({ scope_id, scope_type }, 'get_saml_config succeeded');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(config) }],
      };
    } catch (err) {
      throw new McpToolError(
        'Failed to get SAML config',
        'get_saml_config',
        err,
      );
    }
  },
);

// ============================================================================
// Tool: check_api_usage
// ============================================================================

server.tool(
  'check_api_usage',
  'Query PostgreSQL for API usage counters for an org or user within a time window. ' +
    'Returns request_count, throttled_requests, and api_type for all API types in the window. ' +
    'Use when: investigating REST or GraphQL rate limit complaints, determining whether requests are ' +
    'being throttled, diagnosing slow or blocked API calls.',
  {
    scope_id: z.string().uuid().describe('UUID of the org or user'),
    time_window: z
      .enum(['1h', '6h', '24h', '7d'])
      .describe("Time window to query: '1h', '6h', '24h', or '7d'"),
  },
  async ({ scope_id, time_window }) => {
    const log = logger.child({ tool: 'check_api_usage' });
    try {
      const result = await pool.query<ApiUsageRow>(
        `SELECT usage_id, org_id_or_user_id, api_type, time_window, request_count, throttled_requests
         FROM api_usage
         WHERE org_id_or_user_id = $1 AND time_window = $2`,
        [scope_id, time_window],
      );
      log.info({ scope_id, time_window }, 'check_api_usage succeeded');
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ usages: result.rows }),
          },
        ],
      };
    } catch (err) {
      throw new McpToolError(
        'Failed to check API usage',
        'check_api_usage',
        err,
      );
    }
  },
);

// ============================================================================
// Tool: get_case_history
// ============================================================================

server.tool(
  'get_case_history',
  'Query PostgreSQL for past support cases and their history events for a customer. ' +
    'Returns events enriched with case issue_category and status, plus total_count of cases. ' +
    'Use when: detecting repeated unresolved issues (escalation trigger), reviewing prior auth failures, ' +
    "understanding a customer's support history before triaging a new case.",
  {
    customer_id: z.string().uuid().describe('Customer UUID'),
    limit: z
      .number()
      .int()
      .positive()
      .max(50)
      .optional()
      .default(10)
      .describe('Max number of recent cases to return (default 10, max 50)'),
  },
  async ({ customer_id, limit }) => {
    const log = logger.child({ tool: 'get_case_history' });
    try {
      // Fetch the latest N cases with their history events.
      // LEFT JOIN ensures cases with no history events are still returned.
      // total_count is computed via CTE to avoid a second round-trip.
      const result = await pool.query<CaseHistoryRow>(
        `WITH limited_cases AS (
           SELECT case_id, issue_category, status, title, created_at
           FROM support_cases
           WHERE customer_id = $1
           ORDER BY created_at DESC
           LIMIT $2
         ),
         case_count AS (
           SELECT COUNT(*)::int AS total FROM support_cases WHERE customer_id = $1
         )
         SELECT
           lc.case_id,
           lc.issue_category,
           lc.status,
           lc.title,
           lc.created_at   AS case_created_at,
           ch.event_id,
           ch.event_type,
           ch.actor,
           ch.timestamp    AS event_timestamp,
           ch.notes,
           cc.total        AS total_count
         FROM limited_cases lc
         CROSS JOIN case_count cc
         LEFT JOIN case_history ch ON ch.case_id = lc.case_id
         ORDER BY lc.created_at DESC, ch.timestamp ASC`,
        [customer_id, limit],
      );

      const totalCount = result.rows[0]?.total_count ?? 0;
      const events = result.rows.map((r) => ({
        case_id: r.case_id,
        issue_category: r.issue_category,
        status: r.status,
        title: r.title,
        case_created_at: r.case_created_at,
        event_id: r.event_id,
        event_type: r.event_type,
        actor: r.actor,
        event_timestamp: r.event_timestamp,
        notes: r.notes,
      }));

      log.info({ customer_id, limit }, 'get_case_history succeeded');
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ events, total_count: totalCount }),
          },
        ],
      };
    } catch (err) {
      throw new McpToolError(
        'Failed to get case history',
        'get_case_history',
        err,
      );
    }
  },
);

// ============================================================================
// Tool: check_invoice_status
// ============================================================================

server.tool(
  'check_invoice_status',
  'Query PostgreSQL for the most recent invoice for a customer. ' +
    'Returns invoice_id, billing_period, amount, currency, payment_status, and due_date. ' +
    'Use when: diagnosing billing-related access loss, checking whether an overdue invoice is ' +
    'blocking paid features, investigating payment failures or pending charges.',
  {
    customer_id: z.string().uuid().describe('Customer UUID'),
  },
  async ({ customer_id }) => {
    const log = logger.child({ tool: 'check_invoice_status' });
    try {
      const result = await pool.query<InvoiceRow>(
        `SELECT invoice_id, billing_period, amount, currency, payment_status, due_date
         FROM invoices
         WHERE customer_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [customer_id],
      );
      const invoice = result.rows[0] ?? null;
      log.info({ customer_id }, 'check_invoice_status succeeded');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(invoice) }],
      };
    } catch (err) {
      throw new McpToolError(
        'Failed to check invoice status',
        'check_invoice_status',
        err,
      );
    }
  },
);

// ============================================================================
// Connect
// ============================================================================

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info('github-support-mcp server started');
