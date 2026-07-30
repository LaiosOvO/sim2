import {
  approvalResumeCommandV1Schema,
  approvalResumeResultV1Schema,
} from '@sim/execution-contracts/approval-resume'
import type { ApprovalResumeRunner } from '@/jobs/approval/types'

export interface HttpApprovalResumeRunnerOptions {
  baseUrl: string
  internalToken: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

export function createHttpApprovalResumeRunner(
  options: HttpApprovalResumeRunnerOptions
): ApprovalResumeRunner {
  const fetcher = options.fetcher ?? fetch
  return {
    async execute(command) {
      const response = await fetcher(new URL('/api/internal/approvals/resume', options.baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.internalToken}`,
          'content-type': 'application/json',
          'idempotency-key': command.approvalId,
        },
        body: JSON.stringify(approvalResumeCommandV1Schema.parse(command)),
        signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
      })
      if (!response.ok) {
        throw new Error(`Approval execution service failed with ${response.status}`)
      }
      return approvalResumeResultV1Schema.parse(await response.json())
    },
  }
}
