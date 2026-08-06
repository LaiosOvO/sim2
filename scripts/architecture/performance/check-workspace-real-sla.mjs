import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { journeyStatePath, repositoryRoot, storageStatePath } from './dev-performance-config.mjs'
import { summarizeSamples } from './performance-metrics.mjs'

const rounds = 3
const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for the real Workspace SLA gate')
}
if (!existsSync(storageStatePath)) {
  throw new Error(
    `Authenticated browser state is required. Run perf:dev:seed first: ${storageStatePath}`
  )
}
if (!existsSync(journeyStatePath)) {
  throw new Error(
    `Controlled workspace state is required. Run perf:dev:seed first: ${journeyStatePath}`
  )
}
if (process.env.SIM_MINIMAL_REGISTRY === '1') {
  throw new Error('The real Workspace SLA gate must run with the complete registry')
}

const journey = JSON.parse(readFileSync(journeyStatePath, 'utf8'))
if (!journey.workspaceId || !journey.workflowId) {
  throw new Error('Controlled journey state does not contain workspaceId and workflowId')
}

const checkScript = path.join(
  repositoryRoot,
  'scripts',
  'architecture',
  'performance',
  'check-workspace-vite-performance.mjs'
)
const assertionModule = path.join(repositoryRoot, 'scripts', 'runtime', 'assert-node-22.mjs')
const results = []
const limits = {
  serviceReadyMedianMs: 30_000,
  coldRouteMedianMs: 10_000,
  coldRouteMaximumMs: 15_000,
  warmReloadP95Ms: 2_000,
  criticalApiP95Ms: 1_000,
  stableRssBytes: 4 * 1024 * 1024 * 1024,
}

for (const routeKind of ['home', 'editor']) {
  for (let round = 1; round <= rounds; round += 1) {
    const port = 5270 + results.length
    const child = spawnSync(
      process.execPath,
      ['--import', pathToFileURL(assertionModule).href, checkScript],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PERF_WORKSPACE_REAL_BACKEND: '1',
          PERF_WORKSPACE_ROUTE: routeKind,
          PERF_WORKSPACE_ID: journey.workspaceId,
          PERF_WORKFLOW_ID: journey.workflowId,
          PERF_STORAGE_STATE: storageStatePath,
          PERF_WORKSPACE_VITE_URL: `http://127.0.0.1:${port}`,
        },
        maxBuffer: 10 * 1024 * 1024,
      }
    )
    const output = `${child.stdout ?? ''}\n${child.stderr ?? ''}`
    const reportMatch = output.match(/\[perf\] report=(.+)/)
    if (!reportMatch) {
      throw new Error(
        `Real SLA ${routeKind} round ${round} did not emit a report:\n${output.trim()}`
      )
    }
    const report = JSON.parse(readFileSync(reportMatch[1].trim(), 'utf8'))
    results.push({ routeKind, round, report })
    if (child.status !== 0 || report.status !== 'passed') {
      throw new Error(
        `Real SLA ${routeKind} round ${round} failed; report=${reportMatch[1].trim()}`
      )
    }
  }
}

const routeSummary = Object.fromEntries(
  ['home', 'editor'].map((routeKind) => {
    const reports = results
      .filter((result) => result.routeKind === routeKind)
      .map((result) => result.report)
    return [
      routeKind,
      {
        serviceReady: summarizeSamples(reports.map((report) => report.serviceReadyMs)),
        compilerColdUsable: summarizeSamples(reports.map((report) => report.compilerColdUsableMs)),
        coldUsable: summarizeSamples(reports.map((report) => report.coldUsableMs)),
        warmReload: summarizeSamples(reports.flatMap((report) => report.warmReload.samplesMs)),
        criticalApi: summarizeSamples(reports.flatMap((report) => report.bootstrapApi.samplesMs)),
        criticalApiStatuses: reports.flatMap((report) => report.bootstrapApi.statuses),
        viteProcessTreeRss: summarizeSamples(
          reports.map((report) => report.viteProcessTreeRssBytes)
        ),
      },
    ]
  })
)

const allReports = results.map((result) => result.report)
const serviceReady = summarizeSamples(allReports.map((report) => report.serviceReadyMs))
const sourceShas = [...new Set(allReports.map((report) => report.sourceSha))]
const checks = {
  independentColdRounds:
    results.length === rounds * 2 &&
    ['home', 'editor'].every(
      (routeKind) => results.filter((result) => result.routeKind === routeKind).length === rounds
    ),
  sourceConsistency: sourceShas.length === 1,
  nodeRuntime: allReports.every((report) => /^22\./.test(report.runtime.node)),
  serviceReadyMedian:
    serviceReady.medianMs !== null && serviceReady.medianMs <= limits.serviceReadyMedianMs,
  homeColdMedian:
    routeSummary.home.compilerColdUsable.medianMs !== null &&
    routeSummary.home.compilerColdUsable.medianMs <= limits.coldRouteMedianMs,
  homeColdMaximum:
    routeSummary.home.compilerColdUsable.maximumMs !== null &&
    routeSummary.home.compilerColdUsable.maximumMs <= limits.coldRouteMaximumMs,
  editorColdMedian:
    routeSummary.editor.compilerColdUsable.medianMs !== null &&
    routeSummary.editor.compilerColdUsable.medianMs <= limits.coldRouteMedianMs,
  editorColdMaximum:
    routeSummary.editor.compilerColdUsable.maximumMs !== null &&
    routeSummary.editor.compilerColdUsable.maximumMs <= limits.coldRouteMaximumMs,
  homeWarmP95:
    routeSummary.home.warmReload.p95Ms !== null &&
    routeSummary.home.warmReload.p95Ms <= limits.warmReloadP95Ms,
  editorWarmP95:
    routeSummary.editor.warmReload.p95Ms !== null &&
    routeSummary.editor.warmReload.p95Ms <= limits.warmReloadP95Ms,
  homeApiP95:
    routeSummary.home.criticalApi.count === rounds * 30 &&
    routeSummary.home.criticalApi.p95Ms !== null &&
    routeSummary.home.criticalApi.p95Ms <= limits.criticalApiP95Ms &&
    routeSummary.home.criticalApiStatuses.every((status) => status >= 200 && status < 300),
  editorApiP95:
    routeSummary.editor.criticalApi.count === rounds * 30 &&
    routeSummary.editor.criticalApi.p95Ms !== null &&
    routeSummary.editor.criticalApi.p95Ms <= limits.criticalApiP95Ms &&
    routeSummary.editor.criticalApiStatuses.every((status) => status >= 200 && status < 300),
  stableViteRss: allReports.every(
    (report) =>
      report.viteProcessTreeRssBytes > 0 && report.viteProcessTreeRssBytes <= limits.stableRssBytes
  ),
}
const capturedAt = new Date().toISOString()
const report = {
  schemaVersion: 1,
  capturedAt,
  sourceSha: sourceShas.length === 1 ? sourceShas[0] : null,
  sourceDirty: allReports.some((result) => result.sourceDirty),
  status: Object.values(checks).every(Boolean) ? 'passed' : 'failed',
  backendMode: 'real-database-authenticated-complete-registry',
  machine: {
    platform: process.platform,
    architecture: process.arch,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
  environment: {
    databaseConfigured: true,
    authenticatedStorageState: true,
    completeRegistry: true,
  },
  rounds,
  workspaceId: journey.workspaceId,
  workflowId: journey.workflowId,
  limits,
  checks,
  serviceReady,
  routeSummary,
  reports: results.map(({ routeKind, round, report: result }) => ({
    routeKind,
    round,
    sourceSha: result.sourceSha,
    sourceDirty: result.sourceDirty,
    serviceReadyMs: result.serviceReadyMs,
    compilerColdUsableMs: result.compilerColdUsableMs,
    coldUsableMs: result.coldUsableMs,
    warmReloadP95Ms: result.warmReload.p95Ms,
    criticalApiP95Ms: result.bootstrapApi.p95Ms,
    viteProcessTreeRssBytes: result.viteProcessTreeRssBytes,
  })),
}
const reportDirectory = path.join(repositoryRoot, '.perf', 'reports')
await mkdir(reportDirectory, { recursive: true })
const reportPath = path.join(
  reportDirectory,
  `workspace-real-sla-${capturedAt.replaceAll(/[:.]/g, '-')}.json`
)
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`[perf] report=${reportPath}\n`)
if (report.status !== 'passed') process.exitCode = 1
