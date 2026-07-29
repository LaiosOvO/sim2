import type {
  ExecutionCancellationResponseV1,
  ExecutionJobAdmissionResponseV1,
} from '@sim/execution-contracts/job-control'
import type { ExecutionJobV1 } from '@sim/execution-contracts/jobs'

export interface ExecutionJobSubmitter {
  submit(job: ExecutionJobV1): Promise<ExecutionJobAdmissionResponseV1>
  cancel(executionId: string, reason?: string): Promise<ExecutionCancellationResponseV1>
}
