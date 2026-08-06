import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  journeyStatePath,
  performanceDirectory,
  repositoryRoot,
  storageStatePath,
} from './dev-performance-config.mjs'

function readJourney() {
  if (!existsSync(journeyStatePath)) return null
  try {
    const value = JSON.parse(readFileSync(journeyStatePath, 'utf8'))
    return {
      workspaceIdConfigured: typeof value.workspaceId === 'string' && value.workspaceId.length > 0,
      workflowIdConfigured: typeof value.workflowId === 'string' && value.workflowId.length > 0,
    }
  } catch {
    return { workspaceIdConfigured: false, workflowIdConfigured: false }
  }
}

function dockerStatus() {
  const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    cliAvailable: result.error?.code !== 'ENOENT',
    daemonAvailable: result.status === 0,
    serverVersion: result.status === 0 ? result.stdout.trim() : null,
  }
}

const journey = readJourney()
const docker = dockerStatus()
const checks = {
  node22: process.versions.node.startsWith('22.'),
  databaseConfigured: Boolean(process.env.DATABASE_URL?.trim()),
  authenticatedStorageState: existsSync(storageStatePath),
  controlledWorkspace: journey?.workspaceIdConfigured === true,
  controlledWorkflow: journey?.workflowIdConfigured === true,
  completeRegistry: process.env.SIM_MINIMAL_REGISTRY !== '1',
  simDesktopReady: process.env.PERF_SIM_DESKTOP_READY === '1',
  dockerCli: docker.cliAvailable,
  dockerDaemon: docker.daemonAvailable,
}
const blockingChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name)
const capturedAt = new Date().toISOString()
const report = {
  schemaVersion: 1,
  capturedAt,
  sourceSha:
    spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
    }).stdout?.trim() ?? null,
  status: blockingChecks.length === 0 ? 'ready' : 'blocked',
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
  checks,
  blockingChecks,
  paths: {
    storageState: path.relative(repositoryRoot, storageStatePath),
    journeyState: path.relative(repositoryRoot, journeyStatePath),
  },
  docker,
  nextCommands: [
    'Set DATABASE_URL and run: bun run perf:workspace:real',
    'Run the Desktop journey and set PERF_SIM_DESKTOP_READY=1 only after it passes',
    'Start Docker Desktop and validate: docker compose -f docker-compose.prod.yml config',
  ],
}

const reportsDirectory = path.join(performanceDirectory, 'reports')
await mkdir(reportsDirectory, { recursive: true })
const reportPath = path.join(
  reportsDirectory,
  `workspace-acceptance-readiness-${capturedAt.replaceAll(/[:.]/g, '-')}.json`
)
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
console.log(`[readiness] report=${reportPath}`)
if (blockingChecks.length > 0) process.exitCode = 1
