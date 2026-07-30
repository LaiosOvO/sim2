import { describe, expect, it, vi } from 'vitest'
import { createAppConfigCustomBlockPolicy } from '@/infrastructure/appconfig/appconfig-custom-block-policy'

describe('W5 custom-block AppConfig policy adapter', () => {
  it('uses explicit self-hosted fallbacks without reading remote profiles', async () => {
    const profiles = { read: vi.fn() }
    const policy = createAppConfigCustomBlockPolicy({
      profiles,
      deployAsBlockFallback: true,
      previewBlocksFallback: ['preview-a'],
    })
    await expect(
      policy.feature.isEnabled({
        userId: 'user-1',
        organizationId: 'org-1',
        isPlatformAdmin: false,
      })
    ).resolves.toBe(true)
    await expect(
      policy.visibility.read({
        userId: 'user-1',
        organizationId: 'org-1',
        isPlatformAdmin: false,
      })
    ).resolves.toEqual({
      revealed: ['preview-a'],
      disabled: [],
      previewTagged: ['preview-a'],
    })
    expect(profiles.read).not.toHaveBeenCalled()
  })

  it('preserves global, org, user, and admin rollout clauses', async () => {
    const profiles = {
      read: vi.fn(async (_ids, parse) =>
        parse({
          'deploy-as-block': {
            enabled: false,
            orgIds: ['org-target'],
            userIds: ['user-target'],
            adminEnabled: true,
          },
        })
      ),
    }
    const policy = createAppConfigCustomBlockPolicy({
      profiles,
      identifiers: { application: 'app', environment: 'env' },
      deployAsBlockFallback: false,
      previewBlocksFallback: [],
    })
    await expect(
      policy.feature.isEnabled({
        userId: 'other',
        organizationId: 'org-target',
        isPlatformAdmin: false,
      })
    ).resolves.toBe(true)
    await expect(
      policy.feature.isEnabled({
        userId: 'other',
        organizationId: 'other',
        isPlatformAdmin: true,
      })
    ).resolves.toBe(true)
  })

  it('resolves platform-admin status only for an unmatched admin clause', async () => {
    const platformAdmins = { isPlatformAdmin: vi.fn(async () => true) }
    const profiles = {
      read: vi.fn(async (_ids, parse) =>
        parse({
          'deploy-as-block': { userIds: ['direct-user'], adminEnabled: true },
        })
      ),
    }
    const policy = createAppConfigCustomBlockPolicy({
      profiles,
      identifiers: { application: 'app', environment: 'env' },
      deployAsBlockFallback: false,
      previewBlocksFallback: [],
      platformAdmins,
    })
    await expect(
      policy.feature.isEnabled({
        userId: 'direct-user',
        organizationId: 'org-1',
      })
    ).resolves.toBe(true)
    expect(platformAdmins.isPlatformAdmin).not.toHaveBeenCalled()
    await expect(
      policy.feature.isEnabled({
        userId: 'admin-user',
        organizationId: 'org-1',
      })
    ).resolves.toBe(true)
    expect(platformAdmins.isPlatformAdmin).toHaveBeenCalledOnce()
  })

  it('drops custom-block keys from visibility and classifies preview tags', async () => {
    const profiles = {
      read: vi.fn(async (_ids, parse) =>
        parse({
          shipped: { enabled: true },
          preview: { userIds: ['user-1'] },
          hidden: { enabled: false },
          custom_block_foreign: { enabled: false },
        })
      ),
    }
    const policy = createAppConfigCustomBlockPolicy({
      profiles,
      identifiers: { application: 'app', environment: 'env' },
      deployAsBlockFallback: false,
      previewBlocksFallback: [],
    })
    await expect(
      policy.visibility.read({
        userId: 'user-1',
        organizationId: 'org-1',
        isPlatformAdmin: false,
      })
    ).resolves.toEqual({
      revealed: ['shipped', 'preview'],
      disabled: ['hidden'],
      previewTagged: ['preview'],
    })
  })

  it('fails back to the declared env policy when AppConfig has no value', async () => {
    const policy = createAppConfigCustomBlockPolicy({
      profiles: { read: vi.fn(async () => null) },
      identifiers: { application: 'app', environment: 'env' },
      deployAsBlockFallback: true,
      previewBlocksFallback: [],
    })
    await expect(
      policy.feature.isEnabled({
        userId: 'user-1',
        organizationId: 'org-1',
        isPlatformAdmin: false,
      })
    ).resolves.toBe(true)
  })
})
