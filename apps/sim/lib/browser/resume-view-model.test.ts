import { describe, expect, it } from 'vitest'
import { asJsonObject, pauseResponseData, submittedResumeValues } from './resume-view-model'

describe('resume view-model JSON projection', () => {
  it('accepts only non-array JSON objects', () => {
    expect(asJsonObject({ operation: 'human' })).toEqual({ operation: 'human' })
    expect(asJsonObject(null)).toBeNull()
    expect(asJsonObject('human')).toBeNull()
    expect(asJsonObject(['human'])).toBeNull()
  })

  it('preserves raw response data while exposing a safe object view', () => {
    expect(pauseResponseData({ data: { operation: 'human' } })).toEqual({
      raw: { operation: 'human' },
      object: { operation: 'human' },
    })
    expect(pauseResponseData({ data: 'free-form input' })).toEqual({
      raw: 'free-form input',
      object: {},
    })
    expect(pauseResponseData('historical primitive')).toEqual({ raw: undefined, object: {} })
  })

  it('prefers a submitted form object and otherwise falls back safely', () => {
    expect(
      submittedResumeValues({
        submission: { approved: true },
        transportMetadata: 'ignored',
      })
    ).toEqual({ approved: true })
    expect(submittedResumeValues({ submission: 'legacy', approved: false })).toEqual({
      submission: 'legacy',
      approved: false,
    })
    expect(submittedResumeValues(['invalid'])).toEqual({})
  })
})
