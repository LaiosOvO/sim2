import { describe, expect, it } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'

describe('API application interface', () => {
  it('returns a stable not-found envelope for an unregistered route', async () => {
    const application = createApiApplication({ serviceName: 'test-api' })
    const response = await application.handle(new Request('http://localhost/unregistered'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'not_found',
      service: 'test-api',
    })
  })
})
