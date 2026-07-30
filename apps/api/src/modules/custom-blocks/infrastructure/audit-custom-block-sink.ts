import { AuditAction, AuditResourceType, recordAudit } from '@sim/audit'
import type {
  CustomBlockAuditInput,
  CustomBlockAuditSink,
} from '@/modules/custom-blocks/ports/custom-block-audit'

function common(input: CustomBlockAuditInput) {
  return {
    workspaceId: input.workspaceId,
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorEmail: input.actor.email,
    resourceType: AuditResourceType.CUSTOM_BLOCK,
    resourceId: input.resourceId,
    resourceName: input.resourceName,
    request: input.request,
  }
}

export function createAuditCustomBlockSink(): CustomBlockAuditSink {
  return {
    published(input) {
      recordAudit({
        ...common(input),
        action: AuditAction.CUSTOM_BLOCK_PUBLISHED,
        description: `Published custom block "${input.resourceName}"`,
        metadata: {
          organizationId: input.organizationId,
          type: input.type,
          workflowId: input.workflowId,
        },
      })
    },
    updated(input) {
      recordAudit({
        ...common(input),
        action: AuditAction.CUSTOM_BLOCK_UPDATED,
        description: `Updated custom block "${input.resourceName}"`,
        metadata: { organizationId: input.organizationId, type: input.type },
      })
    },
    deleted(input) {
      recordAudit({
        ...common(input),
        action: AuditAction.CUSTOM_BLOCK_DELETED,
        description: `Unpublished custom block "${input.resourceName}"`,
        metadata: {
          organizationId: input.organizationId,
          type: input.type,
          usageCount: input.usage?.usageCount,
          deployedUsageCount: input.usage?.deployedUsageCount,
        },
      })
    },
  }
}
