import { beforeEach, describe, expect, it, vi } from 'vitest'

const { proxy } = vi.hoisted(() => ({ proxy: vi.fn() }))
vi.mock('@/lib/api-proxy/w6-execution-control', () => ({
  proxyW6ExecutionControlRequest: proxy,
}))

import { GET } from './route'

describe('GET /api/workflows/[id]/executions/[executionId] facade', () => {
  beforeEach(() => proxy.mockReset())

  it('forwards through the focused execution-control boundary', async () => {
    const expected = Response.json({ status: 'running' })
    proxy.mockResolvedValue(expected)
    const request = new Request('http://localhost/api/workflows/workflow-1/executions/execution-1')
    expect(await GET(request)).toBe(expected)
    expect(proxy).toHaveBeenCalledWith(request, 'API-0993')
  })
})
