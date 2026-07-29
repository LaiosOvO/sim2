import { type AppConfigTransport, createCachedAppConfigProfileReader } from '@sim/infra-appconfig'
import { describe, expect, it, vi } from 'vitest'

const identifiers = {
  application: 'sim',
  environment: 'test',
  profile: 'feature-flags',
}

describe('AppConfig profile reader', () => {
  it('shares the cold fetch and serves the warm value without another poll', async () => {
    let release: (() => void) | undefined
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const transport: AppConfigTransport = {
      startSession: vi.fn(async () => 'initial-token'),
      getLatest: vi.fn(async () => {
        await barrier
        return {
          configuration: new TextEncoder().encode('{"workspace-forking":{"enabled":true}}'),
          nextToken: 'next-token',
          nextPollIntervalSeconds: 60,
        }
      }),
    }
    const reader = createCachedAppConfigProfileReader({
      transport,
      logger: { error: vi.fn() },
    })
    const first = reader.read(identifiers, (value) => value)
    const second = reader.read(identifiers, (value) => value)
    release?.()

    await expect(first).resolves.toEqual({ 'workspace-forking': { enabled: true } })
    await expect(second).resolves.toEqual({ 'workspace-forking': { enabled: true } })
    await expect(reader.read(identifiers, (value) => value)).resolves.toEqual({
      'workspace-forking': { enabled: true },
    })
    expect(transport.startSession).toHaveBeenCalledTimes(1)
    expect(transport.getLatest).toHaveBeenCalledTimes(1)
  })

  it('retains the last good value across stale refresh and parse failure', async () => {
    let now = 0
    let calls = 0
    const logger = { error: vi.fn() }
    const reader = createCachedAppConfigProfileReader({
      ttlMs: 10,
      now: () => now,
      logger,
      transport: {
        async startSession() {
          return 'token'
        },
        async getLatest() {
          calls += 1
          return {
            configuration: new TextEncoder().encode(calls === 1 ? '{"enabled":true}' : '{invalid'),
            nextToken: 'token',
            nextPollIntervalSeconds: 0,
          }
        },
      },
    })

    await expect(reader.read(identifiers, (value) => value)).resolves.toEqual({
      enabled: true,
    })
    now = 11
    await expect(reader.read(identifiers, (value) => value)).resolves.toEqual({
      enabled: true,
    })
    await vi.waitFor(() => expect(calls).toBe(2))
    await expect(reader.read(identifiers, (value) => value)).resolves.toEqual({
      enabled: true,
    })
    expect(logger.error).toHaveBeenCalledWith(
      'AppConfig response parse failed; serving last known value',
      expect.objectContaining({ profile: 'sim/test/feature-flags' })
    )
  })

  it('returns null and backs off when the first transport call fails', async () => {
    let now = 0
    const transport: AppConfigTransport = {
      startSession: vi.fn(async () => {
        throw new Error('network unavailable')
      }),
      getLatest: vi.fn(async () => ({})),
    }
    const reader = createCachedAppConfigProfileReader({
      ttlMs: 10,
      now: () => now,
      transport,
      logger: { error: vi.fn() },
    })

    await expect(reader.read(identifiers, (value) => value)).resolves.toBeNull()
    await expect(reader.read(identifiers, (value) => value)).resolves.toBeNull()
    expect(transport.startSession).toHaveBeenCalledTimes(1)
    now = 11
    await expect(reader.read(identifiers, (value) => value)).resolves.toBeNull()
    await vi.waitFor(() => expect(transport.startSession).toHaveBeenCalledTimes(2))
  })
})
