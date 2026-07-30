import { EXECUTION_CONTRACTS_VERSION, resumePollResultV1Schema } from '@sim/execution-contracts'
import type { ResumePollCommandPort } from '../ports'

export interface HttpWorkerResumePollCommandOptions {
  baseUrl: string
  internalToken: string
  fetcher?: typeof fetch
  timeoutMs?: number
  now?: () => Date
}

export function createHttpWorkerResumePollCommand(
  options: HttpWorkerResumePollCommandOptions
): ResumePollCommandPort {
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? 120_000
  const now = options.now ?? (() => new Date())
  return {
    async run(commandId) {
      const response = await fetcher(new URL('/internal/resume/poll', options.baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.internalToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          contractVersion: EXECUTION_CONTRACTS_VERSION,
          commandId,
          requestedAt: now().toISOString(),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) throw new Error(`Worker resume poll failed with ${response.status}`)
      return resumePollResultV1Schema.parse(await response.json())
    },
  }
}
