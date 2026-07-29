import { describe, expect, it } from 'vitest'
import { apiErrorEnvelopeSchema } from '../src/errors'
import { pageRequestSchema } from '../src/pagination'
import { traceContextSchema } from '../src/tracing'

describe('API contract compatibility', () => {
  it('accepts omitted and nullable error details', () => {
    const withoutDetails = apiErrorEnvelopeSchema.parse({
      contractVersion: 1,
      error: {
        code: 'not_found',
        message: 'Missing',
        status: 404,
        retryable: false,
      },
    })
    const nullDetails = apiErrorEnvelopeSchema.parse({
      ...withoutDetails,
      error: { ...withoutDetails.error, details: null },
    })

    expect(withoutDetails.error.details).toBeUndefined()
    expect(nullDetails.error.details).toBeNull()
  })

  it('strips additive unknown fields while preserving known wire fields', () => {
    const parsed = traceContextSchema.parse({
      traceId: '1'.repeat(32),
      spanId: '2'.repeat(16),
      traceFlags: '01',
      correlationId: 'request-1',
      futureField: 'safe-to-ignore',
    })

    expect(parsed).not.toHaveProperty('futureField')
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed)
  })

  it('applies a bounded default page size', () => {
    expect(pageRequestSchema.parse({})).toEqual({ limit: 50 })
    expect(() => pageRequestSchema.parse({ limit: 201 })).toThrow()
  })
})
