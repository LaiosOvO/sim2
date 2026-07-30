import { randomUUID } from 'node:crypto'
import {
  EXECUTION_CONTRACTS_VERSION,
  executionObjectReadCommandV1Schema,
  executionObjectReadResultV1Schema,
  MAX_EXECUTION_OBJECT_BYTES,
} from '@sim/execution-contracts'
import {
  type ExecutionObjectStore,
  ExecutionPayloadUnavailableError,
} from '@/modules/execution/control'

const maximumEnvelopeBytes = 64 * 1024

export interface HttpExecutionObjectStoreOptions {
  baseUrl: string
  internalToken: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

export function createHttpExecutionObjectStore(
  options: HttpExecutionObjectStoreOptions
): ExecutionObjectStore {
  const fetcher = options.fetcher ?? fetch
  return {
    async readJson(input) {
      const command = executionObjectReadCommandV1Schema.parse({
        contractVersion: EXECUTION_CONTRACTS_VERSION,
        requestId: randomUUID(),
        ...input,
      })
      let response: Response
      try {
        response = await fetcher(new URL('/api/internal/execution-objects/read', options.baseUrl), {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.internalToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(command),
          signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        })
      } catch (error) {
        throw new ExecutionPayloadUnavailableError('Execution object service is unavailable', {
          cause: error,
        })
      }
      const maximumResponseBytes =
        Math.min(command.reference.size, MAX_EXECUTION_OBJECT_BYTES) + maximumEnvelopeBytes
      const contentLength = Number(response.headers.get('content-length'))
      if (Number.isFinite(contentLength) && contentLength > maximumResponseBytes) {
        throw new ExecutionPayloadUnavailableError('Execution object response exceeds its limit')
      }
      const text = await response.text()
      if (Buffer.byteLength(text, 'utf8') > maximumResponseBytes) {
        throw new ExecutionPayloadUnavailableError('Execution object response exceeds its limit')
      }
      let result
      try {
        result = executionObjectReadResultV1Schema.parse(JSON.parse(text))
      } catch (error) {
        throw new ExecutionPayloadUnavailableError(
          'Execution object service returned an invalid contract',
          { cause: error }
        )
      }
      if (result.requestId !== command.requestId) {
        throw new ExecutionPayloadUnavailableError(
          'Execution object service returned the wrong request ID'
        )
      }
      if (result.status === 'missing') return null
      if (result.status === 'unavailable' || !response.ok) {
        throw new ExecutionPayloadUnavailableError(
          result.status === 'unavailable' ? result.error : `Execution object service failed`
        )
      }
      return result.data
    },
  }
}
