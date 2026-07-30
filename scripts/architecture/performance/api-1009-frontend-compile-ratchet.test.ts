import { describe, expect, it } from 'vitest'
import { compileBudgetFailures } from './api-1009-frontend-compile-ratchet'

describe('API-1009 frontend compile ratchet', () => {
  it('rejects cold and incremental compile regressions independently', () => {
    expect(
      compileBudgetFailures(
        {
          cold: { durationMs: 10_001, sourceSha256: 'cold' },
          incremental: { durationMs: 1_001, sourceSha256: 'incremental' },
        },
        {
          coldCompileMs: 10_000,
          incrementalCompileMs: 1_000,
        }
      )
    ).toEqual([
      'cold compile 10001 ms exceeds 10000 ms',
      'incremental compile 1001 ms exceeds 1000 ms',
    ])
  })

  it('accepts samples at the committed ceilings', () => {
    expect(
      compileBudgetFailures(
        {
          cold: { durationMs: 10_000, sourceSha256: 'cold' },
          incremental: { durationMs: 1_000, sourceSha256: 'incremental' },
        },
        {
          coldCompileMs: 10_000,
          incrementalCompileMs: 1_000,
        }
      )
    ).toEqual([])
  })
})
