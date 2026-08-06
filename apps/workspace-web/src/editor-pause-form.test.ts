import { describe, expect, it } from 'vitest'
import { normalizePauseInputFields, preparePauseSubmission } from './editor-pause-form'

describe('structured pause form', () => {
  it('normalizes user-defined fields and primitive options', () => {
    expect(
      normalizePauseInputFields([
        { name: 'decision', label: 'Decision', required: true, options: ['approve', 'reject'] },
        { name: 'count', type: 'number' },
        { name: '' },
      ])
    ).toEqual([
      {
        name: 'decision',
        label: 'Decision',
        type: 'string',
        required: true,
        options: [
          { label: 'approve', value: 'approve' },
          { label: 'reject', value: 'reject' },
        ],
      },
      { name: 'count', label: 'count', type: 'number', required: false },
    ])
  })

  it('builds typed submissions and rejects invalid required JSON', () => {
    const fields = normalizePauseInputFields([
      { name: 'approved', type: 'boolean', required: true },
      { name: 'score', type: 'number', required: true },
      { name: 'metadata', type: 'object', required: true },
    ])
    expect(
      preparePauseSubmission(fields, {
        approved: 'true',
        score: '9.5',
        metadata: '{',
      })
    ).toEqual({
      errors: { metadata: 'Enter valid JSON.' },
      submission: { approved: true, score: 9.5 },
    })
  })
})
