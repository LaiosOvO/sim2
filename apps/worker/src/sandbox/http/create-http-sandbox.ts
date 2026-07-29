import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import {
  sandboxExecutionFailureV1Schema,
  sandboxExecutionResultV1Schema,
} from '@sim/execution-contracts/job-control'
import type { SandboxExecution } from '@/sandbox/interface/types'
import { SandboxExecutionFailure } from '@/sandbox/interface/types'

export interface HttpSandboxOptions {
  baseUrl: string
  internalToken: string
  fetcher?: typeof fetch
}

export function createHttpSandbox(options: HttpSandboxOptions): SandboxExecution {
  const baseUrl = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`
  const fetcher = options.fetcher ?? fetch
  const headers = {
    authorization: `Bearer ${options.internalToken}`,
    'content-type': 'application/json',
  }

  return {
    async health() {
      try {
        const response = await fetcher(new URL('internal/ready', baseUrl), {
          signal: AbortSignal.timeout(2_000),
        })
        return response.ok
      } catch {
        return false
      }
    },
    async execute(request) {
      const response = await fetcher(new URL('internal/sandbox/execute', baseUrl), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contractVersion: EXECUTION_CONTRACTS_VERSION,
          executionId: request.executionId,
          attempt: request.attempt,
          payload: request.payload,
        }),
        signal: AbortSignal.any([
          request.signal,
          AbortSignal.timeout(request.payload.policy.wallClockMs + 1_000),
        ]),
      })
      const body: unknown = await response.json()
      if (response.ok) return sandboxExecutionResultV1Schema.parse(body)
      const failure = sandboxExecutionFailureV1Schema.safeParse(body)
      if (failure.success) {
        throw new SandboxExecutionFailure(
          failure.data.error.code,
          failure.data.error.message,
          failure.data.error.retryable
        )
      }
      throw new SandboxExecutionFailure(
        'SANDBOX_TRANSIENT_FAILURE',
        `Sandbox service returned ${response.status}`,
        true
      )
    },
  }
}
