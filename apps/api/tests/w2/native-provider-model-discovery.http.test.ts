import { createServer as createHttpServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHttpProviderModelSource } from '@/infrastructure/http/http-provider-model-source'

describe('HTTP provider model source integration', () => {
  let server: Server
  let origin = ''
  const hits = new Map<string, number>()
  const authorizations = new Map<string, string | undefined>()

  beforeAll(async () => {
    server = createHttpServer((request, response) => {
      const path = request.url ?? '/'
      hits.set(path, (hits.get(path) ?? 0) + 1)
      authorizations.set(path, request.headers.authorization)

      if (path === '/oversized') {
        const body = JSON.stringify({ data: [{ id: 'x'.repeat(1_100) }] })
        response.writeHead(200, {
          'content-length': Buffer.byteLength(body),
          'content-type': 'application/json',
        })
        response.end(body)
        return
      }
      if (path === '/slow') {
        setTimeout(() => {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ data: [{ id: 'too-late' }] }))
        }, 200)
        return
      }
      if (path === '/failure') {
        response.writeHead(503, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ token: 'must-not-cross-the-port' }))
        return
      }

      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [{ id: path.slice(1) }] }))
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address() as AddressInfo
    origin = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('caches only secret-free provider requests for the donor TTL', async () => {
    let now = 1_000
    const source = createHttpProviderModelSource({
      endpointOverrides: { ollama: `${origin}/ollama` },
      now: () => now,
    })

    expect(await source.read({ provider: 'ollama' })).toEqual({
      data: [{ id: 'ollama' }],
    })
    expect(await source.read({ provider: 'ollama' })).toEqual({
      data: [{ id: 'ollama' }],
    })
    expect(hits.get('/ollama')).toBe(1)

    now += 60_001
    await source.read({ provider: 'ollama' })
    expect(hits.get('/ollama')).toBe(2)
    expect(authorizations.get('/ollama')).toBeUndefined()
  })

  it.each(['litellm', 'vllm'] as const)(
    'preserves the donor %s TTL with a process-level environment credential',
    async (provider) => {
      let now = 1_000
      const path = `/${provider}`
      const source = createHttpProviderModelSource({
        endpointOverrides: { [provider]: `${origin}${path}` },
        now: () => now,
      })

      await source.read({ apiKey: 'environment-secret', provider })
      await source.read({ apiKey: 'environment-secret', provider })

      expect(hits.get(path)).toBe(1)
      expect(authorizations.get(path)).toBe('Bearer environment-secret')

      now += 60_001
      await source.read({ apiKey: 'environment-secret', provider })
      expect(hits.get(path)).toBe(2)
    }
  )

  it('keeps donor no-store semantics for workspace-credential providers', async () => {
    const source = createHttpProviderModelSource({
      endpointOverrides: { baseten: `${origin}/baseten` },
    })

    await source.read({ apiKey: 'workspace-secret', provider: 'baseten' })
    await source.read({ apiKey: 'workspace-secret', provider: 'baseten' })

    expect(hits.get('/baseten')).toBe(2)
    expect(authorizations.get('/baseten')).toBe('Bearer workspace-secret')
  })

  it('folds oversized, timed-out, and non-success responses to null', async () => {
    const source = createHttpProviderModelSource({
      endpointOverrides: {
        litellm: `${origin}/oversized`,
        openrouter: `${origin}/failure`,
        vllm: `${origin}/slow`,
      },
      maxResponseBytes: 1_024,
      timeoutMs: 100,
    })

    expect(await source.read({ provider: 'litellm' })).toBeNull()
    expect(await source.read({ provider: 'openrouter' })).toBeNull()
    expect(await source.read({ provider: 'vllm' })).toBeNull()
  })

  it('folds invalid optional endpoint configuration without failing composition', async () => {
    const fetcher = vi.fn()
    const source = createHttpProviderModelSource({
      endpointOverrides: { vllm: 'file:///tmp/models.json' },
      fetcher: fetcher as typeof fetch,
    })

    await expect(source.read({ provider: 'vllm' })).resolves.toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
