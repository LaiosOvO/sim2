import type { WorkspaceModeV1 } from '@sim/api-contracts/workspaces'

export interface WorkspaceHostSubscriptionSnapshot {
  plan: string
  status: string | null
  billingInterval: string | null
  metadata: unknown
}

export interface WorkspaceHostContextSnapshot {
  workspace: {
    id: string
    name: string
    workspaceMode: WorkspaceModeV1
    billedAccountUserId: string
    organizationId: string | null
  }
  viewerOrganizationRole: string | null
  subscription: WorkspaceHostSubscriptionSnapshot | null
  billingBlocked: boolean
  billingBlockedReason: 'payment_failed' | 'dispute' | null
}

/**
 * Hides the workspace, host membership, payer subscription, and billing-block
 * joins required by the public host-context projection.
 */
export interface WorkspaceHostContextReadRepository {
  readForViewer(workspaceId: string, viewerId: string): Promise<WorkspaceHostContextSnapshot | null>
}
