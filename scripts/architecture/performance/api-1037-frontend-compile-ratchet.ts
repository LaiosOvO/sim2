#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import type { RollupWatcher, RollupWatcherEvent } from 'rollup'
import { build, version as viteVersion } from 'vite'

interface CompileBudget {
  coldCompileMs: number
  incrementalCompileMs: number
}

interface CompileBudgetFile {
  schemaVersion: 1
  inventoryId: 'API-1037'
  runner: 'focused-vite-watch'
  budgets: CompileBudget
}

interface SourceMeasurement {
  path: string
  bytes: number
  sha256: string
}

interface CompileSample {
  durationMs: number
  sourceSha256: string
}

interface FrontendCompileMeasurement {
  schemaVersion: 1
  inventoryId: 'API-1037'
  capturedAt: string
  runner: {
    kind: 'focused-vite-watch'
    viteVersion: string
    bunVersion: string
    platform: NodeJS.Platform
    architecture: string
    cpuModel: string
    logicalCpuCount: number
    totalMemoryBytes: number
  }
  entrypoint: string
  measurementTool: SourceMeasurement
  configuration: {
    coldDefinition: string
    incrementalDefinition: string
    externalPackages: string[]
  }
  measurementQuality: {
    stableMachineBaseline: false
    use: string
    limitation: string
  }
  sourceClosure: SourceMeasurement[]
  interactionJourney: {
    testPath: string
    command: string
    assertions: string[]
  }
  invalidation: {
    editedPath: string
    operation: 'append-probe-comment-then-restore'
    originalSha256: string
    editedSha256: string
    restoredSha256: string
  }
  samples: {
    cold: CompileSample
    incremental: CompileSample
  }
}

const scriptPath = fileURLToPath(import.meta.url)
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..', '..', '..')
const simRoot = path.join(repositoryRoot, 'apps', 'sim')
const entrypoint = path.join(
  simRoot,
  'ee',
  'workspace-forking',
  'components',
  'fork-workspace-modal',
  'fork-workspace-modal.tsx'
)
const interactionTestPath = path.join(
  simRoot,
  'ee',
  'workspace-forking',
  'components',
  'fork-workspace-modal',
  'fork-workspace-modal.interaction.test.tsx'
)
const sourcePaths = [
  entrypoint,
  path.join(
    simRoot,
    'ee',
    'workspace-forking',
    'components',
    'fork-resource-picker',
    'fork-resource-picker.tsx'
  ),
  path.join(
    simRoot,
    'ee',
    'workspace-forking',
    'components',
    'fork-file-tree',
    'fork-file-tree.tsx'
  ),
  path.join(simRoot, 'ee', 'workspace-forking', 'hooks', 'use-fork-resources.ts'),
  path.join(simRoot, 'ee', 'workspace-forking', 'hooks', 'use-fork-workspace.ts'),
  path.join(simRoot, 'lib', 'api', 'contracts', 'workspace-fork-resources.ts'),
  path.join(simRoot, 'lib', 'api', 'contracts', 'workspace-fork-create.ts'),
  path.join(repositoryRoot, 'packages', 'api-contracts', 'src', 'workspace-forking.ts'),
  path.join(repositoryRoot, 'packages', 'emcn', 'src', 'workspace-fork.ts'),
  interactionTestPath,
]
const defaultBudgetPath = path.join(
  repositoryRoot,
  'docs',
  'testing',
  'api-1037-frontend-compile-budget.json'
)
const incrementalProbe = '\n/** API-1037 incremental compile measurement probe. */\n'
const externalPackages = ['react', 'react-dom', 'next/navigation']
const measurementTimeoutMs = 30_000

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 10) / 10
}

async function measureSource(file: string): Promise<SourceMeasurement> {
  const content = await readFile(file)
  return {
    path: path.relative(repositoryRoot, file).replaceAll(path.sep, '/'),
    bytes: content.byteLength,
    sha256: sha256(content),
  }
}

export function compileBudgetFailures(
  samples: FrontendCompileMeasurement['samples'],
  budgets: CompileBudget
): string[] {
  const failures: string[] = []
  if (samples.cold.durationMs > budgets.coldCompileMs) {
    failures.push(`cold compile ${samples.cold.durationMs} ms exceeds ${budgets.coldCompileMs} ms`)
  }
  if (samples.incremental.durationMs > budgets.incrementalCompileMs) {
    failures.push(
      `incremental compile ${samples.incremental.durationMs} ms exceeds ${budgets.incrementalCompileMs} ms`
    )
  }
  return failures
}

function createBundleEventQueue(watcher: RollupWatcher): () => Promise<number> {
  const queued: Array<{ durationMs?: number; error?: Error }> = []
  const waiting: Array<(event: { durationMs?: number; error?: Error }) => void> = []
  watcher.on('event', (event: RollupWatcherEvent) => {
    const queuedEvent =
      event.code === 'ERROR'
        ? {
            error:
              event.error instanceof Error
                ? event.error
                : new Error(`Vite watcher reported an error: ${String(event.error)}`),
          }
        : event.code === 'BUNDLE_END'
          ? { durationMs: roundMilliseconds(event.duration) }
          : undefined
    if (!queuedEvent) return
    const resolve = waiting.shift()
    if (resolve) resolve(queuedEvent)
    else queued.push(queuedEvent)
  })

  return () =>
    new Promise((resolve, reject) => {
      const startedAt = performance.now()
      const timeout = setTimeout(() => {
        reject(new Error(`Vite compile did not finish within ${measurementTimeoutMs} ms`))
      }, measurementTimeoutMs)
      const consume = (event: { durationMs?: number; error?: Error }) => {
        clearTimeout(timeout)
        if (event.error) {
          reject(event.error)
          return
        }
        resolve(event.durationMs ?? roundMilliseconds(performance.now() - startedAt))
      }
      const event = queued.shift()
      if (event) consume(event)
      else waiting.push(consume)
    })
}

async function createWatcher(): Promise<RollupWatcher> {
  const result = await build({
    configFile: false,
    root: repositoryRoot,
    logLevel: 'error',
    resolve: {
      alias: [{ find: /^@\//, replacement: `${simRoot.replaceAll('\\', '/')}/` }],
    },
    build: {
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      target: 'es2022',
      write: false,
      lib: {
        entry: entrypoint,
        formats: ['es'],
        fileName: 'api-1037-workspace-fork-modal',
      },
      rollupOptions: {
        external: externalPackages,
      },
      watch: {
        clearScreen: false,
      },
    },
  })
  if (!('on' in result) || !('close' in result)) {
    throw new Error('Vite did not return a build watcher')
  }
  return result
}

async function measureCompile(): Promise<FrontendCompileMeasurement> {
  const originalSource = await readFile(entrypoint, 'utf8')
  const originalSha256 = sha256(originalSource)
  const editedSource = `${originalSource}${incrementalProbe}`
  const editedSha256 = sha256(editedSource)
  let watcher: RollupWatcher | undefined
  let sourceEdited = false

  try {
    watcher = await createWatcher()
    const nextBundle = createBundleEventQueue(watcher)
    const coldDurationMs = await nextBundle()

    const incrementalPromise = nextBundle()
    await writeFile(entrypoint, editedSource, 'utf8')
    sourceEdited = true
    const incrementalDurationMs = await incrementalPromise

    const currentSource = await readFile(entrypoint, 'utf8')
    if (currentSource !== editedSource) {
      throw new Error('API-1037 entrypoint changed concurrently; refusing to overwrite it')
    }
    await writeFile(entrypoint, originalSource, 'utf8')
    sourceEdited = false
    const restoredSha256 = sha256(await readFile(entrypoint))
    if (restoredSha256 !== originalSha256) {
      throw new Error('API-1037 entrypoint restoration hash does not match the original source')
    }

    return {
      schemaVersion: 1,
      inventoryId: 'API-1037',
      capturedAt: new Date().toISOString(),
      runner: {
        kind: 'focused-vite-watch',
        viteVersion,
        bunVersion: Bun.version,
        platform: process.platform,
        architecture: process.arch,
        cpuModel: os.cpus()[0]?.model ?? 'unknown',
        logicalCpuCount: os.cpus().length,
        totalMemoryBytes: os.totalmem(),
      },
      entrypoint: path.relative(repositoryRoot, entrypoint).replaceAll(path.sep, '/'),
      measurementTool: await measureSource(scriptPath),
      configuration: {
        coldDefinition:
          'first Vite watch bundle of the real fork modal in a fresh process with no in-process transform cache',
        incrementalDefinition:
          'next watch bundle after appending a valid TSDoc probe to the real fork modal source',
        externalPackages,
      },
      measurementQuality: {
        stableMachineBaseline: false,
        use: 'source-bound local sample plus a fixed non-regression ceiling',
        limitation:
          'The focused Vite measurement isolates source compilation; the authenticated Next page journey remains a separate frontend milestone.',
      },
      sourceClosure: await Promise.all(sourcePaths.map(measureSource)),
      interactionJourney: {
        testPath: path.relative(repositoryRoot, interactionTestPath).replaceAll(path.sep, '/'),
        command:
          'bunx vitest run ee/workspace-forking/components/fork-workspace-modal/fork-workspace-modal.interaction.test.tsx',
        assertions: [
          'modal hydrates the focused resource response and defaults all returned resources selected',
          'a user deselection reaches the exact create-fork copy payload',
          'Fork remains disabled until the focused resource query resolves',
          'successful submission closes the modal and exposes the Open fork action',
        ],
      },
      invalidation: {
        editedPath: path.relative(repositoryRoot, entrypoint).replaceAll(path.sep, '/'),
        operation: 'append-probe-comment-then-restore',
        originalSha256,
        editedSha256,
        restoredSha256,
      },
      samples: {
        cold: { durationMs: coldDurationMs, sourceSha256: originalSha256 },
        incremental: { durationMs: incrementalDurationMs, sourceSha256: editedSha256 },
      },
    }
  } finally {
    await watcher?.close()
    if (sourceEdited) {
      const currentSource = await readFile(entrypoint, 'utf8')
      if (currentSource === editedSource) await writeFile(entrypoint, originalSource, 'utf8')
    }
  }
}

async function main(): Promise<void> {
  const measurement = await measureCompile()
  const outputPath = argument('--output')
  if (outputPath) {
    const absoluteOutputPath = path.resolve(repositoryRoot, outputPath)
    await mkdir(path.dirname(absoluteOutputPath), { recursive: true })
    await writeFile(absoluteOutputPath, `${JSON.stringify(measurement, null, 2)}\n`, 'utf8')
  }

  if (!process.argv.includes('--check')) {
    console.log(JSON.stringify(measurement, null, 2))
    return
  }

  const budgetPath = path.resolve(repositoryRoot, argument('--budget') ?? defaultBudgetPath)
  const budget = JSON.parse(await readFile(budgetPath, 'utf8')) as CompileBudgetFile
  if (budget.inventoryId !== 'API-1037') {
    throw new Error(`Compile budget inventory ${budget.inventoryId} does not match API-1037`)
  }
  const failures = compileBudgetFailures(measurement.samples, budget.budgets)
  if (failures.length > 0) {
    console.error('API-1037 frontend compile performance violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log(
    `API-1037 frontend compile ratchet passed: cold ${measurement.samples.cold.durationMs} ms / ${budget.budgets.coldCompileMs} ms, incremental ${measurement.samples.incremental.durationMs} ms / ${budget.budgets.incrementalCompileMs} ms`
  )
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exit(1)
  })
}
