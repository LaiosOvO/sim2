import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { sandboxTestJobPayloadV1Schema } from '@sim/execution-contracts/job-control'
import { afterEach, describe, expect, it } from 'vitest'
import { createSandboxHttpServer } from '@/http/create-sandbox-http-server'
import { createHttpSandbox } from '@/sandbox/http/create-http-sandbox'
import { createRestrictedTestSandbox } from '@/sandbox/restricted-test/create-restricted-test-sandbox'

describe('independently deployable Sandbox role', () => {
  const cleanup: Array<() => Promise<void>> = []

  afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((close) => close()))
  })

  it('serves health and executes through the HTTP Sandbox adapter', async () => {
    const server = createSandboxHttpServer({
      sandbox: createRestrictedTestSandbox(),
      internalToken: 'sandbox-test-token',
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())))
    const { port } = server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${port}`
    const sandbox = createHttpSandbox({
      baseUrl,
      internalToken: 'sandbox-test-token',
    })

    expect((await fetch(`${baseUrl}/internal/live`)).status).toBe(200)
    await expect(sandbox.health()).resolves.toBe(true)
    await expect(
      sandbox.execute({
        executionId: 'execution-http-sandbox',
        attempt: 1,
        payload: sandboxTestJobPayloadV1Schema.parse({
          contractVersion: 1,
          type: 'sandbox-test',
          operation: 'echo',
          input: { remote: true },
          policy: {
            contractVersion: 1,
            network: 'deny',
            filesystem: {
              mode: 'ephemeral',
              readOnlyMounts: [],
              writableRoot: '/tmp/job',
            },
            cpuTimeMs: 100,
            memoryMiB: 32,
            wallClockMs: 1_000,
            maxInputBytes: 1_024,
            secrets: {
              mode: 'references-only',
              credentialRefs: [],
            },
          },
        }),
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({
      contractVersion: 1,
      executionId: 'execution-http-sandbox',
      output: { remote: true },
    })
  })
})
