export const APPROVAL_MODULE_ID = 'approval' as const

export type {
  ApprovalDefinitionValidation,
  ApprovalOutcome,
  ApprovalVote,
} from './state-machine'
export {
  aggregateApprovalVotes,
  approvalOutcomeForAction,
  findInitialApprovalNode,
  findNextApprovalNode,
  validateApprovalDefinition,
} from './state-machine'
