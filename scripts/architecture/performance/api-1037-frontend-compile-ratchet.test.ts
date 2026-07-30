import { describe, expect, it } from 'vitest'
import { compileBudgetFailures } from './api-1037-frontend-compile-ratchet'

describe('API-1037 frontend compile ratchet', () => {
  it('rejects cold and incremental regressions independently', () => {
    expect(
      compileBudgetFailures(
        {
          cold: { durationMs: 5_001, sourceSha256: 'cold' },
          incremental: { durationMs: 1_001, sourceSha256: 'incremental' },
        },
        {
          coldCompileMs: 5_000,
          incrementalCompileMs: 1_000,
        }
      )
    ).toEqual([
      'cold compile 5001 ms exceeds 5000 ms',
      'incremental compile 1001 ms exceeds 1000 ms',
    ])
  })

  it('accepts samples at the committed ceilings', () => {
    expect(
      compileBudgetFailures(
        {
          cold: { durationMs: 5_000, sourceSha256: 'cold' },
          incremental: { durationMs: 1_000, sourceSha256: 'incremental' },
        },
        {
          coldCompileMs: 5_000,
          incrementalCompileMs: 1_000,
        }
      )
    ).toEqual([])
  })
})
