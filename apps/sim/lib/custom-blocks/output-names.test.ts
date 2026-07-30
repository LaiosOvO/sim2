import { describe, expect, it } from 'vitest'
import {
  isReservedCustomBlockOutputName,
  RESERVED_CUSTOM_BLOCK_OUTPUT_NAMES,
} from '@/lib/custom-blocks/output-names'

describe('custom-block output names', () => {
  it.each(['success', 'error', 'cost', ' Success ', 'COST'])(
    'rejects the system-projected name %s',
    (name) => {
      expect(isReservedCustomBlockOutputName(name)).toBe(true)
    }
  )

  it.each(['result', 'summary', 'cost_2'])('allows the user-defined name %s', (name) => {
    expect(isReservedCustomBlockOutputName(name)).toBe(false)
  })

  it('keeps the exported set aligned with the validator', () => {
    expect([...RESERVED_CUSTOM_BLOCK_OUTPUT_NAMES]).toEqual(['success', 'error', 'cost'])
  })
})
