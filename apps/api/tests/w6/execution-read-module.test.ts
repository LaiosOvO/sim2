import type { SessionRequestContext } from '@sim/api-contracts/auth'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { describe, expect, it, vi } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createExecutionReadModule } from '@/modules/execution/read/application/create-execution-read-module'

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
})
