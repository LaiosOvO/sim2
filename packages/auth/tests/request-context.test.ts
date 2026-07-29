import { describe, expect, it, vi } from 'vitest'
import {
  type CredentialFailureReason,
  createRequestAuthenticator,
  type RequestAuthenticatorDependencies,
} from '../src/request-context'

function dependencies(
  failures: Partial<
    Record<'session' | 'api-key' | 'public-token' | 'internal', CredentialFailureReason>
  > = {}
): RequestAuthenticatorDependencies {
  return {
    sessions: {
      async verify() {
        const reason = failures.session
        return reason
          ? { verified: false, reason }
          : {
              verified: true,
              credential: {
                actor: {
                  id: 'user-session',
                  type: 'user',
                  name: 'Session User',
                  email: 'session@example.com',
                },
                sessionId: 'session-1',
                activeOrganizationId: 'org-1',
              },
            }
      },
    },
    apiKeys: {
      async verify() {
        const reason = failures['api-key']
        return reason
          ? { verified: false, reason }
          : {
              verified: true,
              credential: {
                actor: { id: 'user-key', type: 'user' },
                keyId: 'key-1',
                keyType: 'workspace',
                workspaceId: 'workspace-1',
              },
            }
      },
      touch: vi.fn(async () => undefined),
    },
    publicTokens: {
      async verify() {
        const reason = failures['public-token']
        return reason
          ? { verified: false, reason }
          : {
              verified: true,
              credential: {
                shareId: 'share-1',
                workspaceId: 'workspace-1',
                organizationId: 'org-1',
                resourceType: 'file',
                resourceId: 'file-1',
              },
            }
      },
    },
    internal: {
      async verify() {
        const reason = failures.internal
        return reason
          ? { verified: false, reason }
          : {
              verified: true,
              credential: {
                actor: { id: 'executor', type: 'service' },
                service: 'executor',
                scopes: ['workflow:*'],
              },
            }
      },
    },
  }
}

function request(headers: HeadersInit = {}): Request {
  return new Request('http://api.test/protected', { headers })
}

describe('request authentication context', () => {
  it.each([
    {
      method: 'session',
      request: request({ cookie: 'better-auth.session_token=valid' }),
      policy: { mode: 'session' } as const,
      actorId: 'user-session',
    },
    {
      method: 'api-key',
      request: request({ 'x-api-key': 'sk-sim-valid' }),
      policy: { mode: 'api-key' } as const,
      actorId: 'user-key',
    },
    {
      method: 'public-token',
      request: request({ cookie: 'better-auth.session_token=ambient' }),
      policy: { mode: 'public-token', token: 'share-token' } as const,
      actorId: 'public-share:share-1',
    },
    {
      method: 'internal',
      request: request({ authorization: 'Bearer internal-token' }),
      policy: { mode: 'internal', actor: 'service' } as const,
      actorId: 'executor',
    },
  ])('creates a redacted $method context', async ({ method, request, policy, actorId }) => {
    const result = await createRequestAuthenticator(dependencies()).authenticate({
      request,
      requestId: `request-${method}`,
      policy,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.context.authenticationMethod).toBe(method)
    expect(result.context.actor.id).toBe(actorId)
    expect(JSON.stringify(result.context)).not.toContain('sk-sim-valid')
    expect(JSON.stringify(result.context)).not.toContain('share-token')
    expect(JSON.stringify(result.context)).not.toContain('internal-token')
  })

  it.each([
    ['expired', 'expired_credentials'],
    ['revoked', 'revoked_credentials'],
    ['invalid', 'invalid_credentials'],
  ] as const)('rejects %s API keys without falling back', async (reason, code) => {
    const sessionVerify = vi.fn()
    const deps = dependencies({ 'api-key': reason })
    deps.sessions = { verify: sessionVerify }
    const result = await createRequestAuthenticator(deps).authenticate({
      request: request({
        'x-api-key': 'bad-key',
      }),
      requestId: 'request-key-failure',
      policy: { mode: 'hybrid', allowed: ['session', 'api-key'] },
    })

    expect(result).toMatchObject({ ok: false, error: { code, status: 401 } })
    expect(sessionVerify).not.toHaveBeenCalled()
  })

  it('rejects missing credentials and an empty hybrid allow-list', async () => {
    const authenticator = createRequestAuthenticator(dependencies())
    await expect(
      authenticator.authenticate({
        request: request(),
        requestId: 'request-missing',
        policy: { mode: 'session' },
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'missing_credentials', status: 401 },
    })
    await expect(
      authenticator.authenticate({
        request: request({ cookie: 'session=valid' }),
        requestId: 'request-empty',
        policy: { mode: 'hybrid', allowed: [] },
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'credential_not_allowed', status: 403 },
    })
  })

  it('rejects ambiguous or disallowed credentials before calling a verifier', async () => {
    const deps = dependencies()
    const apiVerify = vi.spyOn(deps.apiKeys!, 'verify')
    const sessionVerify = vi.spyOn(deps.sessions!, 'verify')
    const authenticator = createRequestAuthenticator(deps)

    const ambiguous = await authenticator.authenticate({
      request: request({
        cookie: 'session=valid',
        'x-api-key': 'key',
      }),
      requestId: 'request-ambiguous',
      policy: { mode: 'hybrid', allowed: ['session', 'api-key'] },
    })
    const disallowed = await authenticator.authenticate({
      request: request({ 'x-api-key': 'key' }),
      requestId: 'request-disallowed',
      policy: { mode: 'session' },
    })

    expect(ambiguous).toMatchObject({
      ok: false,
      error: { code: 'ambiguous_credentials' },
    })
    expect(disallowed).toMatchObject({
      ok: false,
      error: { code: 'credential_not_allowed' },
    })
    expect(apiVerify).not.toHaveBeenCalled()
    expect(sessionVerify).not.toHaveBeenCalled()
  })

  it('requires routes to declare which internal actor class they accept', async () => {
    const authenticator = createRequestAuthenticator(dependencies())
    const requestWithToken = request({ authorization: 'Bearer internal-token' })

    await expect(
      authenticator.authenticate({
        request: requestWithToken.clone(),
        requestId: 'request-internal-hybrid',
        policy: { mode: 'hybrid', allowed: ['internal'] },
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'credential_not_allowed', status: 403 },
    })
    await expect(
      authenticator.authenticate({
        request: requestWithToken,
        requestId: 'request-internal-user-only',
        policy: { mode: 'internal', actor: 'user' },
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'credential_not_allowed', status: 403 },
    })
  })
})
