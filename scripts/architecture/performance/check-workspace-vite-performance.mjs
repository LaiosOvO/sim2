import { spawn, spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { summarizeSamples } from './performance-metrics.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..')
const appDirectory = path.join(repositoryRoot, 'apps', 'workspace-web')
const viteCli = path.join(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const assertionModule = path.join(repositoryRoot, 'scripts', 'runtime', 'assert-node-22.mjs')
const baseUrl = new URL(process.env.PERF_WORKSPACE_VITE_URL ?? 'http://127.0.0.1:5173').origin
const workspaceId = process.env.PERF_WORKSPACE_ID ?? 'performance-workspace'
const workflowId = process.env.PERF_WORKFLOW_ID ?? 'performance-workflow'
const routeKind = process.env.PERF_WORKSPACE_ROUTE === 'editor' ? 'editor' : 'home'
const route =
  routeKind === 'editor'
    ? `/workspace/${encodeURIComponent(workspaceId)}/w/${encodeURIComponent(workflowId)}`
    : `/workspace/${encodeURIComponent(workspaceId)}/home`
const warmReloadCount = Number.parseInt(process.env.PERF_WARM_RELOADS ?? '10', 10)
const useRealBackend = process.env.PERF_WORKSPACE_REAL_BACKEND === '1'
const storageStatePath =
  process.env.PERF_STORAGE_STATE ?? path.join(repositoryRoot, '.perf', 'auth', 'storage-state.json')
const runStartedAt = new Date().toISOString()
const isolatedCacheDirectory = path.join(
  repositoryRoot,
  '.perf',
  'cache',
  `workspace-vite-${runStartedAt.replaceAll(/[:.]/g, '-')}`
)
const limits = {
  serviceReadyMs: 2_000,
  compilerColdUsableMs: 10_000,
  coldUsableMs: 2_000,
  warmReloadP95Ms: 2_000,
  bootstrapApiP95Ms: 1_000,
  viteProcessTreeRssBytes: 4 * 1024 * 1024 * 1024,
}

if (!Number.isFinite(warmReloadCount) || warmReloadCount < 10) {
  throw new Error('PERF_WARM_RELOADS must be an integer >= 10')
}

async function waitForServer(child) {
  const startedAt = performance.now()
  let lastError = 'no response'
  while (performance.now() - startedAt < 15_000) {
    if (child.exitCode !== null) {
      throw new Error(
        `Workspace Vite process exited with code ${child.exitCode}: ${serverLog.trim()}`
      )
    }
    try {
      const response = await fetch(`${baseUrl}${route}`, {
        signal: AbortSignal.timeout(1_000),
      })
      if (response.ok) return Math.round(performance.now() - startedAt)
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(25)
  }
  throw new Error(`Workspace Vite did not become ready (${lastError})`)
}

async function stopProcess(child) {
  if (child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  } else {
    child.kill('SIGTERM')
  }
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(5_000)])
}

function processTable() {
  const command =
    process.platform === 'win32'
      ? {
          executable: 'powershell.exe',
          args: [
            '-NoProfile',
            '-Command',
            'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId),$($_.WorkingSetSize)" }',
          ],
          rssMultiplier: 1,
        }
      : {
          executable: 'ps',
          args: ['-axo', 'pid=,ppid=,rss='],
          rssMultiplier: 1024,
        }
  const result = spawnSync(command.executable, command.args, {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) return []
  return result.stdout.split(/\r?\n/).flatMap((line) => {
    const fields = process.platform === 'win32' ? line.trim().split(',') : line.trim().split(/\s+/)
    if (fields.length !== 3) return []
    const [pid, parentPid, rss] = fields.map((field) => Number.parseInt(field, 10))
    if (![pid, parentPid, rss].every(Number.isFinite)) return []
    return [{ pid, parentPid, rssBytes: rss * command.rssMultiplier }]
  })
}

function processTreeRssBytes(rootPid) {
  const table = processTable()
  const treePids = new Set([rootPid])
  let changed = true
  while (changed) {
    changed = false
    for (const processInfo of table) {
      if (treePids.has(processInfo.parentPid) && !treePids.has(processInfo.pid)) {
        treePids.add(processInfo.pid)
        changed = true
      }
    }
  }
  return table
    .filter((processInfo) => treePids.has(processInfo.pid))
    .reduce((total, processInfo) => total + processInfo.rssBytes, 0)
}

const child = spawn(
  process.execPath,
  [
    '--import',
    pathToFileURL(assertionModule).href,
    viteCli,
    '--host',
    '127.0.0.1',
    '--port',
    new URL(baseUrl).port,
  ],
  {
    cwd: appDirectory,
    env: {
      ...process.env,
      SIM_RUNTIME_SERVICE: 'workspace-vite-performance',
      SIM_WORKSPACE_VITE_CACHE_DIR: isolatedCacheDirectory,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }
)
let serverLog = ''
const record = (chunk) => {
  serverLog += chunk.toString()
}
child.stdout.on('data', record)
child.stderr.on('data', record)

let serviceReadyMs
let compilerColdUsableMs
let coldUsableMs
let viteProcessTreeRssBytes
const warmReloadMs = []
const bootstrapApiSamples = []
const bootstrapApiStatuses = []
let browser
let context

async function createJourneyContext() {
  const journeyContext = await browser.newContext(
    useRealBackend ? { storageState: storageStatePath } : {}
  )
  const page = await journeyContext.newPage()
  if (!useRealBackend) {
    await page.route('**/api/workspace-bootstrap?**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          session: {
            user: {
              id: 'performance-user',
              name: 'Performance User',
              email: 'performance@example.com',
            },
          },
          workflows: [
            {
              id: 'performance-workflow',
              name: 'Performance workflow',
              description: null,
              folderId: null,
              updatedAt: '2026-01-01T00:00:00.000Z',
              isDeployed: false,
            },
          ],
          folders: [],
          chats: [],
          files: [],
        }),
      })
    )
    await page.route(`**/api/workflows/${encodeURIComponent(workflowId)}`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: workflowId,
            workspaceId,
            name: 'Performance workflow',
            description: null,
            isDeployed: false,
            locked: false,
            state: { blocks: {}, edges: [], loops: {}, parallels: {} },
          },
        }),
      })
    )
  }
  return { context: journeyContext, page }
}

async function measureUsable(page) {
  const startedAt = performance.now()
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
  const readySelector =
    routeKind === 'editor' ? '[data-editor-ready="true"]' : '[data-workspace-data-state="complete"]'
  await page.locator(readySelector).waitFor({ state: 'visible' })
  return Math.round(performance.now() - startedAt)
}

try {
  serviceReadyMs = await waitForServer(child)
  browser = await chromium.launch()
  let journey = await createJourneyContext()
  context = journey.context
  compilerColdUsableMs = await measureUsable(journey.page)
  await journey.page.close()
  await context.close()

  journey = await createJourneyContext()
  context = journey.context
  const page = journey.page
  coldUsableMs = await measureUsable(page)

  for (let index = 0; index < warmReloadCount; index += 1) {
    const startedAt = performance.now()
    await page.reload({ waitUntil: 'domcontentloaded' })
    const readySelector =
      routeKind === 'editor'
        ? '[data-editor-ready="true"]'
        : '[data-workspace-data-state="complete"]'
    await page.locator(readySelector).waitFor({ state: 'visible' })
    warmReloadMs.push(Math.round(performance.now() - startedAt))
  }
  if (useRealBackend) {
    for (let index = 0; index < 30; index += 1) {
      const startedAt = performance.now()
      const criticalApiPath =
        routeKind === 'editor'
          ? `/api/workflows/${encodeURIComponent(workflowId)}`
          : `/api/workspace-bootstrap?workspaceId=${encodeURIComponent(workspaceId)}`
      const response = await context.request.get(`${baseUrl}${criticalApiPath}`)
      bootstrapApiSamples.push(Math.round(performance.now() - startedAt))
      bootstrapApiStatuses.push(response.status())
      await response.dispose()
    }
  }
  viteProcessTreeRssBytes = processTreeRssBytes(child.pid)
  await page.close()
} finally {
  await context?.close()
  await browser?.close()
  await stopProcess(child)
}

const warm = summarizeSamples(warmReloadMs)
const bootstrapApi = summarizeSamples(bootstrapApiSamples)
const checks = {
  nodeRuntime: /^22\./.test(process.versions.node),
  serviceReady: serviceReadyMs <= limits.serviceReadyMs,
  compilerColdUsable: compilerColdUsableMs <= limits.compilerColdUsableMs,
  coldUsable: coldUsableMs <= limits.coldUsableMs,
  warmReloadP95: warm.p95Ms !== null && warm.p95Ms <= limits.warmReloadP95Ms,
  bootstrapApiP95:
    !useRealBackend ||
    (bootstrapApi.count === 30 &&
      bootstrapApi.p95Ms !== null &&
      bootstrapApi.p95Ms <= limits.bootstrapApiP95Ms &&
      bootstrapApiStatuses.every((status) => status >= 200 && status < 300)),
  viteProcessTreeRss:
    Number.isFinite(viteProcessTreeRssBytes) &&
    viteProcessTreeRssBytes > 0 &&
    viteProcessTreeRssBytes <= limits.viteProcessTreeRssBytes,
}
const capturedAt = new Date().toISOString()
const sourceStatus = spawnSync('git', ['status', '--porcelain'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).stdout.trim()
const report = {
  schemaVersion: 2,
  capturedAt,
  sourceSha: spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).stdout.trim(),
  sourceDirty: sourceStatus.length > 0,
  status: Object.values(checks).every(Boolean) ? 'passed' : 'failed',
  runtime: {
    node: process.versions.node,
    execPath: process.execPath,
  },
  machine: {
    platform: process.platform,
    architecture: process.arch,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
  route,
  routeKind,
  backendMode: useRealBackend ? 'real-authenticated-api' : 'deterministic-fixture',
  cacheState: {
    kind: 'isolated-directory-per-run',
    directory: isolatedCacheDirectory,
  },
  environment: {
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    authenticatedStorageState: useRealBackend,
    completeRegistry: process.env.SIM_MINIMAL_REGISTRY !== '1',
  },
  limits,
  checks,
  serviceReadyMs,
  compilerColdUsableMs,
  coldUsableMs,
  viteProcessTreeRssBytes,
  warmReload: warm,
  bootstrapApi: {
    ...bootstrapApi,
    statuses: bootstrapApiStatuses,
  },
  serverRuntimeProof:
    serverLog.match(/\[runtime\][^\r\n]+/)?.[0] ?? 'runtime proof was not captured',
}

const reportDirectory = path.join(repositoryRoot, '.perf', 'reports')
await mkdir(reportDirectory, { recursive: true })
const reportPath = path.join(
  reportDirectory,
  `workspace-vite-${capturedAt.replaceAll(/[:.]/g, '-')}.json`
)
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`[perf] report=${reportPath}\n`)
if (report.status !== 'passed') process.exitCode = 1
