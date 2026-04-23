/**
 * Frontend mirror of packages/backend/src/types/index.ts.
 * Keep in sync with backend types — never add extra fields here.
 */

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

export type AgentType =
  | 'BillingPlanAgent'
  | 'EntitlementsAgent'
  | 'AuthTokenAgent'
  | 'ApiRateLimitAgent'
  | 'ResolutionAgent';

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

export interface SupportCase {
  case_id: string;
  customer_id: string;
  org_id: string;
  title: string;
  description: string;
  severity: CaseSeverity;
  status: CaseStatus;
  issue_category?: IssueCategory;
}

export interface RagChunk {
  chunk_id: string;
  source_url: string;
  section_heading: string;
  chunk_text: string;
  score: number;
}

export interface ToolResult {
  tool_name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
}

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

export interface AgentEvent {
  event: AgentEventType;
  agentName?: AgentType | 'OrchestratorAgent';
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface CreateCaseRequest {
  customer_id: string;
  org_id: string;
  title: string;
  description: string;
  severity: CaseSeverity;
}
