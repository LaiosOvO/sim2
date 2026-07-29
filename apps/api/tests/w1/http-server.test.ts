import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
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
      sessions: {
        async resolve() {
          return { id: 'user-1', name: null, email: null }
        },
      },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ variables: { KEY: 'value' } }),
    })
    expect(save.status).toBe(200)
    expect(saved).toEqual({ KEY: 'encrypted:value' })
  })
})
