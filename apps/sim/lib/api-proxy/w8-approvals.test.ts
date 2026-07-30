import { describe, expect, it, vi } from 'vitest'
import { proxyW8ApprovalRequest } from '@/lib/api-proxy/w8-approvals'

describe('W8 approval proxy', () => {
  it('forwards cookies, body, query and inventory evidence to API', async () => {
    const fetcher = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      expect(String(request)).toBe('http://api.test/api/approvals/approval-1/decisions?trace=1')
      expect(new Headers(init?.headers).get('cookie')).toBe('session=valid')
      expect(await new Response(init?.body).json()).toEqual({
        taskId: 'task-1',
        action: 'approve',
      })
      return Response.json({ ok: true })
    })
    const response = await proxyW8ApprovalRequest(
      new Request('http://next.test/api/approvals/approval-1/decisions?trace=1', {
        method: 'POST',
        headers: { cookie: 'session=valid', 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: 'task-1', action: 'approve' }),
      }),
      'API-0002',
      { fetcher, apiBaseUrl: 'http://api.test' }
    )
    expect(response.headers.get('x-sim-api-route')).toBe('API-0002:api')
  })

  it('rejects a mismatched route before network access', async () => {
    const fetcher = vi.fn()
    const response = await proxyW8ApprovalRequest(
      new Request('http://next.test/api/approvals'),
      'API-0004',
      { fetcher }
    )
    expect(response.status).toBe(500)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('returns a stable 503 without importing server registries', async () => {
    const response = await proxyW8ApprovalRequest(
      new Request('http://next.test/api/approvals?workspaceId=workspace-1'),
      'API-0009',
      {
        fetcher: vi.fn(async () => {
          throw new Error('offline')
        }),
      }
    )
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('1')
  })
})
