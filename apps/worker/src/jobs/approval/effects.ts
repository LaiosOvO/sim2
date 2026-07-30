import type {
  ApprovalEffectCommandV1,
  ApprovalEffectResultV1,
} from '@sim/execution-contracts/approval-effects'

export interface ApprovalEffectsSink {
  enqueue(command: ApprovalEffectCommandV1): Promise<ApprovalEffectResultV1>
}
