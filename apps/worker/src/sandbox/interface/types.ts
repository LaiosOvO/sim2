import type {
  SandboxExecutionResultV1,
  SandboxTestJobPayloadV1,
} from '@sim/execution-contracts/job-control'

export type SandboxFailureCode =
  | 'SANDBOX_INPUT_TOO_LARGE'
  | 'SANDBOX_POLICY_REJECTED'
  | 'SANDBOX_TRANSIENT_FAILURE'
  | 'SANDBOX_FATAL_FAILURE'
  | 'SANDBOX_CANCELLED'
  | 'SANDBOX_TIMEOUT'

export class SandboxExecutionFailure extends Error {
  constructor(
    readonly code: SandboxFailureCode,
    message: string,
    readonly retryable: boolean
  ) {
    super(message)
    this.name = 'SandboxExecutionFailure'
  }
}

export interface SandboxExecutionRequest {
  executionId: string
  attempt: number
  payload: SandboxTestJobPayloadV1
  signal: AbortSignal
}

export interface SandboxExecution {
  health(): Promise<boolean>
  execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResultV1>
}

export interface SandboxAuditRecord {
  executionId: string
  attempt: number
  phase: 'started' | 'completed' | 'failed'
  operation: SandboxTestJobPayloadV1['operation']
  policy: SandboxTestJobPayloadV1['policy']
  errorCode?: SandboxFailureCode
}

export interface SandboxAuditSink {
  record(record: SandboxAuditRecord): Promise<void> | void
}
