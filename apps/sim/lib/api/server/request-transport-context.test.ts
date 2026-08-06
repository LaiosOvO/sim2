/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { requestJson } from '@/lib/api/client/request'
import { defineRouteContract } from '@/lib/api/contracts/types'
import { withApiRequestTransport } from '@/lib/api/server/request-transport-context'

const testContract = defineRouteContract({
  method: 'GET',
  path: '/api/selector-test',
  response: { mode: 'json', schema: z.object({ source: z.string() }) },
})

function response(source: string) {
  return new Response(JSON.stringify({ source }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('withApiRequestTransport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('routes relative contract requests through the scoped transport', async () => {
    const transport = vi.fn(async () => response('gateway'))

    const result = await withApiRequestTransport(transport, () => requestJson(testContract, {}))

    expect(result).toEqual({ source: 'gateway' })
    expect(transport).toHaveBeenCalledWith(
      '/api/selector-test',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('keeps concurrent selector requests isolated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response('global'))
    )
    const run = (source: string) =>
      withApiRequestTransport(
        async () => {
          await Promise.resolve()
          return response(source)
        },
        () => requestJson(testContract, {})
      )

    const [first, second] = await Promise.all([run('first'), run('second')])

    expect(first.source).toBe('first')
    expect(second.source).toBe('second')
  })
})
