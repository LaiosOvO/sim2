export type ApprovalErrorCode =
  | 'APPROVAL_NOT_FOUND'
  | 'APPROVAL_TASK_NOT_FOUND'
  | 'APPROVAL_TASK_MISMATCH'
  | 'APPROVAL_VERSION_NOT_FOUND'
  | 'APPROVAL_DEFINITION_NOT_FOUND'
  | 'APPROVAL_CONFLICT'
  | 'APPROVAL_INVALID'

export class ApprovalDomainError extends Error {
  constructor(
    readonly code: ApprovalErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ApprovalDomainError'
  }
}
