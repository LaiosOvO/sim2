import { describe, expect, it } from 'vitest'
import {
  evaluateFullMode,
  PERFORMANCE_LIMITS,
  percentile,
  summarizeSamples,
} from './performance-metrics.mjs'

function passingRound() {
  return {
    serviceReadyMs: 1_000,
    journeys: {
      home: { coldUsableMs: 2_000, warmReloadMs: Array.from({ length: 10 }, () => 500) },
      editor: { coldUsableMs: 3_000, warmReloadMs: Array.from({ length: 10 }, () => 600) },
    },
    apiSamples: [
      { path: '/api/health', samplesMs: Array.from({ length: 30 }, () => 100) },
      { path: '/api/workspaces', samplesMs: Array.from({ length: 30 }, () => 120) },
    ],
    nextTrace: { trace: { peakRssBytes: 1024, stableRssBytes: 1024 } },
    runtimeProof: ['next', 'realtime', 'api', 'worker'].map((service) => ({
      service,
      runtime: 'node',
    })),
  }
}

describe('development performance metrics', () => {
  it('uses nearest-rank percentiles', () => {
    expect(percentile([1, 2, 3, 4, 100], 0.95)).toBe(100)
    expect(summarizeSamples([3, 1, 2]).medianMs).toBe(2)
  })

  it('passes a complete full-mode sample set under every limit', () => {
    expect(evaluateFullMode([passingRound(), passingRound(), passingRound()]).passed).toBe(true)
  })

  it('fails when a single cold route exceeds the maximum', () => {
    const round = passingRound()
    round.journeys.editor.coldUsableMs = PERFORMANCE_LIMITS.coldRouteMaximumMs + 1
    const result = evaluateFullMode([passingRound(), passingRound(), round])
    expect(result.checks.editorColdMaximum).toBe(false)
    expect(result.passed).toBe(false)
  })

  it('checks stable RSS without treating a transient compile peak as stable usage', () => {
    const round = passingRound()
    round.nextTrace.trace.peakRssBytes = PERFORMANCE_LIMITS.stableRssBytes + 1
    const result = evaluateFullMode([passingRound(), passingRound(), round])
    expect(result.checks.stableRss).toBe(true)
    expect(result.passed).toBe(true)
  })
})
