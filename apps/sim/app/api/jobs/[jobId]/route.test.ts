import { beforeEach, describe, expect, it, vi } from 'vitest'

const { proxy } = vi.hoisted(() => ({ proxy: vi.fn() }))
vi.mock('@/lib/api-proxy/w6-execution-control', () => ({
  proxyW6ExecutionControlRequest: proxy,
}))

import { GET } from './route'

describe('GET /api/jobs/[jobId] facade', () => {
  beforeEach(() => proxy.mockReset())

  it('forwards only through the focused W6 execution-control proxy', async () => {
    const expected = Response.json({ success: true })
    proxy.mockResolvedValue(expected)
    const request = new Request('http://localhost/api/jobs/job-1')
    expect(await GET(request)).toBe(expected)
    expect(proxy).toHaveBeenCalledWith(request, 'API-0138')
  })
})
