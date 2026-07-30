import type {
  ApprovalResumeCommandV1,
  ApprovalResumeResultV1,
} from '@sim/execution-contracts/approval-resume'

export interface ApprovalResumeRunner {
  execute(command: ApprovalResumeCommandV1): Promise<ApprovalResumeResultV1>
}
