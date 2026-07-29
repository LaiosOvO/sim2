import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { createRequestAuthenticator } from '@sim/auth/request-context'
import { afterEach, describe, expect, it } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { createHttpServer } from '@/bootstrap/lifecycle/create-http-server'
import { createEnvironmentModule } from '@/modules/environment/application/create-environment-module'

describe('W1 HTTP server integration', () => {
  const servers: ReturnType<typeof createHttpServer>[] = []

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve())
          })
      )
    )
  })

  it('serves health and forwards a JSON POST body to the application', async () => {
    let saved: Record<string, string> | undefined
    const environment = createEnvironmentModule({
      authentication: createRequestAuthenticator({
        sessions: {
          async verify() {
            return {
              verified: true,
              credential: {
                actor: { id: 'user-1', type: 'user', name: null, email: null },
                activeOrganizationId: null,
              },
            }
          },
        },
      }),
      repository: {
        async getEncryptedVariables() {
          return saved
        },
        async upsertEncryptedVariables(_userId, variables) {
          saved = variables
        },
      },
      cipher: {
        async encrypt(value) {
          return `encrypted:${value}`
        },
        async decrypt(value) {
          return value.replace('encrypted:', '')
        },
      },
      credentials: { async synchronize() {} },
      audit: { updated() {} },
      events: { updated() {} },
    })
    const server = createHttpServer(
      createApiApplication({
        now: () => new Date('2026-07-30T00:00:00.000Z'),
        environment,
      })
    )
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${address.port}`

    const health = await fetch(`${baseUrl}/api/health`)
    expect(health.status).toBe(200)

    const save = await fetch(`${baseUrl}/api/environment`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=valid',
      },
      body: JSON.stringify({ variables: { KEY: 'value' } }),
    })
    expect(save.status).toBe(200)
    expect(saved).toEqual({ KEY: 'encrypted:value' })
  })
})
