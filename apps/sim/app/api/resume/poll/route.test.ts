import { beforeEach, describe, expect, it, vi } from 'vitest'

const { proxy } = vi.hoisted(() => ({ proxy: vi.fn() }))
vi.mock('@/lib/api-proxy/w6-execution-control', () => ({
  proxyW6ExecutionControlRequest: proxy,
}))

import { GET, maxDuration } from './route'

describe('GET /api/resume/poll facade', () => {
  beforeEach(() => proxy.mockReset())

  it('forwards the cron request to API while retaining its duration budget', async () => {
    const expected = Response.json({ success: true })
    proxy.mockResolvedValue(expected)
    const request = new Request('http://localhost/api/resume/poll')
    expect(await GET(request)).toBe(expected)
    expect(proxy).toHaveBeenCalledWith(request, 'API-0283')
    expect(maxDuration).toBe(120)
  })
})
