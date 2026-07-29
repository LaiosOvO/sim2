import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import {
  executionCancellationResponseV1Schema,
  executionJobAdmissionResponseV1Schema,
} from '@sim/execution-contracts/job-control'
import type { ExecutionJobSubmitter } from '@/modules/execution/application/ports'

export interface HttpWorkerJobSubmitterOptions {
  baseUrl: string
  internalToken: string
  timeoutMs?: number
  fetcher?: typeof fetch
}

export function createHttpWorkerJobSubmitter(
  options: HttpWorkerJobSubmitterOptions
): ExecutionJobSubmitter {
  const baseUrl = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`
  const timeoutMs = options.timeoutMs ?? 10_000
  const fetcher = options.fetcher ?? fetch

  async function request(path: string, body: unknown): Promise<unknown> {
    const response = await fetcher(new URL(path, baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.internalToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      throw new Error(`Worker admission returned ${response.status}`)
    }
    return response.json()
  }

  return {
    async submit(job) {
      return executionJobAdmissionResponseV1Schema.parse(await request('internal/jobs', job))
    },
    async cancel(executionId, reason) {
      return executionCancellationResponseV1Schema.parse(
        await request(`internal/executions/${encodeURIComponent(executionId)}/cancel`, {
          contractVersion: EXECUTION_CONTRACTS_VERSION,
          ...(reason ? { reason } : {}),
        })
      )
    },
  }
}
