import type { AuthenticatedActor } from '@sim/api-contracts/auth'
import type { CustomBlockUsageCountsV1 } from '@sim/api-contracts/custom-blocks'

export interface CustomBlockAuditInput {
  request: Request
  actor: AuthenticatedActor
  workspaceId: string | null
  organizationId: string
  resourceId: string
  resourceName: string
  type: string
  workflowId?: string
  usage?: CustomBlockUsageCountsV1
}

export interface CustomBlockAuditSink {
  published(input: CustomBlockAuditInput): void
  updated(input: CustomBlockAuditInput): void
  deleted(input: CustomBlockAuditInput): void
}
