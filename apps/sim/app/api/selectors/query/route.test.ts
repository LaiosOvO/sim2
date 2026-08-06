/**
 * @vitest-environment node
 */
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckWorkspaceAccess, mockGetEnvironment, mockGetSession, mockLoadOptions } =
  vi.hoisted(() => ({
    mockCheckWorkspaceAccess: vi.fn(),
    mockGetEnvironment: vi.fn(),
    mockGetSession: vi.fn(),
    mockLoadOptions: vi.fn(),
  }))

vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }))
vi.mock('@/lib/workspaces/permissions/utils', () => ({
  checkWorkspaceAccess: mockCheckWorkspaceAccess,
}))
vi.mock('@/lib/environment/utils', () => ({ getEffectiveDecryptedEnv: mockGetEnvironment }))
vi.mock('@/lib/api/server/request-transport-context', () => ({
  withApiRequestTransport: (_transport: unknown, operation: () => Promise<unknown>) => operation(),
}))
vi.mock('@/hooks/selectors/lazy-registry', () => ({
  loadSelectorDefinition: (key: string) =>
    key === 'slack.channels' ? Promise.resolve({ key: 'slack.channels' }) : Promise.resolve(null),
}))
vi.mock('@/hooks/selectors/load-options', () => ({ loadAllSelectorOptions: mockLoadOptions }))

import { createInternalRequestTransport, POST } from '@/app/api/selectors/query/route'

function request(selectorKey = 'slack.channels') {
  return new NextRequest('http://localhost:3000/api/selectors/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'session=test' },
    body: JSON.stringify({
      selectorKey,
      context: {
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        oauthCredential: 'credential-1',
      },
    }),
  })
}

describe('POST /api/selectors/query', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockCheckWorkspaceAccess.mockResolvedValue({ hasAccess: true })
    mockGetEnvironment.mockResolvedValue({ SLACK_CREDENTIAL: 'credential-from-environment' })
    mockLoadOptions.mockResolvedValue([
      { id: 'channel-1', label: 'General', meta: { private: false } },
    ])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses a loopback origin instead of trusting the public Host header', async () => {
    vi.stubEnv('SIM_NEXT_INTERNAL_URL', 'http://127.0.0.1:3000')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createInternalRequestTransport(
      new NextRequest('http://attacker.example/api/selectors/query')
    )

    await transport('/api/credentials?workspaceId=workspace-1')

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://127.0.0.1:3000/api/credentials?workspaceId=workspace-1'
    )
    await expect(transport('https://attacker.example/api/credentials')).rejects.toThrow(
      'same-origin'
    )
  })

  it('returns the narrow browser-safe option shape', async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [{ id: 'channel-1', label: 'General' }] })
    expect(mockLoadOptions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        key: 'slack.channels',
        context: expect.objectContaining({ oauthCredential: 'credential-1' }),
      })
    )
  })

  it('rejects unknown selector keys before any provider request', async () => {
    const response = await POST(request('unknown.selector'))

    expect(response.status).toBe(400)
    expect(mockLoadOptions).not.toHaveBeenCalled()
  })

  it('requires workspace membership', async () => {
    mockCheckWorkspaceAccess.mockResolvedValue({ hasAccess: false })

    const response = await POST(request())

    expect(response.status).toBe(403)
    expect(mockLoadOptions).not.toHaveBeenCalled()
  })

  it('resolves environment references without returning secret values to Vite', async () => {
    const envRequest = new NextRequest('http://localhost:3000/api/selectors/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selectorKey: 'slack.channels',
        context: { workspaceId: 'workspace-1', oauthCredential: '{{SLACK_CREDENTIAL}}' },
      }),
    })

    const response = await POST(envRequest)

    expect(response.status).toBe(200)
    expect(mockLoadOptions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        context: expect.objectContaining({ oauthCredential: 'credential-from-environment' }),
      })
    )
    expect(await response.json()).toEqual({ items: [{ id: 'channel-1', label: 'General' }] })
  })
})
