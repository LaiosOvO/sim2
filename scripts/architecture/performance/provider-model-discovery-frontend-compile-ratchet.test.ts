import { describe, expect, it } from 'vitest'
import { compileBudgetFailures } from './provider-model-discovery-frontend-compile-ratchet'

describe('provider model discovery frontend compile ratchet', () => {
  it('rejects cold and incremental regressions independently', () => {
    expect(
      compileBudgetFailures(
        {
          cold: { durationMs: 2500.1, sourceSha256: 'cold' },
          incremental: { durationMs: 750.1, sourceSha256: 'incremental' },
        },
        {
          coldCompileMs: 2500,
          incrementalCompileMs: 750,
        }
      )
    ).toEqual([
      'cold compile 2500.1 ms exceeds 2500 ms',
      'incremental compile 750.1 ms exceeds 750 ms',
    ])
  })

  it('accepts samples at the committed ceilings', () => {
    expect(
      compileBudgetFailures(
        {
          cold: { durationMs: 2500, sourceSha256: 'cold' },
          incremental: { durationMs: 750, sourceSha256: 'incremental' },
        },
        {
          coldCompileMs: 2500,
          incrementalCompileMs: 750,
        }
      )
    ).toEqual([])
  })
})
