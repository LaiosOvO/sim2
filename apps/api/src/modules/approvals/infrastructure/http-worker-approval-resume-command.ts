import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import {
  approvalResumeCommandV1Schema,
  approvalResumeResultV1Schema,
} from '@sim/execution-contracts/approval-resume'
import type { ApprovalResumeCommand } from '@/modules/approvals/ports'

export interface HttpWorkerApprovalResumeOptions {
  baseUrl: string
  internalToken: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

export function createHttpWorkerApprovalResumeCommand(
  options: HttpWorkerApprovalResumeOptions
): ApprovalResumeCommand {
  const fetcher = options.fetcher ?? fetch
  return {
    async run(input) {
      const command = approvalResumeCommandV1Schema.parse({
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        commandId: input.requestId,
        approvalId: input.approvalId,
        workflowId: input.workflowId,
        executionId: input.executionId,
        contextId: input.contextId,
        decision: input.decision,
      })
      const response = await fetcher(new URL('/internal/approvals/resume', options.baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.internalToken}`,
          'content-type': 'application/json',
          'idempotency-key': input.approvalId,
        },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      })
      if (!response.ok) {
        throw new Error(`Worker approval resume failed with ${response.status}`)
      }
      return approvalResumeResultV1Schema.parse(await response.json())
    },
  }
}
