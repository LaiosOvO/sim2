import {
  resumeExecutionCommandV1Schema,
  resumeExecutionResultV1Schema,
} from '@sim/execution-contracts/resume-poll'
import type { ResumeExecutionRunner } from '@/jobs/resume/resume-execution-runner'

export interface HttpResumeExecutionRunnerOptions {
  baseUrl: string
  internalToken: string
  fetcher?: typeof fetch
  timeoutMs?: number
  path?: string
}

export function createHttpResumeExecutionRunner(
  options: HttpResumeExecutionRunnerOptions
): ResumeExecutionRunner {
  const fetcher = options.fetcher ?? fetch
  return {
    async execute(command) {
      const response = await fetcher(
        new URL(options.path ?? '/internal/resume/execute', options.baseUrl),
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.internalToken}`,
            'content-type': 'application/json',
            'idempotency-key': command.resumeEntryId,
          },
          body: JSON.stringify(resumeExecutionCommandV1Schema.parse(command)),
          signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
        }
      )
      if (!response.ok) {
        return {
          contractVersion: command.contractVersion,
          ok: false,
          retryable: response.status >= 500,
          error: `Resume execution service failed with ${response.status}`,
        }
      }
      return resumeExecutionResultV1Schema.parse(await response.json())
    },
  }
}
