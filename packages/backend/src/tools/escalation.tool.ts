import { randomUUID } from 'node:crypto';
import { DatabaseError } from '../errors/index.js';
import { queryOne } from '../lib/database.js';
import { logger } from '../lib/logger.js';
import type { Escalation } from '../types/index.js';

const log = logger.child({ service: 'escalation-tool' });

export async function createEscalation(
  caseId: string,
  reason: string,
  severity: string,
  evidenceSummary: string,
): Promise<Escalation> {
  const escalationId = randomUUID();
  log.info({ caseId, escalationId, severity }, 'Creating escalation');

  const escalation = await queryOne<Escalation>(
    `INSERT INTO escalations (escalation_id, case_id, reason, severity, evidence_summary, assigned_to, created_at)
     VALUES ($1, $2, $3, $4, $5, NULL, NOW())
     RETURNING escalation_id, case_id, reason, severity, evidence_summary, assigned_to, created_at`,
    [escalationId, caseId, reason, severity, evidenceSummary],
  );

  if (!escalation) {
    throw new DatabaseError(
      'Failed to create escalation record — INSERT returned no row',
    );
  }

  log.info({ escalationId, caseId }, 'Escalation created');
  return escalation;
}
