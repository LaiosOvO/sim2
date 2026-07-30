export {
  type ApprovalsModule,
  type ApprovalsModuleDependencies,
  createApprovalsModule,
} from '@/modules/approvals/application/create-approvals-module'
export { ApprovalDomainError, type ApprovalErrorCode } from '@/modules/approvals/errors'
export type {
  ApprovalAccessPort,
  ApprovalAuditPort,
  ApprovalDecisionResult,
  ApprovalEffectsPort,
  ApprovalRepository,
  ApprovalResumeClaim,
  ApprovalResumeCommand,
  ApprovalWorkspaceAccess,
} from '@/modules/approvals/ports'
