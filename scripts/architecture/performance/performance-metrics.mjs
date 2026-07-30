export const PERFORMANCE_LIMITS = {
  serviceReadyMedianMs: 30_000,
  coldRouteMedianMs: 10_000,
  coldRouteMaximumMs: 15_000,
  warmReloadP95Ms: 2_000,
  apiP95Ms: 1_000,
  stableRssBytes: 4 * 1024 * 1024 * 1024,
}

export function percentile(samples, value) {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)]
}

export function summarizeSamples(samples) {
  return {
    count: samples.length,
    minimumMs: samples.length === 0 ? null : Math.min(...samples),
    medianMs: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    maximumMs: samples.length === 0 ? null : Math.max(...samples),
    samplesMs: samples,
  }
}

export function evaluateFullMode(rounds) {
  const startup = summarizeSamples(rounds.map((round) => round.serviceReadyMs))
  const homeCold = summarizeSamples(rounds.map((round) => round.journeys.home.coldUsableMs))
  const editorCold = summarizeSamples(rounds.map((round) => round.journeys.editor.coldUsableMs))
  const homeWarm = summarizeSamples(rounds.flatMap((round) => round.journeys.home.warmReloadMs))
  const editorWarm = summarizeSamples(rounds.flatMap((round) => round.journeys.editor.warmReloadMs))
  const apiGroups = new Map()

  for (const round of rounds) {
    for (const sample of round.apiSamples) {
      const samples = apiGroups.get(sample.path) ?? []
      samples.push(...sample.samplesMs)
      apiGroups.set(sample.path, samples)
    }
  }

  const api = Object.fromEntries(
    [...apiGroups.entries()].map(([path, samples]) => [path, summarizeSamples(samples)])
  )
  const rssBytes = rounds.map((round) => round.nextTrace?.trace?.peakRssBytes ?? 0)
  const rssCaptured = rssBytes.length > 0 && rssBytes.every((value) => value > 0)
  const maximumRssBytes = rssCaptured ? Math.max(...rssBytes) : null
  const memoryThresholdRestarts = rounds.reduce(
    (total, round) => total + (round.nextTrace?.trace?.memoryThresholdRestarts ?? 0),
    0
  )
  const runtimeProofPassed = rounds.every((round) =>
    ['next', 'realtime', 'api', 'worker'].every((service) =>
      round.runtimeProof.some((proof) => proof.service === service && proof.runtime === 'node')
    )
  )

  const checks = {
    independentColdRounds: rounds.length >= 3,
    serviceReadyMedian:
      startup.medianMs !== null && startup.medianMs <= PERFORMANCE_LIMITS.serviceReadyMedianMs,
    homeColdMedian:
      homeCold.medianMs !== null && homeCold.medianMs <= PERFORMANCE_LIMITS.coldRouteMedianMs,
    homeColdMaximum:
      homeCold.maximumMs !== null && homeCold.maximumMs <= PERFORMANCE_LIMITS.coldRouteMaximumMs,
    editorColdMedian:
      editorCold.medianMs !== null && editorCold.medianMs <= PERFORMANCE_LIMITS.coldRouteMedianMs,
    editorColdMaximum:
      editorCold.maximumMs !== null &&
      editorCold.maximumMs <= PERFORMANCE_LIMITS.coldRouteMaximumMs,
    homeWarmP95:
      homeWarm.count >= rounds.length * 10 &&
      homeWarm.p95Ms !== null &&
      homeWarm.p95Ms <= PERFORMANCE_LIMITS.warmReloadP95Ms,
    editorWarmP95:
      editorWarm.count >= rounds.length * 10 &&
      editorWarm.p95Ms !== null &&
      editorWarm.p95Ms <= PERFORMANCE_LIMITS.warmReloadP95Ms,
    apiP95:
      Object.keys(api).length > 1 &&
      Object.values(api).every(
        (summary) =>
          summary.count >= rounds.length * 30 &&
          summary.p95Ms !== null &&
          summary.p95Ms <= PERFORMANCE_LIMITS.apiP95Ms
      ),
    stableRss:
      maximumRssBytes !== null &&
      maximumRssBytes <= PERFORMANCE_LIMITS.stableRssBytes &&
      memoryThresholdRestarts === 0,
    runtimeProof: runtimeProofPassed,
  }

  return {
    passed: Object.values(checks).every(Boolean),
    limits: PERFORMANCE_LIMITS,
    checks,
    startup,
    routes: {
      home: { cold: homeCold, warm: homeWarm },
      editor: { cold: editorCold, warm: editorWarm },
    },
    api,
    maximumRssBytes,
    memoryThresholdRestarts,
  }
}
