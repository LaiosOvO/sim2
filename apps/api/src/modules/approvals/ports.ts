import type {
  ApprovalDefinitionV1,
  ApprovalDefinitionVersionV1,
  ApprovalV1,
  ParsedCreateApprovalDefinitionBodyV1,
  ParsedDecideApprovalBodyV1,
  ParsedListApprovalsQueryV1,
  ParsedStartApprovalBodyV1,
} from '@sim/api-contracts/approvals'
import type { AuthenticatedActor } from '@sim/api-contracts/auth'

export type WorkspacePermission = 'read' | 'write' | 'admin'

export interface ApprovalWorkspaceAccess {
  organizationId: string | null
  organizationRole: string | null
  permission: WorkspacePermission
}

export interface ApprovalAccessPort {
  workspace(actorId: string, workspaceId: string): Promise<ApprovalWorkspaceAccess | null>
  hasBusinessCapability(input: {
    actorId: string
    organizationId: string
    workspaceId: string
    menuCode: 'approvals' | 'approval_logs'
    permissionCode: 'pm.approval.read' | 'pm.approval.audit.read'
  }): Promise<boolean>
  filterVisibleApprovals(input: {
    actorId: string
    organizationId: string
    workspaceId: string
    approvals: ApprovalV1[]
  }): Promise<ApprovalV1[]>
}

export interface ApprovalDecisionResult {
  status: 'pending' | 'terminal' | 'already_decided'
  approvalStatus: ApprovalV1['status']
  approvalId: string
  shouldResume: boolean
}

export interface ApprovalResumeClaim {
  approvalId: string
  workflowId: string
  executionId: string
  contextId: string
  approvalStatus: ApprovalV1['status']
  recoveredStalledClaim: boolean
}

export interface ApprovalRepository {
  listDefinitions(workspaceId: string): Promise<ApprovalDefinitionV1[]>
  getDefinitionWorkspace(definitionId: string): Promise<string | null>
  createDefinition(
    input: ParsedCreateApprovalDefinitionBodyV1,
    actorId: string
  ): Promise<ApprovalDefinitionV1>
  createVersion(
    definitionId: string,
    spec: ApprovalDefinitionVersionV1['spec'],
    actorId: string
  ): Promise<ApprovalDefinitionVersionV1>
  publishVersion(definitionId: string, versionId: string): Promise<ApprovalDefinitionVersionV1>
  listApprovals(input: ParsedListApprovalsQueryV1 & { actorId: string }): Promise<ApprovalV1[]>
  getApproval(approvalId: string): Promise<ApprovalV1 | null>
  start(input: ParsedStartApprovalBodyV1, requestedBy: string): Promise<ApprovalV1>
  decide(
    approvalId: string,
    input: ParsedDecideApprovalBodyV1,
    actorId: string
  ): Promise<ApprovalDecisionResult>
  claimResume(approvalId: string): Promise<ApprovalResumeClaim>
  markResumeStarted(approvalId: string, resumeExecutionId: string): Promise<void>
  markResumeFailed(approvalId: string, error: string): Promise<void>
}

export interface ApprovalResumeCommand {
  run(input: {
    approvalId: string
    workflowId: string
    executionId: string
    contextId: string
    decision: ApprovalV1['status']
    requestId: string
  }): Promise<{ status: 'resuming' | 'queued'; resumeExecutionId: string }>
}

export interface ApprovalEffectsPort {
  approvalStarted(approval: ApprovalV1): Promise<void>
  approvalDecided(input: {
    approvalId: string
    action: ParsedDecideApprovalBodyV1['action']
    actorId: string
  }): Promise<void>
}

export interface ApprovalAuditPort {
  record(input: {
    request: Request
    requestId: string
    actor: AuthenticatedActor
    workspaceId: string
    organizationId: string | null
    action: string
    resourceId: string
    resourceName?: string
    metadata?: Record<string, unknown>
  }): Promise<void>
  list(input: {
    workspaceId: string
    actorId: string
    status?: ApprovalV1['status']
    workflowId?: string
    projectId?: string
    eventCategory?: 'card_sent' | 'approved' | 'rejected' | 'returned' | 'write'
    search?: string
    limit: number
  }): Promise<unknown>
}
