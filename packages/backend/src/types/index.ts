/**
 * Shared type definitions for the GitHub support system.
 * All types used across agents, tools, and API routes are defined here.
 * NEVER re-declare these types inline in other files.
 */

// ============================================================================
// Issue Classification
// ============================================================================

export type IssueCategory =
  | 'billing_plan'
  | 'entitlement'
  | 'auth_token'
  | 'saml_sso'
  | 'api_rate_limit'
  | 'ambiguous';

export type CaseVerdict = 'resolve' | 'clarify' | 'escalate';

export type CaseSeverity = 'low' | 'medium' | 'high' | 'critical';

export type CaseStatus =
  | 'open'
  | 'resolved'
  | 'escalated'
  | 'pending_clarification';

// ============================================================================
// Agent Types
// ============================================================================

export type AgentType =
  | 'BillingPlanAgent'
  | 'EntitlementsAgent'
  | 'AuthTokenAgent'
  | 'ApiRateLimitAgent'
  | 'ResolutionAgent';

// ============================================================================
// Database Entities
// ============================================================================

export interface Customer {
  customer_id: string;
  customer_name: string;
  region: string;
  support_tier: string;
  status: string;
}

export interface GithubOrg {
  org_id: string;
  org_name: string;
  customer_id: string;
  enterprise_id: string | null;
  current_plan: string;
  billing_status: string;
  sso_enabled: boolean;
}

export interface EnterpriseAccount {
  enterprise_id: string;
  enterprise_name: string;
  support_tier: string;
  saml_enabled: boolean;
  account_status: string;
}

export interface Subscription {
  subscription_id: string;
  scope_type: 'org' | 'enterprise';
  scope_id: string;
  plan_name: string;
  billing_cycle: string;
  renewal_date: string;
  active_status: boolean;
  pending_change: string | null;
}

export interface Invoice {
  invoice_id: string;
  customer_id: string;
  billing_period: string;
  amount: number;
  currency: string;
  payment_status: string;
  due_date: string;
}

export interface Entitlement {
  entitlement_id: string;
  scope_type: 'org' | 'enterprise';
  scope_id: string;
  feature_name: string;
  enabled: boolean;
  source: 'plan_limit' | 'admin_disabled' | 'provisioned' | 'not_found';
}

export interface TokenRecord {
  token_id: string;
  token_type: string;
  owner: string;
  org_id: string;
  permissions: string[];
  sso_authorized: boolean;
  expiration_date: string | null;
  revoked: boolean;
}

export interface SamlConfig {
  saml_config_id: string;
  org_id_or_enterprise_id: string;
  scope_type: 'org' | 'enterprise';
  enabled: boolean;
  idp_name: string;
  certificate_expiry: string;
  last_validated: string;
}

export interface ApiUsage {
  usage_id: string;
  org_id_or_user_id: string;
  api_type: string;
  time_window: string;
  request_count: number;
  throttled_requests: number;
}

export interface SupportCase {
  case_id: string;
  customer_id: string;
  org_id: string;
  title: string;
  description: string;
  severity: CaseSeverity;
  status: CaseStatus;
  issue_category: IssueCategory | null;
}

export interface CaseHistoryEvent {
  event_id: string;
  case_id: string;
  event_type: string;
  actor: string;
  timestamp: string;
  notes: string;
}

export interface ServiceStatus {
  service_status_id: string;
  component: string;
  region: string;
  status: string;
  incident_id: string | null;
  updated_at: string;
}

export interface Incident {
  incident_id: string;
  title: string;
  severity: string;
  affected_services: string[];
  start_time: string;
  end_time: string | null;
  status: string;
}

export interface Escalation {
  escalation_id: string;
  case_id: string;
  reason: string;
  severity: string;
  evidence_summary: string;
  assigned_to: string | null;
  created_at: string;
}

// ============================================================================
// RAG (Retrieval-Augmented Generation)
// ============================================================================

export interface DocumentChunk {
  chunk_id: string;
  source_url: string;
  section_heading: string;
  chunk_text: string;
  embedding: number[];
  created_at: string;
}

export interface RagChunk {
  chunk_id: string;
  source_url: string;
  section_heading: string;
  chunk_text: string;
  score: number;
}

// ============================================================================
// MCP Tool Results
// ============================================================================

export interface ToolResult {
  tool_name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Agent Pipeline Context
// ============================================================================

export interface OrgContext {
  org: GithubOrg;
  enterprise?: EnterpriseAccount;
  customer: Customer;
}

export interface AgentFinding {
  agentName: AgentType;
  summary: string;
  rootCauses: string[];
  recommendedVerdict: CaseVerdict;
  evidence: {
    docCitations: RagChunk[];
    toolResults: ToolResult[];
  };
}

export interface CaseContext {
  caseInput: SupportCase;
  orgContext: OrgContext;
  caseHistory: CaseHistoryEvent[];
  ragChunks: RagChunk[];
  issueCategory: IssueCategory;
  routeTo: AgentType[];
  toolResults: ToolResult[];
  agentFindings: AgentFinding[];
}

// ============================================================================
// Case Outcome
// ============================================================================

export interface CaseOutcome {
  case_id: string;
  issue_type: IssueCategory;
  evidence: {
    doc_citations: RagChunk[];
    tool_results: ToolResult[];
    key_findings: string[];
  };
  verdict: CaseVerdict;
  customer_response: string;
  internal_note: string;
  escalation_id?: string;
}

// ============================================================================
// Agent Events (SSE Streaming)
// ============================================================================

export type AgentEventType =
  | 'triage'
  | 'routing'
  | 'agent_start'
  | 'agent_done'
  | 'rag_retrieved'
  | 'tool_called'
  | 'verdict'
  | 'complete'
  | 'error';

export interface AgentEvent {
  event: AgentEventType;
  agentName?: AgentType | 'OrchestratorAgent';
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}
