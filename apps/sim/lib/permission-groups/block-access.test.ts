/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { isBlockTypeAccessControlExempt } from '@/lib/permission-groups/block-access'

describe('block access metadata boundary', () => {
  it('uses catalog visibility without loading the Runtime Registry', () => {
    expect(isBlockTypeAccessControlExempt('start_trigger')).toBe(true)
    expect(isBlockTypeAccessControlExempt('api_trigger')).toBe(true)
    expect(isBlockTypeAccessControlExempt('agent')).toBe(false)
    expect(isBlockTypeAccessControlExempt('missing_block')).toBe(false)
  })
})
