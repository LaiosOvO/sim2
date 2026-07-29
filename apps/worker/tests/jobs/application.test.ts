import { describe, expect, it } from 'vitest'
import { createWorkerApplication } from '@/bootstrap/application/create-worker-application'

describe('Worker application interface', () => {
  it('owns its lifecycle state', async () => {
    const application = createWorkerApplication()

    expect(application.status()).toBe('idle')
    await application.start()
    expect(application.status()).toBe('running')
    await application.stop()
    expect(application.status()).toBe('stopped')
    await expect(application.start()).rejects.toThrow('cannot be restarted')
  })
})
