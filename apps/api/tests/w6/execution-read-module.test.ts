import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createExecutionReadModule } from '@/modules/execution/read/application/create-execution-read-module'
import { createGetPausedExecutionUseCase } from '@/modules/execution/read/application/get-paused-execution'
import {
  createGetPausedExecutionHandler,
  type GetPausedExecutionHandlerInput,
} from '@/modules/execution/read/interface/create-get-paused-execution-handler'

const session: SessionRequestContext = {
  authContextVersion: 1,
  authenticationMethod: 'session',
  actor: { id: 'user-1', type: 'user' },
  requestId: 'request-w6',
  credentialId: 'session-1',
  activeOrganizationId: null,
  permissions: [],
}

function authentication() {
  return createRequestAuthenticator({
    sessions: {
      async verify(headers) {
        return headers.get('cookie') === 'session=valid'
          ? {
              verified: true,
              credential: {
                actor: session.actor,
                sessionId: session.credentialId,
                activeOrganizationId: null,
              },
            }
          : { verified: false, reason: 'invalid' }
      },
    },
    apiKeys: {
      async verify(apiKey) {
        if (apiKey !== 'workspace-key-valid' && apiKey !== 'personal-key-valid') {
          return { verified: false, reason: 'invalid' }
        }
        const workspaceKey = apiKey === 'workspace-key-valid'
        return {
          verified: true,
          credential: {
            actor: session.actor,
            keyId: workspaceKey ? 'workspace-key-1' : 'personal-key-1',
            keyType: workspaceKey ? 'workspace' : 'personal',
            workspaceId: workspaceKey ? 'workspace-1' : null,
          },
        }
      },
    },
    internal: {
      async verify(token) {
        if (token !== 'internal-user-valid' && token !== 'internal-service-valid') {
          return { verified: false, reason: 'invalid' }
        }
        const userToken = token === 'internal-user-valid'
        return {
          verified: true,
          credential: {
            actor: userToken
              ? { id: 'user-1', type: 'user' }
              : { id: 'execution-worker', type: 'service' },
            service: userToken ? 'admin-tool' : 'execution-worker',
            scopes: ['execution:read'],
          },
        }
      },
    },
  })
}

describe('W6 execution-read module', () => {
  it.each([
    ['API-0282', '/api/resume/workflow-1/execution-1', 'detail'],
    ['API-0996', '/api/workflows/workflow-1/paused/execution-1', 'detail'],
    ['API-0997', '/api/workflows/workflow-1/paused', 'list'],
  ] as const)('routes %s through native authentication and observation', async (id, path, kind) => {
    const detail = vi.fn(async () => Response.json({ kind: 'detail' }))
    const list = vi.fn(async () => Response.json({ kind: 'list' }))
    const application = createApiApplication({
      executionRead: createExecutionReadModule({
        authentication: authentication(),
        getPausedExecution: detail,
        listPausedExecutions: list,
      }),
    })

    const response = await application.handle(
      new Request(`http://api.test${path}`, {
        headers: {
          cookie: 'session=valid',
          'x-request-id': 'request-w6',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kind })
    expect(response.headers.get('x-sim-api-module')).toBe('execution-read')
    expect(response.headers.get('x-sim-api-inventory-id')).toBe(id)
    expect(response.headers.get('x-sim-api-backend')).toBe('native')
  })

  it('authenticates before invoking either handler', async () => {
    const detail = vi.fn(async () => Response.json({ unexpected: true }))
    const list = vi.fn(async () => Response.json({ unexpected: true }))
    const application = createApiApplication({
      executionRead: createExecutionReadModule({
        authentication: authentication(),
        getPausedExecution: detail,
        listPausedExecutions: list,
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/resume/%E0%A4%A/execution-1')
    )

    expect(response.status).toBe(401)
    expect(detail).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
  })

  it.each([
    ['session user', { cookie: 'session=valid' }, 'session', 'user'],
    ['workspace API key', { 'x-api-key': 'workspace-key-valid' }, 'api-key', 'user'],
    ['personal API key', { 'x-api-key': 'personal-key-valid' }, 'api-key', 'user'],
    ['internal user', { authorization: 'Bearer internal-user-valid' }, 'internal', 'user'],
  ] as const)(
    'passes the production hybrid identity matrix for %s',
    async (_name, headers, expectedMethod, expectedActorType) => {
      const detail = vi.fn(async ({ authenticationContext }) => {
        expect(authenticationContext?.authenticationMethod).toBe(expectedMethod)
        expect(authenticationContext?.actor.type).toBe(expectedActorType)
        return Response.json({ accepted: true })
      })
      const application = createApiApplication({
        executionRead: createExecutionReadModule({
          authentication: authentication(),
          getPausedExecution: detail,
          listPausedExecutions: vi.fn(),
        }),
      })

      const response = await application.handle(
        new Request('http://api.test/api/resume/workflow-1/execution-1', { headers })
      )

      expect(response.status).toBe(200)
      expect(detail).toHaveBeenCalledOnce()
    }
  )

  it('authenticates an internal service actor but rejects it at the user-only handler seam', async () => {
    const authorize = vi.fn()
    const readDetail = vi.fn()
    const getPausedExecution = createGetPausedExecutionHandler(
      createGetPausedExecutionUseCase({
        authorizer: { authorize },
        reader: { readDetail, list: vi.fn() },
      })
    )
    const application = createApiApplication({
      executionRead: createExecutionReadModule({
        authentication: authentication(),
        getPausedExecution,
        listPausedExecutions: vi.fn(),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/resume/workflow-1/execution-1', {
        headers: { authorization: 'Bearer internal-service-valid' },
      })
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(authorize).not.toHaveBeenCalled()
    expect(readDetail).not.toHaveBeenCalled()
  })

  it('returns validation error for authenticated invalid encoded params before authorization', async () => {
    const authorize = vi.fn()
    const readDetail = vi.fn()
    const application = createApiApplication({
      executionRead: createExecutionReadModule({
        authentication: authentication(),
        getPausedExecution: createGetPausedExecutionHandler(
          createGetPausedExecutionUseCase({
            authorizer: { authorize },
            reader: { readDetail, list: vi.fn() },
          })
        ),
        listPausedExecutions: vi.fn(),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/resume/%E0%A4%A/execution-1', {
        headers: { cookie: 'session=valid' },
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'Validation error' })
    expect(authorize).not.toHaveBeenCalled()
    expect(readDetail).not.toHaveBeenCalled()
  })

  it('returns donor-compatible method-not-allowed without authenticating', async () => {
    const authenticator = authentication()
    const authenticate = vi.spyOn(authenticator, 'authenticate')
    const detail = vi.fn()
    const list = vi.fn()
    const application = createApiApplication({
      executionRead: createExecutionReadModule({
        authentication: authenticator,
        getPausedExecution: detail,
        listPausedExecutions: list,
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workflows/workflow-1/paused', { method: 'POST' })
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBeNull()
    expect(authenticate).not.toHaveBeenCalled()
    expect(detail).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
  })

  it('runs HEAD through GET authentication and handler semantics while stripping the body', async () => {
    let observedMethod: string | undefined
    const detail = vi.fn(async ({ request }: GetPausedExecutionHandlerInput) => {
      observedMethod = request.method
      return Response.json({ unexpected: true })
    })
    const application = createApiApplication({
      executionRead: createExecutionReadModule({
        authentication: authentication(),
        getPausedExecution: detail,
        listPausedExecutions: vi.fn(),
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/resume/workflow-1/execution-1', {
        method: 'HEAD',
        headers: { cookie: 'session=valid' },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.text()).toBe('')
    expect(detail).toHaveBeenCalledOnce()
    expect(observedMethod).toBe('HEAD')
  })

  it('returns the Next-compatible automatic OPTIONS response without authenticating', async () => {
    const authenticator = authentication()
    const authenticate = vi.spyOn(authenticator, 'authenticate')
    const detail = vi.fn()
    const list = vi.fn()
    const application = createApiApplication({
      executionRead: createExecutionReadModule({
        authentication: authenticator,
        getPausedExecution: detail,
        listPausedExecutions: list,
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workflows/workflow-1/paused', { method: 'OPTIONS' })
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
    expect(await response.text()).toBe('')
    expect(authenticate).not.toHaveBeenCalled()
    expect(detail).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
  })

  it('falls through an unrelated path without authentication', async () => {
    const authenticator = authentication()
    const authenticate = vi.spyOn(authenticator, 'authenticate')
    const detail = vi.fn()
    const list = vi.fn()
    const application = createApiApplication({
      executionRead: createExecutionReadModule({
        authentication: authenticator,
        getPausedExecution: detail,
        listPausedExecutions: list,
      }),
    })

    const response = await application.handle(
      new Request('http://api.test/api/workflows/workflow-1/runs')
    )

    expect(response.status).toBe(404)
    expect(authenticate).not.toHaveBeenCalled()
    expect(detail).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
  })
})
