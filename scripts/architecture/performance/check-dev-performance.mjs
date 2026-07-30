import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { access, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import {
  ensurePerformanceDirectories,
  performanceDirectory,
  readJourneyConfig,
  repositoryRoot,
  storageStatePath,
} from './dev-performance-config.mjs'
import { evaluateFullMode, summarizeSamples } from './performance-metrics.mjs'

const MODE_SCRIPTS = {
  full: 'dev:full',
  minimal: 'dev:full:minimal-registry',
  webpack: 'dev:full:webpack',
}
const REQUIRED_RUNTIME_SERVICES = ['next', 'realtime', 'api', 'worker']
const RUNTIME_PATTERN = /\[runtime\] service=(\S+) runtime=(\S+) version=(\S+) execPath=([^\r\n]+)/

function run(command, args) {
  return spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
}

function commandOutput(command, args) {
  const result = run(command, args)
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  }
  return result.stdout.trim()
}

function parseRuntimeProof(log) {
  const proofs = new Map()
  for (const line of log.split(/\r?\n/)) {
    const match = line.match(RUNTIME_PATTERN)
    if (!match) continue
    proofs.set(match[1], {
      service: match[1],
      runtime: match[2],
      version: match[3],
      execPath: match[4].trim(),
    })
  }
  return [...proofs.values()]
}

async function waitForHealth(baseUrl, child, timeoutMs = 120_000) {
  const startedAt = performance.now()
  let lastStatus = 'no response'
  while (performance.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`development process exited with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(2_000),
      })
      lastStatus = `HTTP ${response.status}`
      if (response.ok) return Math.round(performance.now() - startedAt)
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error)
    }
    await delay(250)
  }
  throw new Error(`health check did not become ready within ${timeoutMs} ms (${lastStatus})`)
}

async function stopProcessTree(child) {
  if (child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(5_000)])
    return
  }

  child.kill('SIGTERM')
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(5_000)])
  if (child.exitCode !== null) return

  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

function attachWaterfall(page, baseUrl, phaseRef, samples) {
  const starts = new Map()
  page.on('request', (request) => {
    starts.set(request, performance.now())
  })
  page.on('response', (response) => {
    const request = response.request()
    const startedAt = starts.get(request) ?? performance.now()
    void response.finished().then(() => {
      const url = new URL(response.url())
      if (url.origin !== baseUrl || !url.pathname.startsWith('/api/')) return
      samples.push({
        phase: phaseRef.value,
        method: request.method(),
        path: `${url.pathname}${url.search}`,
        resourceType: request.resourceType(),
        status: response.status(),
        durationMs: Math.round(performance.now() - startedAt),
      })
    })
  })
}

async function waitForUsable(page, selector) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 60_000 })
}

async function measureRoute(context, baseUrl, pathName, selector, warmReloads) {
  const page = await context.newPage()
  const waterfall = []
  const phaseRef = { value: 'cold' }
  attachWaterfall(page, baseUrl, phaseRef, waterfall)

  const coldStartedAt = performance.now()
  await page.goto(`${baseUrl}${pathName}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await waitForUsable(page, selector)
  const coldUsableMs = Math.round(performance.now() - coldStartedAt)
  if (new URL(page.url()).pathname.startsWith('/login')) {
    throw new Error(`stored browser session was rejected while opening ${pathName}`)
  }

  const warmReloadMs = []
  phaseRef.value = 'warm'
  for (let index = 0; index < warmReloads; index += 1) {
    const startedAt = performance.now()
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitForUsable(page, selector)
    warmReloadMs.push(Math.round(performance.now() - startedAt))
  }
  await delay(250)
  await page.close()

  return { path: pathName, coldUsableMs, warmReloadMs, waterfall }
}

function selectApiPaths(configuredPaths, journeys) {
  if (configuredPaths.length > 0) return configuredPaths
  const slowest = [...journeys.home.waterfall, ...journeys.editor.waterfall]
    .filter(
      (sample) =>
        sample.method === 'GET' &&
        sample.status >= 200 &&
        sample.status < 400 &&
        !sample.path.includes('/events') &&
        !sample.path.includes('/stream')
    )
    .sort((left, right) => right.durationMs - left.durationMs)
  return [...new Set(['/api/health', ...slowest.map((sample) => sample.path)])].slice(0, 6)
}

async function sampleApis(context, baseUrl, paths, sampleCount) {
  const results = []
  for (const pathName of paths) {
    const samplesMs = []
    const statuses = []
    for (let index = 0; index < sampleCount; index += 1) {
      const startedAt = performance.now()
      const response = await context.request.get(`${baseUrl}${pathName}`, { timeout: 30_000 })
      samplesMs.push(Math.round(performance.now() - startedAt))
      statuses.push(response.status())
      await response.dispose()
    }
    results.push({
      path: pathName,
      statuses,
      ...summarizeSamples(samplesMs),
    })
  }
  return results
}

function collectNextTrace(bunExecutable, nextDirectory) {
  const result = run(bunExecutable, [
    'scripts/architecture/bundle-budget/collect-next-baseline.ts',
    '--next-dir',
    nextDirectory,
  ])
  if (result.status !== 0) {
    return { error: (result.stderr || result.stdout).trim() }
  }
  const jsonStart = result.stdout.indexOf('{')
  return JSON.parse(result.stdout.slice(jsonStart))
}

async function executeRound(config, bunExecutable, mode, roundNumber, capturedAt) {
  const runId = `${capturedAt.replaceAll(/[:.]/g, '-')}-${mode}-${roundNumber}`
  const relativeCacheDirectory = `.next-perf/current-${mode}`
  const nextDirectory = path.join(repositoryRoot, 'apps', 'sim', relativeCacheDirectory, 'dev')
  const cacheRoot = path.dirname(nextDirectory)
  const performanceCacheRoot = path.join(repositoryRoot, 'apps', 'sim', '.next-perf')
  if (!cacheRoot.startsWith(`${performanceCacheRoot}${path.sep}`)) {
    throw new Error(`refusing to recycle cache outside ${performanceCacheRoot}: ${cacheRoot}`)
  }
  await rm(cacheRoot, { recursive: true, force: true })
  const logPath = path.join(performanceDirectory, 'logs', `${runId}.log`)
  const logStream = createWriteStream(logPath, { flags: 'wx' })
  let log = ''
  const child = spawn(bunExecutable, ['run', MODE_SCRIPTS[mode]], {
    cwd: repositoryRoot,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      SIM_NEXT_DIST_DIR: relativeCacheDirectory,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const record = (chunk) => {
    const text = chunk.toString()
    log += text
    logStream.write(text)
  }
  child.stdout.on('data', record)
  child.stderr.on('data', record)

  let serviceReadyMs
  let journeys
  let apiSamples
  let failure
  try {
    serviceReadyMs = await waitForHealth(config.baseUrl, child)
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({ storageState: storageStatePath })
      const homePath = `/workspace/${config.workspaceId}/home`
      const editorPath = `/workspace/${config.workspaceId}/w/${config.workflowId}`
      const home = await measureRoute(
        context,
        config.baseUrl,
        homePath,
        config.homeReadySelector,
        config.warmReloads
      )
      const editor = await measureRoute(
        context,
        config.baseUrl,
        editorPath,
        config.editorReadySelector,
        config.warmReloads
      )
      journeys = { home, editor }
      const configuredApiPaths = (process.env.PERF_API_PATHS ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      if (configuredApiPaths.some((item) => !item.startsWith('/api/'))) {
        throw new Error('Every PERF_API_PATHS entry must start with /api/')
      }
      apiSamples = await sampleApis(
        context,
        config.baseUrl,
        selectApiPaths(configuredApiPaths, journeys),
        config.apiSamples
      )
      await context.close()
    } finally {
      await browser.close()
    }
  } catch (error) {
    failure = {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'Error',
    }
  } finally {
    await stopProcessTree(child)
    await new Promise((resolve) => logStream.end(resolve))
  }

  const runtimeProof = parseRuntimeProof(log)
  const missingRuntimeProof = REQUIRED_RUNTIME_SERVICES.filter(
    (service) => !runtimeProof.some((proof) => proof.service === service)
  )

  return {
    mode,
    round: roundNumber,
    status: failure ? 'failed' : 'completed',
    failure,
    cache: {
      state: 'isolated-empty-directory',
      nextDirectory,
    },
    logPath,
    serviceReadyMs: serviceReadyMs ?? null,
    journeys: journeys ?? null,
    apiSamples: apiSamples ?? [],
    runtimeProof,
    missingRuntimeProof,
    nextTrace: collectNextTrace(bunExecutable, nextDirectory),
  }
}

await ensurePerformanceDirectories()
try {
  await access(storageStatePath)
} catch {
  throw new Error(
    `Browser storage state is missing. Run perf:dev:prepare first: ${storageStatePath}`
  )
}

const config = readJourneyConfig()
for (const mode of config.modes) {
  if (!(mode in MODE_SCRIPTS)) {
    throw new Error(`Unsupported PERF_MODES entry: ${mode}`)
  }
}

const bunExecutable = process.env.BUN_EXECUTABLE ?? 'bun'
const bunVersion = commandOutput(bunExecutable, ['--version'])
const sourceShaAtStart = process.env.PERF_SOURCE_SHA ?? commandOutput('git', ['rev-parse', 'HEAD'])
const sourceBranch = commandOutput('git', ['branch', '--show-current'])
const capturedAt = new Date().toISOString()
const rounds = []

for (const mode of config.modes) {
  for (let roundNumber = 1; roundNumber <= config.rounds; roundNumber += 1) {
    process.stdout.write(`[perf] starting mode=${mode} round=${roundNumber}/${config.rounds}\n`)
    rounds.push(await executeRound(config, bunExecutable, mode, roundNumber, capturedAt))
  }
}

const sourceShaAtEnd = process.env.PERF_SOURCE_SHA ?? commandOutput('git', ['rev-parse', 'HEAD'])
if (sourceShaAtStart !== sourceShaAtEnd) {
  throw new Error(`source changed during capture: ${sourceShaAtStart} -> ${sourceShaAtEnd}`)
}

const simPackage = JSON.parse(
  await readFile(path.join(repositoryRoot, 'apps', 'sim', 'package.json'), 'utf8')
)
const modeSummaries = Object.fromEntries(
  config.modes.map((mode) => {
    const modeRounds = rounds.filter((round) => round.mode === mode)
    const completedRounds = modeRounds.filter((round) => round.status === 'completed')
    return [
      mode,
      {
        completedRounds: completedRounds.length,
        failedRounds: modeRounds.length - completedRounds.length,
        serviceReady: summarizeSamples(
          modeRounds.flatMap((round) =>
            round.serviceReadyMs === null ? [] : [round.serviceReadyMs]
          )
        ),
        homeCold: summarizeSamples(
          completedRounds.map((round) => round.journeys.home.coldUsableMs)
        ),
        editorCold: summarizeSamples(
          completedRounds.map((round) => round.journeys.editor.coldUsableMs)
        ),
        homeWarm: summarizeSamples(
          completedRounds.flatMap((round) => round.journeys.home.warmReloadMs)
        ),
        editorWarm: summarizeSamples(
          completedRounds.flatMap((round) => round.journeys.editor.warmReloadMs)
        ),
        firstCompileTotal: summarizeSamples(
          modeRounds.map((round) => round.nextTrace?.trace?.compilePhases?.first?.totalMs ?? 0)
        ),
        incrementalCompileP95: summarizeSamples(
          modeRounds.map((round) => round.nextTrace?.trace?.compilePhases?.incremental?.p95Ms ?? 0)
        ),
        peakRssBytes: Math.max(
          0,
          ...modeRounds.map((round) => round.nextTrace?.trace?.peakRssBytes ?? 0)
        ),
        stableRssBytes: Math.max(
          0,
          ...modeRounds.map((round) => round.nextTrace?.trace?.stableRssBytes ?? 0)
        ),
      },
    ]
  })
)
const fullRounds = rounds.filter((round) => round.mode === 'full')
const completedFullRounds = fullRounds.filter((round) => round.status === 'completed')
const acceptance =
  fullRounds.length === 0
    ? { passed: false, error: 'PERF_MODES must include full for SLA acceptance' }
    : evaluateFullMode(completedFullRounds)
if (fullRounds.length > 0) {
  acceptance.checks.completedRounds =
    completedFullRounds.length === config.rounds && completedFullRounds.length === fullRounds.length
  acceptance.failedRounds = fullRounds
    .filter((round) => round.status === 'failed')
    .map((round) => ({ round: round.round, failure: round.failure }))
  acceptance.passed = acceptance.passed && acceptance.checks.completedRounds
}
if (
  rounds.some((round) =>
    round.apiSamples.some((sample) => sample.statuses.some((status) => status >= 400))
  )
) {
  acceptance.passed = false
  acceptance.apiStatusCheck = false
} else {
  acceptance.apiStatusCheck = true
}

const report = {
  schemaVersion: 1,
  capturedAt,
  sourceSha: sourceShaAtStart,
  sourceBranch,
  status: acceptance.passed ? 'passed' : 'failed',
  machine: {
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
  runtime: {
    harnessNode: process.versions.node,
    bun: bunVersion,
    next: simPackage.dependencies.next,
  },
  environment: {
    baseUrl: config.baseUrl,
    modes: config.modes,
    roundsPerMode: config.rounds,
    warmReloadsPerRoute: config.warmReloads,
    apiSamplesPerPath: config.apiSamples,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    authSecretConfigured: Boolean(process.env.BETTER_AUTH_SECRET),
    apiBaseUrl: process.env.SIM_API_BASE_URL ?? 'http://127.0.0.1:3012',
  },
  modeSummaries,
  acceptance,
  rounds,
}

const reportPath = path.resolve(
  repositoryRoot,
  process.env.PERF_EVIDENCE_PATH ??
    path.join(
      '.perf',
      'reports',
      `node22-dev-performance-${capturedAt.replaceAll(/[:.]/g, '-')}.json`
    )
)
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`[perf] report=${reportPath} status=${report.status}\n`)
if (!acceptance.passed) process.exitCode = 1
