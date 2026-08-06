/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest'
import {
  initialStructuredRows,
  normalizeStructuredRows,
  parseStructuredRows,
  serializeStructuredRows,
} from './editor-structured-field'

describe('workspace Vite structured editor fields', () => {
  it('keeps array-backed field contracts as arrays', () => {
    const rows = [{ id: 'one', name: 'customerId', type: 'string', value: '' }]
    expect(serializeStructuredRows('input-format', rows)).toEqual(rows)
    expect(parseStructuredRows(rows)).toEqual(rows)
  })

  it('keeps legacy condition and knowledge field contracts as JSON strings', () => {
    const rows = [{ id: 'if', title: 'if', value: '<start.input>' }]
    const serialized = serializeStructuredRows('condition-input', rows)
    expect(typeof serialized).toBe('string')
    expect(parseStructuredRows(serialized)).toMatchObject([rows[0], { title: 'else', value: '' }])
    expect(serializeStructuredRows('knowledge-tag-filters', rows)).toBe(JSON.stringify(rows))
  })

  it('does not reinterpret malformed or non-array values', () => {
    expect(parseStructuredRows('{bad')).toEqual([])
    expect(parseStructuredRows({ key: 'value' })).toEqual([])
  })

  it('initializes and preserves the required condition branch contract', () => {
    const initial = initialStructuredRows('condition-input')
    expect(initial).toHaveLength(2)
    expect(initial.map((row) => row.title)).toEqual(['if', 'else'])
    expect(initial.every((row) => row.activeSourceBlockId === null)).toBe(true)

    const normalized = normalizeStructuredRows('condition-input', [
      { id: 'one', title: 'custom', value: '' },
      { id: 'two', title: 'custom', value: '' },
      { id: 'three', title: 'custom', value: '' },
    ])
    expect(normalized.map((row) => row.title)).toEqual(['if', 'else if', 'else'])
    expect(normalizeStructuredRows('condition-input', [])).toHaveLength(2)
    expect(normalizeStructuredRows('router-input', [])).toHaveLength(1)
  })
})
