import { AsyncLocalStorage } from 'node:async_hooks'
import { type ApiRequestFetch, installApiRequestTransport } from '@/lib/api/client/transport'

const requestTransport = new AsyncLocalStorage<ApiRequestFetch>()

installApiRequestTransport((input, init) => {
  const scopedTransport = requestTransport.getStore()
  return scopedTransport ? scopedTransport(input, init) : globalThis.fetch(input, init)
})

export function withApiRequestTransport<T>(
  transport: ApiRequestFetch,
  operation: () => Promise<T>
): Promise<T> {
  return requestTransport.run(transport, operation)
}
