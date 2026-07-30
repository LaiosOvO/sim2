/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { proxy } = vi.hoisted(() => ({ proxy: vi.fn() }))
vi.mock('@/lib/api-proxy/w5-custom-blocks', () => ({
  proxyW5CustomBlockRequest: proxy,
}))

import { GET, HEAD, OPTIONS, POST } from '@/app/api/custom-blocks/route'

describe('custom-block collection native facade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    proxy.mockResolvedValue(Response.json({ forwarded: true }))
  })

  it.each([
    ['GET', GET],
    ['POST', POST],
    ['HEAD', HEAD],
    ['OPTIONS', OPTIONS],
  ] as const)('forwards %s to API-0096', async (_method, handler) => {
    const request = new Request('http://localhost/api/custom-blocks')
    await handler(request)
    expect(proxy).toHaveBeenCalledWith(request, 'API-0096')
  })
})
