import { query } from '../lib/database.js';
import { logger } from '../lib/logger.js';
import type { Incident, ServiceStatus } from '../types/index.js';

const log = logger.child({ service: 'service-status-tool' });

export interface ServiceStatusResult {
  components: ServiceStatus[];
  activeIncidents: Incident[];
}

export async function checkServiceStatus(): Promise<ServiceStatusResult> {
  log.info('Checking service status');

  const components = await query<ServiceStatus>(
    `SELECT service_status_id, component, region, status, incident_id, updated_at
     FROM service_status
     ORDER BY component, region`,
  );

  const activeIncidents = await query<Incident>(
    `SELECT incident_id, title, severity, affected_services, start_time, end_time, status
     FROM incidents
     WHERE status != $1
     ORDER BY start_time DESC`,
    ['resolved'],
  );

  log.info(
    {
      componentCount: components.length,
      activeIncidentCount: activeIncidents.length,
    },
    'Service status retrieved',
  );

  return { components, activeIncidents };
}
