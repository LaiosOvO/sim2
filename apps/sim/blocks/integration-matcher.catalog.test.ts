/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const { FakeIcon } = vi.hoisted(() => ({
  FakeIcon: () => null,
}))

vi.mock('@/lib/integrations/icon-mapping', () => ({
  blockTypeToIconMap: new Proxy(
    {},
    {
      get: () => FakeIcon,
    }
  ),
}))

import type { BlockVisibilityState } from '@/lib/core/config/block-visibility'
import { getIntegrationMatcher, listIntegrations } from '@/blocks/integration-matcher'
import { invalidateBlockCaches, registerBlockVisibilityResolver } from '@/blocks/visibility/context'

function visibility(disabled: string[] = []): BlockVisibilityState {
  return {
    revealed: new Set(),
    disabled: new Set(disabled),
    previewTagged: new Set(),
  }
}

afterEach(() => {
  registerBlockVisibilityResolver(null)
  invalidateBlockCaches()
})

describe('generated catalog integration matcher', () => {
  it('preserves visible Slack metadata without importing Block Registry', () => {
    const slack = listIntegrations().find((integration) => integration.blockType === 'slack')

    expect(slack).toMatchObject({
      name: 'Slack',
      bgColor: '#611f69',
      icon: FakeIcon,
    })
    expect(getIntegrationMatcher().byName.get('slack')).toEqual(slack)
  })

  it('retains per-viewer kill-switch projection', () => {
    registerBlockVisibilityResolver({ current: () => visibility(['slack']) })
    invalidateBlockCaches()

    expect(listIntegrations().some((integration) => integration.blockType === 'slack')).toBe(false)
  })
})
