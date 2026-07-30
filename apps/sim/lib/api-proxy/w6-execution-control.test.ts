import { describe, expect, it, vi } from 'vitest'
import { proxyW6ExecutionControlRequest } from './w6-execution-control'

describe('W6 execution-control proxy', () => {
  it.each([
    ['API-0138', '/api/jobs/job-1'],
    ['API-0283', '/api/resume/poll'],
    ['API-0993', '/api/workflows/workflow-1/executions/execution-1?includeOutput=false'],
  ] as const)('forwards %s without importing server implementation modules', async (id, path) => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }))
    const response = await proxyW6ExecutionControlRequest(
      new Request(`http://next.test${path}`, {
        headers: { cookie: 'session=valid', authorization: 'Bearer cron' },
      }),
      id,
      { fetcher, apiBaseUrl: 'http://api.test' }
    )
    expect(response.status).toBe(200)
    expect(fetcher).toHaveBeenCalledOnce()
    const [target, init] = fetcher.mock.calls[0]
    expect(target.origin).toBe('http://api.test')
    expect(init.headers.get('cookie')).toBe('session=valid')
    expect(init.headers.get('authorization')).toBe('Bearer cron')
  })
})
