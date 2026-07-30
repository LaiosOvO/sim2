import { describe, expect, it } from 'vitest'
import { CUSTOM_BLOCK_TYPE_PREFIX, isCustomBlockType } from '@/lib/custom-blocks/metadata'

describe('custom-block metadata identity', () => {
  it('recognizes only the stable custom-block prefix', () => {
    expect(isCustomBlockType(`${CUSTOM_BLOCK_TYPE_PREFIX}abc`)).toBe(true)
    expect(isCustomBlockType('agent')).toBe(false)
    expect(isCustomBlockType('custom-block-abc')).toBe(false)
  })

  it('rejects absent block types', () => {
    expect(isCustomBlockType(undefined)).toBe(false)
    expect(isCustomBlockType(null)).toBe(false)
  })
})
