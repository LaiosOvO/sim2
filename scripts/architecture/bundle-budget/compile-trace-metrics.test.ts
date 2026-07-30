import { describe, expect, it } from 'vitest'
import { summarizeCompileTrace, traceDurationToMilliseconds } from './compile-trace-metrics'

describe('summarizeCompileTrace', () => {
  it('separates the first compile per trigger from later updates', () => {
    const metrics = summarizeCompileTrace([
      { name: 'compile-path', duration: 1000, tags: { trigger: '/a' } },
      { name: 'compile-path', duration: 2000, tags: { trigger: '/b' } },
      { name: 'compile-path', duration: 300, tags: { trigger: '/a' } },
      { name: 'compile-path', duration: 500, tags: { trigger: '/b' } },
    ])

    expect(metrics).toEqual({
      first: { count: 2, totalMs: 3, maximumMs: 2, p95Ms: 2 },
      incremental: { count: 2, totalMs: 0.8, maximumMs: 0.5, p95Ms: 0.5 },
    })
    expect(metrics.first.totalMs + metrics.incremental.totalMs).toBe(3.8)
    expect(traceDurationToMilliseconds(1000)).toBe(1)
  })

  it('ignores unrelated or incomplete trace events', () => {
    expect(
      summarizeCompileTrace([{ name: 'memory-usage', duration: 1000 }, { name: 'compile-path' }])
    ).toEqual({
      first: { count: 0, totalMs: 0, maximumMs: 0, p95Ms: 0 },
      incremental: { count: 0, totalMs: 0, maximumMs: 0, p95Ms: 0 },
    })
  })

  it('treats the first route compile after each dev-server start as cold', () => {
    expect(
      summarizeCompileTrace([
        { name: 'start-dev-server' },
        { name: 'compile-path', duration: 1000, tags: { trigger: '/resume' } },
        { name: 'compile-path', duration: 200, tags: { trigger: '/resume' } },
        { name: 'start-dev-server' },
        { name: 'compile-path', duration: 1500, tags: { trigger: '/resume' } },
      ])
    ).toEqual({
      first: { count: 2, totalMs: 2.5, maximumMs: 1.5, p95Ms: 1.5 },
      incremental: { count: 1, totalMs: 0.2, maximumMs: 0.2, p95Ms: 0.2 },
    })
  })
})
