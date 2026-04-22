import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { AgentError } from '../errors/index.js';
import { logger } from '../lib/logger.js';
import { createEscalation } from '../tools/escalation.tool.js';
import type {
  CaseContext,
  CaseOutcome,
  CaseVerdict,
  Entitlement,
  SamlConfig,
} from '../types/index.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const log = logger.child({ agent: 'ResolutionAgent' });

const SYSTEM_PROMPT = `You are the ResolutionAgent for GitHub Enterprise support.
Synthesise findings from all specialist agents into a final resolution.

Your output must be a JSON object (no markdown fences) with exactly these fields:
{
  "verdict": "resolve" | "clarify" | "escalate",
  "key_findings": ["<finding1>", "<finding2>"],
  "customer_response": "<markdown — actionable, professional, empathetic>",
  "internal_note": "<markdown — technical detail, cites evidence, for support engineers>"
}

Guidelines:
- customer_response: written to the customer, includes numbered action steps, relevant docs links if known
- internal_note: written for the support team, includes root causes, tool evidence, escalation rationale if applicable
- If any agent recommended escalate, honour that unless a majority recommend resolve and the escalation trigger is minor
- If issueCategory is 'ambiguous', verdict must be 'clarify'`;

/**
 * Checks unconditional auto-escalation/clarify rules that override agent findings.
 * Returns the forced verdict or null if no override applies.
 */
function checkAutoEscalation(context: CaseContext): CaseVerdict | null {
  // 1. Ambiguous category → clarify
  if (context.issueCategory === 'ambiguous') {
    log.info('Auto-override: ambiguous category → clarify');
    return 'clarify';
  }

  // 2. Repeated unresolved history (≥3 same category, none resolved)
  const openEvents = context.caseHistory.filter(
    (e) => e.event_type === 'case_opened' || e.event_type === 'escalated',
  );
  if (openEvents.length >= 3) {
    log.info(
      { eventCount: openEvents.length },
      'Auto-override: repeat unresolved history ≥3 → escalate',
    );
    return 'escalate';
  }

  // 3. SAML certificate expiry: check tool results for get_saml_config output
  for (const tr of context.toolResults) {
    if (
      tr.tool_name === 'get_saml_config' &&
      tr.output &&
      typeof tr.output === 'object'
    ) {
      const saml = tr.output as Partial<SamlConfig>;
      if (saml.certificate_expiry) {
        const expiry = new Date(saml.certificate_expiry);
        if (expiry < new Date()) {
          log.info(
            { certificate_expiry: saml.certificate_expiry },
            'Auto-override: SAML cert expired → escalate',
          );
          return 'escalate';
        }
      }
    }
  }

  // 4. Entitlement source = 'not_found' → escalate
  for (const tr of context.toolResults) {
    if (
      tr.tool_name === 'check_entitlement' &&
      tr.output &&
      typeof tr.output === 'object'
    ) {
      const ent = tr.output as Partial<Entitlement>;
      if (ent.source === 'not_found') {
        log.info('Auto-override: entitlement source=not_found → escalate');
        return 'escalate';
      }
    }
  }

  return null;
}

export class ResolutionAgent {
  private log = log;

  async run(context: CaseContext): Promise<CaseOutcome> {
    this.log.info(
      { case_id: context.caseInput.case_id },
      'ResolutionAgent started',
    );

    try {
      // 1. Check unconditional overrides
      const forcedVerdict = checkAutoEscalation(context);

      // 2. Build evidence aggregation
      const allDocCitations = [
        ...context.ragChunks,
        ...context.agentFindings.flatMap((f) => f.evidence.docCitations),
      ];
      // Deduplicate by chunk_id
      const seenIds = new Set<string>();
      const dedupedCitations = allDocCitations.filter((c) => {
        if (seenIds.has(c.chunk_id)) return false;
        seenIds.add(c.chunk_id);
        return true;
      });

      const allToolResults = context.toolResults;
      const allKeyFindings = context.agentFindings.map(
        (f) => `[${f.agentName}] ${f.summary}`,
      );

      // 3. Call Claude to synthesize (even with forced verdict, we still want the response text)
      const ragContext = dedupedCitations
        .slice(0, 8)
        .map((c) => `[${c.chunk_id}] ${c.section_heading}\n${c.chunk_text}`)
        .join('\n\n');

      const systemWithOverride = forcedVerdict
        ? `${SYSTEM_PROMPT}\n\nIMPORTANT: The verdict has been pre-determined as "${forcedVerdict}" due to an auto-escalation/clarify rule. You must use this exact verdict in your output.`
        : SYSTEM_PROMPT;

      const userContent = `## Support Case
${JSON.stringify(context.caseInput, null, 2)}

## Issue Category
${context.issueCategory}

## Agent Findings
${context.agentFindings.map((f) => `### ${f.agentName}\nVerdict: ${f.recommendedVerdict}\nSummary: ${f.summary}\nRoot Causes: ${f.rootCauses.join(', ')}`).join('\n\n')}

## Tool Results Summary
${allToolResults.map((t) => `- ${t.tool_name}: ${JSON.stringify(t.output)}`).join('\n')}

## Relevant Documentation
${ragContext}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemWithOverride,
        messages: [{ role: 'user', content: userContent }],
      });

      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');

      let parsed: {
        verdict: string;
        key_findings: string[];
        customer_response: string;
        internal_note: string;
      };
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        throw new AgentError(
          `ResolutionAgent failed to parse LLM response: ${text}`,
          'ResolutionAgent',
        );
      }

      const verdict: CaseVerdict =
        forcedVerdict ?? (parsed.verdict as CaseVerdict);

      // 4. Create escalation record if escalating
      let escalationId: string | undefined;
      if (verdict === 'escalate') {
        const agentSummaries = context.agentFindings
          .map((f) => `${f.agentName}: ${f.summary}`)
          .join('\n');
        const escalation = await createEscalation(
          context.caseInput.case_id,
          parsed.key_findings.join('; '),
          context.caseInput.severity,
          agentSummaries,
        );
        escalationId = escalation.escalation_id;
        this.log.info({ escalationId }, 'Escalation record created');
      }

      const outcome: CaseOutcome = {
        case_id: context.caseInput.case_id,
        issue_type: context.issueCategory,
        evidence: {
          doc_citations: dedupedCitations,
          tool_results: allToolResults,
          key_findings: [...allKeyFindings, ...parsed.key_findings],
        },
        verdict,
        customer_response: parsed.customer_response,
        internal_note: parsed.internal_note,
        ...(escalationId ? { escalation_id: escalationId } : {}),
      };

      this.log.info({ verdict, escalationId }, 'ResolutionAgent completed');
      return outcome;
    } catch (err) {
      if (err instanceof AgentError) throw err;
      throw new AgentError('ResolutionAgent failed', 'ResolutionAgent', err);
    }
  }
}
