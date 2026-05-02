import { randomUUID } from 'node:crypto';
import { query } from '../lib/database.js';
import { logger } from '../lib/logger.js';

/**
 * Seed script for GitHub Support System.
 * Creates test data for all 8 scenarios.
 *
 * Run with: npm run seed
 */

async function seed() {
  logger.info('Starting database seed...');

  try {
    // ========================================================================
    // Core Entities
    // ========================================================================

    // Customer 1: Acme Corp
    const acmeCustomerId = randomUUID();
    await query(
      `INSERT INTO customers (customer_id, customer_name, region, support_tier, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [acmeCustomerId, 'Acme Corp', 'us-east-1', 'premium', 'active'],
    );

    // Enterprise Account for Acme
    const acmeEnterpriseId = randomUUID();
    await query(
      `INSERT INTO enterprise_accounts (enterprise_id, enterprise_name, support_tier, saml_enabled, account_status)
       VALUES ($1, $2, $3, $4, $5)`,
      [acmeEnterpriseId, 'Acme Enterprise', 'enterprise', true, 'active'],
    );

    // GitHub Org 1: acme-engineering
    const acmeEngOrgId = randomUUID();
    await query(
      `INSERT INTO github_orgs (org_id, org_name, customer_id, enterprise_id, current_plan, billing_status, sso_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        acmeEngOrgId,
        'acme-engineering',
        acmeCustomerId,
        acmeEnterpriseId,
        'Team',
        'active',
        true,
      ],
    );

    // GitHub Org 2: acme-data (for billing scenario)
    const acmeDataOrgId = randomUUID();
    await query(
      `INSERT INTO github_orgs (org_id, org_name, customer_id, enterprise_id, current_plan, billing_status, sso_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        acmeDataOrgId,
        'acme-data',
        acmeCustomerId,
        acmeEnterpriseId,
        'Enterprise',
        'past_due',
        false,
      ],
    );

    // Customer 2: TechStart Inc
    const techStartCustomerId = randomUUID();
    await query(
      `INSERT INTO customers (customer_id, customer_name, region, support_tier, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [techStartCustomerId, 'TechStart Inc', 'eu-west-1', 'basic', 'active'],
    );

    // GitHub Org 3: techstart-dev (for API rate limit scenario)
    const techStartOrgId = randomUUID();
    await query(
      `INSERT INTO github_orgs (org_id, org_name, customer_id, enterprise_id, current_plan, billing_status, sso_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        techStartOrgId,
        'techstart-dev',
        techStartCustomerId,
        null,
        'Free',
        'active',
        false,
      ],
    );

    logger.info('Created customers and orgs');

    // ========================================================================
    // Scenario 1: Feature Entitlement Dispute
    // ========================================================================

    const s1SubscriptionId = randomUUID();
    await query(
      `INSERT INTO subscriptions (subscription_id, scope_type, scope_id, plan_name, billing_cycle, renewal_date, active_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s1SubscriptionId,
        'org',
        acmeEngOrgId,
        'Team',
        'monthly',
        '2026-05-15',
        true,
      ],
    );

    const s1EntitlementId = randomUUID();
    await query(
      `INSERT INTO entitlements (entitlement_id, scope_type, scope_id, feature_name, enabled, source)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        s1EntitlementId,
        'org',
        acmeEngOrgId,
        'github_actions_minutes',
        false,
        'plan_limit',
      ],
    );

    const s1CaseId = randomUUID();
    await query(
      `INSERT INTO support_cases (case_id, customer_id, org_id, title, description, severity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s1CaseId,
        acmeCustomerId,
        acmeEngOrgId,
        'GitHub Actions minutes not available',
        'Our team plan should include 3000 Actions minutes per month, but we are seeing "Feature not available" when trying to run workflows. This is blocking our CI/CD pipeline.',
        'high',
        'open',
      ],
    );

    logger.info('Created Scenario 1: Feature Entitlement Dispute');

    // ========================================================================
    // Scenario 2: Paid Features Locked Due to Billing
    // ========================================================================

    const s2SubscriptionId = randomUUID();
    await query(
      `INSERT INTO subscriptions (subscription_id, scope_type, scope_id, plan_name, billing_cycle, renewal_date, active_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s2SubscriptionId,
        'org',
        acmeDataOrgId,
        'Enterprise',
        'annual',
        '2026-06-01',
        false,
      ],
    );

    const s2InvoiceId = randomUUID();
    await query(
      `INSERT INTO invoices (invoice_id, customer_id, billing_period, amount, currency, payment_status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s2InvoiceId,
        acmeCustomerId,
        '2026-03',
        21000.0,
        'USD',
        'overdue',
        '2026-04-01',
      ],
    );

    const s2CaseId = randomUUID();
    await query(
      `INSERT INTO support_cases (case_id, customer_id, org_id, title, description, severity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s2CaseId,
        acmeCustomerId,
        acmeDataOrgId,
        'All premium features suddenly locked',
        'All our paid Enterprise features (Advanced Security, Codespaces, Packages) are now showing as unavailable. We were using them yesterday without issues. This is affecting our entire team.',
        'critical',
        'open',
      ],
    );

    logger.info('Created Scenario 2: Paid Features Locked Due to Billing');

    // ========================================================================
    // Scenario 3: PAT Failing for Org Resources
    // ========================================================================

    const s3TokenId = randomUUID();
    await query(
      `INSERT INTO token_records (token_id, token_type, owner, org_id, permissions, sso_authorized, expiration_date, revoked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        s3TokenId,
        'pat',
        'alice@acme.com',
        acmeEngOrgId,
        JSON.stringify(['repo', 'read:org']),
        false,
        null,
        false,
      ],
    );

    const s3CaseId = randomUUID();
    await query(
      `INSERT INTO support_cases (case_id, customer_id, org_id, title, description, severity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s3CaseId,
        acmeCustomerId,
        acmeEngOrgId,
        'Personal Access Token returns 403 for org repos',
        'My PAT works fine for my personal repos, but returns "403 Forbidden" when I try to access our organization repositories. The token has "repo" and "read:org" scopes.',
        'medium',
        'open',
      ],
    );

    logger.info('Created Scenario 3: PAT Failing for Org Resources');

    // ========================================================================
    // Scenario 4: REST API Rate Limit Complaint
    // ========================================================================

    const s4ApiUsageId = randomUUID();
    await query(
      `INSERT INTO api_usage (usage_id, org_id_or_user_id, api_type, time_window, request_count, throttled_requests)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [s4ApiUsageId, techStartOrgId, 'rest', '1h', 4823, 0],
    );

    const s4IncidentId = randomUUID();
    await query(
      `INSERT INTO incidents (incident_id, title, severity, affected_services, start_time, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        s4IncidentId,
        'REST API Performance Degradation',
        'major',
        JSON.stringify(['REST API', 'GraphQL API']),
        new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        'monitoring',
      ],
    );

    const s4ServiceStatusId = randomUUID();
    await query(
      `INSERT INTO service_status (service_status_id, component, region, status, incident_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        s4ServiceStatusId,
        'REST API',
        'global',
        'degraded',
        s4IncidentId,
        new Date().toISOString(),
      ],
    );

    const s4CaseId = randomUUID();
    await query(
      `INSERT INTO support_cases (case_id, customer_id, org_id, title, description, severity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s4CaseId,
        techStartCustomerId,
        techStartOrgId,
        'Getting rate limited on REST API',
        'We are getting "You have exceeded a secondary rate limit" errors from the GitHub REST API even though we are well under the 5000 requests/hour limit. Our monitoring shows only ~500 requests in the last hour.',
        'high',
        'open',
      ],
    );

    logger.info('Created Scenario 4: REST API Rate Limit Complaint');

    // ========================================================================
    // Scenario 5: SAML SSO Login Failure
    // ========================================================================

    const s5SamlConfigId = randomUUID();
    await query(
      `INSERT INTO saml_configs (saml_config_id, org_id_or_enterprise_id, scope_type, enabled, idp_name, certificate_expiry, last_validated)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s5SamlConfigId,
        acmeEnterpriseId,
        'enterprise',
        true,
        'Okta',
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days from now
        new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      ],
    );

    const s5CaseId = randomUUID();
    await query(
      `INSERT INTO support_cases (case_id, customer_id, org_id, title, description, severity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s5CaseId,
        acmeCustomerId,
        acmeEngOrgId,
        'SAML SSO authentication fails with error',
        'Users are unable to log in via SAML SSO. They see "Authentication failed: Invalid SAML response" error. Our Okta logs show successful authentication on their end.',
        'critical',
        'open',
      ],
    );

    logger.info('Created Scenario 5: SAML SSO Login Failure');

    // ========================================================================
    // Scenario 6: Repeated Unresolved Auth Issues (Auto-Escalate)
    // ========================================================================

    const s6TokenId = randomUUID();
    await query(
      `INSERT INTO token_records (token_id, token_type, owner, org_id, permissions, sso_authorized, expiration_date, revoked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        s6TokenId,
        'pat',
        'bob@acme.com',
        acmeEngOrgId,
        JSON.stringify(['repo']),
        false,
        new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // expired 10 days ago
        false,
      ],
    );

    const s6Case1Id = randomUUID();
    const s6Case2Id = randomUUID();
    const s6Case3Id = randomUUID();
    const s6CaseId = randomUUID();

    // Create 3 previous unresolved auth cases
    await query(
      `INSERT INTO support_cases (case_id, customer_id, org_id, title, description, severity, status, issue_category, created_at)
       VALUES 
         ($1, $2, $3, $4, $5, $6, $7, $8, $9),
         ($10, $11, $12, $13, $14, $15, $16, $17, $18),
         ($19, $20, $21, $22, $23, $24, $25, $26, $27)`,
      [
        s6Case1Id,
        acmeCustomerId,
        acmeEngOrgId,
        'Token auth issue',
        'PAT not working',
        'medium',
        'open',
        'auth_token',
        new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        s6Case2Id,
        acmeCustomerId,
        acmeEngOrgId,
        'Authentication problem',
        'Cannot authenticate',
        'medium',
        'open',
        'auth_token',
        new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        s6Case3Id,
        acmeCustomerId,
        acmeEngOrgId,
        'Auth keeps failing',
        'Same auth error',
        'high',
        'open',
        'auth_token',
        new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      ],
    );

    // Current case
    await query(
      `INSERT INTO support_cases (case_id, customer_id, org_id, title, description, severity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s6CaseId,
        acmeCustomerId,
        acmeEngOrgId,
        'Yet another token authentication failure',
        'This is the fourth time in two weeks we are experiencing token authentication failures. Previous cases remain unresolved. We need urgent help.',
        'critical',
        'open',
      ],
    );

    // Add case history events
    for (const caseId of [s6Case1Id, s6Case2Id, s6Case3Id]) {
      const eventId = randomUUID();
      await query(
        `INSERT INTO case_history (event_id, case_id, event_type, actor, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          eventId,
          caseId,
          'created',
          'system',
          'Case created via support portal',
        ],
      );
    }

    logger.info('Created Scenario 6: Repeated Unresolved Auth Issues');

    // ========================================================================
    // Scenario 7: Ambiguous Complaint (Needs Clarification)
    // ========================================================================

    const s7CaseId = randomUUID();
    await query(
      `INSERT INTO support_cases (case_id, customer_id, org_id, title, description, severity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s7CaseId,
        techStartCustomerId,
        techStartOrgId,
        'GitHub not working',
        'GitHub is not working for us. Please fix.',
        'medium',
        'open',
      ],
    );

    logger.info('Created Scenario 7: Ambiguous Complaint');

    // ========================================================================
    // Scenario 8: Billing + Technical Issue (Multi-Agent)
    // acme-data org already has active_status=false subscription and an
    // overdue invoice from S2 seeding — reuse that billing state to show
    // how a payment failure causes API automation failures downstream.
    // ========================================================================

    const s8CaseId = randomUUID();
    await query(
      `INSERT INTO support_cases (case_id, customer_id, org_id, title, description, severity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        s8CaseId,
        acmeCustomerId,
        acmeDataOrgId,
        'Billing issue blocking CI/CD and API automation',
        'We have an outstanding invoice from March that we are actively working to resolve with our finance team. In the meantime all our GitHub Actions workflows and REST API-based automation have stopped working with 403 Forbidden errors. Our CI/CD pipelines are fully blocked and production deployments are failing. We need to understand whether the billing issue is directly causing the API access failures and what we need to do immediately to restore automation access.',
        'critical',
        'open',
      ],
    );

    logger.info('Created Scenario 8: Billing + Technical Issue');

    // ========================================================================
    // Summary
    // ========================================================================

    logger.info('Database seed completed successfully!');
    logger.info('Created:');
    logger.info('  - 3 customers');
    logger.info('  - 1 enterprise account');
    logger.info('  - 3 GitHub orgs');
    logger.info('  - 8 support case scenarios');
    logger.info(
      '  - All supporting entities (subscriptions, invoices, tokens, etc.)',
    );
  } catch (err) {
    logger.error({ err }, 'Seed script failed');
    throw err;
  } finally {
    process.exit(0);
  }
}

// Run seed
seed().catch((err) => {
  logger.error({ err }, 'Unhandled error in seed script');
  process.exit(1);
});
