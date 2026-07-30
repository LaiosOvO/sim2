import type { JobStatusV1 } from '@sim/api-contracts/execution-control'
import type { JobStatusReader } from '@/modules/execution/control'

interface TriggerRun {
  status?: string
  payload?: unknown
  payloadPresignedUrl?: string
  output?: unknown
  outputPresignedUrl?: string
  error?: { message?: string }
}

function status(value: string): JobStatusV1 {
  switch (value) {
    case 'EXECUTING':
    case 'RESCHEDULED':
    case 'FROZEN':
      return 'processing'
    case 'COMPLETED':
      return 'completed'
    case 'CANCELED':
    case 'FAILED':
    case 'CRASHED':
    case 'INTERRUPTED':
    case 'SYSTEM_FAILURE':
    case 'EXPIRED':
      return 'failed'
    default:
      return 'pending'
  }
}

async function presignedValue(url: string | undefined, fetcher: typeof fetch): Promise<unknown> {
  if (!url) return undefined
  const response = await fetcher(url)
  if (!response.ok) return undefined
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export interface TriggerJobStatusReaderOptions {
  secretKey: string
  baseUrl?: string
  fetcher?: typeof fetch
}

export function createTriggerJobStatusReader(
  options: TriggerJobStatusReaderOptions
): JobStatusReader {
  const fetcher = options.fetcher ?? fetch
  const baseUrl = options.baseUrl ?? 'https://api.trigger.dev'
  return {
    async read(jobId) {
      const response = await fetcher(
        new URL(`/api/v3/runs/${encodeURIComponent(jobId)}`, baseUrl),
        {
          headers: {
            authorization: `Bearer ${options.secretKey}`,
            'content-type': 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
        }
      )
      if (response.status === 404) return null
      if (!response.ok) {
        throw new Error(`Trigger.dev job lookup failed with ${response.status}`)
      }
      const run = (await response.json()) as TriggerRun
      try {
        const payloadValue = run.payload ?? (await presignedValue(run.payloadPresignedUrl, fetcher))
        const payload =
          payloadValue && typeof payloadValue === 'object'
            ? (payloadValue as Record<string, unknown>)
            : {}
        const output = run.output ?? (await presignedValue(run.outputPresignedUrl, fetcher))
        return {
          id: jobId,
          status: status(run.status ?? 'QUEUED'),
          metadata: {
            ...(typeof payload.workflowId === 'string' ? { workflowId: payload.workflowId } : {}),
            ...(typeof payload.userId === 'string' ? { userId: payload.userId } : {}),
            ...(payload.correlation && typeof payload.correlation === 'object'
              ? { correlation: payload.correlation }
              : {}),
          },
          ...(output !== undefined ? { output } : {}),
          ...(run.error?.message ? { error: run.error.message } : {}),
        }
      } catch (error) {
        throw new Error('Trigger.dev job payload could not be decoded', { cause: error })
      }
    },
  }
}
