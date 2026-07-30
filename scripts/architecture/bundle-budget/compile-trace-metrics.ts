export interface CompileTraceEvent {
  name?: string
  duration?: number
  tags?: Record<string, string>
}

export interface CompilePhaseMetrics {
  count: number
  totalMs: number
  maximumMs: number
  p95Ms: number
}

export interface CompileTraceMetrics {
  first: CompilePhaseMetrics
  incremental: CompilePhaseMetrics
}

export const NEXT_TRACE_DURATION_UNITS_PER_MILLISECOND = 1000

export function traceDurationToMilliseconds(
  duration: number,
  durationUnitsPerMillisecond = NEXT_TRACE_DURATION_UNITS_PER_MILLISECOND
): number {
  return duration / durationUnitsPerMillisecond
}

function summarize(durations: number[]): CompilePhaseMetrics {
  const sorted = [...durations].sort((left, right) => left - right)
  const totalMs = durations.reduce((total, duration) => total + duration, 0)
  const percentileIndex = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  return {
    count: durations.length,
    totalMs: Math.round(totalMs * 10) / 10,
    maximumMs: Math.round((sorted.at(-1) ?? 0) * 10) / 10,
    p95Ms: Math.round((sorted[percentileIndex] ?? 0) * 10) / 10,
  }
}

/**
 * Treats the first compile-path event for each route trigger as cold and every
 * later event for the same trigger as incremental.
 */
export function summarizeCompileTrace(
  events: readonly CompileTraceEvent[],
  durationUnitsPerMillisecond = NEXT_TRACE_DURATION_UNITS_PER_MILLISECOND
): CompileTraceMetrics {
  const seenTriggers = new Set<string>()
  const first: number[] = []
  const incremental: number[] = []

  for (const event of events) {
    if (event.name === 'start-dev-server') {
      seenTriggers.clear()
      continue
    }
    if (event.name !== 'compile-path' || typeof event.duration !== 'number') continue
    const trigger = event.tags?.trigger ?? 'unknown'
    const durationMs = traceDurationToMilliseconds(event.duration, durationUnitsPerMillisecond)
    if (seenTriggers.has(trigger)) {
      incremental.push(durationMs)
    } else {
      seenTriggers.add(trigger)
      first.push(durationMs)
    }
  }
  return {
    first: summarize(first),
    incremental: summarize(incremental),
  }
}
