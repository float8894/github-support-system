-- GitHub Support System Database Schema
-- Phase 1: Foundation & Data Model
-- PostgreSQL 17 with pgvector extension

-- Enable pgvector extension for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Customer & Organization Hierarchy
-- ============================================================================

CREATE TABLE customers (
  customer_id UUID PRIMARY KEY,
  customer_name TEXT NOT NULL,
  region TEXT NOT NULL,
  support_tier TEXT NOT NULL CHECK (support_tier IN ('basic', 'premium', 'enterprise')),
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE enterprise_accounts (
  enterprise_id UUID PRIMARY KEY,
  enterprise_name TEXT NOT NULL,
  support_tier TEXT NOT NULL CHECK (support_tier IN ('premium', 'enterprise')),
  saml_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  account_status TEXT NOT NULL CHECK (account_status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE github_orgs (
  org_id UUID PRIMARY KEY,
  org_name TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  enterprise_id UUID REFERENCES enterprise_accounts(enterprise_id),
  current_plan TEXT NOT NULL,
  billing_status TEXT NOT NULL CHECK (billing_status IN ('active', 'past_due', 'suspended')),
  sso_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_github_orgs_customer_id ON github_orgs(customer_id);
CREATE INDEX idx_github_orgs_enterprise_id ON github_orgs(enterprise_id);

-- ============================================================================
-- Billing & Subscriptions
-- ============================================================================

CREATE TABLE subscriptions (
  subscription_id UUID PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('org', 'enterprise')),
  scope_id UUID NOT NULL,
  plan_name TEXT NOT NULL,
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  renewal_date TIMESTAMPTZ NOT NULL,
  active_status BOOLEAN NOT NULL DEFAULT TRUE,
  pending_change TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_scope ON subscriptions(scope_type, scope_id);

CREATE TABLE invoices (
  invoice_id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  billing_period TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid', 'pending', 'overdue', 'failed')),
  due_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);

-- ============================================================================
-- Entitlements & Features
-- ============================================================================

CREATE TABLE entitlements (
  entitlement_id UUID PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('org', 'enterprise')),
  scope_id UUID NOT NULL,
  feature_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL CHECK (source IN ('plan_limit', 'admin_disabled', 'provisioned', 'not_found')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(scope_type, scope_id, feature_name)
);

CREATE INDEX idx_entitlements_scope ON entitlements(scope_type, scope_id);

-- ============================================================================
-- Authentication & Tokens
-- ============================================================================

CREATE TABLE token_records (
  token_id UUID PRIMARY KEY,
  token_type TEXT NOT NULL CHECK (token_type IN ('pat', 'oauth', 'app')),
  owner TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES github_orgs(org_id),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  sso_authorized BOOLEAN NOT NULL DEFAULT FALSE,
  expiration_date TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_token_records_org_id ON token_records(org_id);

CREATE TABLE saml_configs (
  saml_config_id UUID PRIMARY KEY,
  org_id_or_enterprise_id UUID NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('org', 'enterprise')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  idp_name TEXT NOT NULL,
  certificate_expiry TIMESTAMPTZ NOT NULL,
  last_validated TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saml_configs_scope ON saml_configs(scope_type, org_id_or_enterprise_id);

-- ============================================================================
-- API Usage & Rate Limits
-- ============================================================================

CREATE TABLE api_usage (
  usage_id UUID PRIMARY KEY,
  org_id_or_user_id UUID NOT NULL,
  api_type TEXT NOT NULL CHECK (api_type IN ('rest', 'graphql', 'actions')),
  time_window TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  throttled_requests INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_usage_scope ON api_usage(org_id_or_user_id, api_type);

-- ============================================================================
-- Support Cases & History
-- ============================================================================

CREATE TABLE support_cases (
  case_id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  org_id UUID NOT NULL REFERENCES github_orgs(org_id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'escalated', 'pending_clarification')),
  issue_category TEXT CHECK (issue_category IN ('billing_plan', 'entitlement', 'auth_token', 'saml_sso', 'api_rate_limit', 'ambiguous')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_support_cases_org_id ON support_cases(org_id);
CREATE INDEX idx_support_cases_customer_id ON support_cases(customer_id);
CREATE INDEX idx_support_cases_status ON support_cases(status);

CREATE TABLE case_history (
  event_id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES support_cases(case_id),
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX idx_case_history_case_id ON case_history(case_id);

-- ============================================================================
-- Service Status & Incidents
-- ============================================================================

CREATE TABLE incidents (
  incident_id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  affected_services JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_status (
  service_status_id UUID PRIMARY KEY,
  component TEXT NOT NULL,
  region TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('operational', 'degraded', 'partial_outage', 'major_outage')),
  incident_id UUID REFERENCES incidents(incident_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_status_component ON service_status(component);

-- ============================================================================
-- Escalations
-- ============================================================================

CREATE TABLE escalations (
  escalation_id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES support_cases(case_id),
  reason TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  evidence_summary TEXT NOT NULL,
  assigned_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escalations_case_id ON escalations(case_id);

-- ============================================================================
-- RAG Document Chunks (pgvector)
-- ============================================================================

CREATE TABLE document_chunks (
  chunk_id UUID PRIMARY KEY,
  source_url TEXT NOT NULL,
  section_heading TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IVFFlat index for fast similarity search
-- Lists=100 is optimal for datasets with 10k-1M vectors
CREATE INDEX idx_document_chunks_embedding ON document_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_document_chunks_source_url ON document_chunks(source_url);
