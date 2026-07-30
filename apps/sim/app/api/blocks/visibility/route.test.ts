/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { proxy } = vi.hoisted(() => ({ proxy: vi.fn() }))
vi.mock('@/lib/api-proxy/w5-custom-blocks', () => ({
  proxyW5CustomBlockRequest: proxy,
}))

import { GET, HEAD, OPTIONS } from '@/app/api/blocks/visibility/route'

describe('block-visibility native facade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    proxy.mockResolvedValue(Response.json({ forwarded: true }))
  })

  it.each([
    ['GET', GET],
    ['HEAD', HEAD],
    ['OPTIONS', OPTIONS],
  ] as const)('forwards %s to API-0045', async (_method, handler) => {
    const request = new Request('http://localhost/api/blocks/visibility?workspaceId=workspace-1')
    await handler(request)
    expect(proxy).toHaveBeenCalledWith(request, 'API-0045')
  })
})
