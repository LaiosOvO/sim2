import { AuditAction, AuditResourceType, recordAudit } from '@sim/audit'
import type { EnvironmentAuditSink } from '@/modules/environment/application/ports'

export function createAuditEnvironmentSink(): EnvironmentAuditSink {
  return {
    updated({ actor, keys, request }) {
      recordAudit({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: AuditAction.ENVIRONMENT_UPDATED,
        resourceType: AuditResourceType.ENVIRONMENT,
        resourceId: actor.id,
        description: `Updated ${keys.length} personal environment variable(s)`,
        metadata: {
          variableCount: keys.length,
          updatedKeys: [...keys],
          scope: 'personal',
        },
        request,
      })
    },
  }
}
