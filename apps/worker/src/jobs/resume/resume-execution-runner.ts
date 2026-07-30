import type {
  ResumeExecutionCommandV1,
  ResumeExecutionResultV1,
} from '@sim/execution-contracts/resume-poll'

export interface ResumeExecutionRunner {
  execute(command: ResumeExecutionCommandV1): Promise<ResumeExecutionResultV1>
}

export function createUnavailableResumeExecutionRunner(reason: string): ResumeExecutionRunner {
  return {
    async execute(command) {
      return {
        contractVersion: command.contractVersion,
        ok: false,
        retryable: true,
        error: reason,
      }
    },
  }
}
