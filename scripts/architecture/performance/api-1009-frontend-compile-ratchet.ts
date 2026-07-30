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
  inventoryId: ProfileId
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

type ProfileId = 'API-1009' | 'W6-GROUP-A' | 'W6-GROUP-B'

interface FrontendCompileMeasurement {
  schemaVersion: 1
  inventoryId: ProfileId
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
const w6Profile = process.argv.includes('--w6')
const w6ControlProfile = process.argv.includes('--w6-control')
const inventoryId: ProfileId = w6ControlProfile
  ? 'W6-GROUP-B'
  : w6Profile
    ? 'W6-GROUP-A'
    : 'API-1009'
const hookPath = w6ControlProfile
  ? path.join(simRoot, 'hooks', 'queries', 'execution-control.ts')
  : w6Profile
    ? path.join(
        simRoot,
        'app',
        '(interfaces)',
        'resume',
        '[workflowId]',
        '[executionId]',
        'resume-page-client.tsx'
      )
    : path.join(simRoot, 'ee', 'workspace-forking', 'hooks', 'background-work.ts')
const sourcePaths = w6ControlProfile
  ? [
      hookPath,
      path.join(simRoot, 'lib', 'api', 'contracts', 'execution-control.ts'),
      path.join(repositoryRoot, 'packages', 'api-contracts', 'src', 'execution-control.ts'),
    ]
  : w6Profile
    ? [
        hookPath,
        path.join(simRoot, 'lib', 'browser', 'resume-view-model.ts'),
        path.join(simRoot, 'hooks', 'queries', 'resume-execution.ts'),
        path.join(simRoot, 'lib', 'api', 'contracts', 'execution-read.ts'),
        path.join(repositoryRoot, 'packages', 'emcn', 'src', 'resume.ts'),
        path.join(repositoryRoot, 'packages', 'emcn', 'src', 'lib', 'lucide-icons.ts'),
      ]
    : [
        hookPath,
        path.join(simRoot, 'lib', 'api', 'contracts', 'workspace-background-work.ts'),
        path.join(
          repositoryRoot,
          'packages',
          'api-contracts',
          'src',
          'workspace-background-work.ts'
        ),
      ]
const defaultBudgetPath = path.join(
  repositoryRoot,
  'docs',
  'testing',
  w6ControlProfile
    ? 'w6-execution-control-frontend-compile-budget.json'
    : w6Profile
      ? 'w6-resume-frontend-compile-budget.json'
      : 'api-1009-frontend-compile-budget.json'
)
const incrementalProbe = `\n/** ${inventoryId} incremental compile measurement probe. */\n`
const externalPackages = w6ControlProfile
  ? ['react', '@tanstack/react-query']
  : w6Profile
    ? ['react', 'react-dom', 'next/navigation']
    : ['react', '@tanstack/react-query']
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
    if (resolve) {
      resolve(queuedEvent)
    } else {
      queued.push(queuedEvent)
    }
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
      if (event) {
        consume(event)
      } else {
        waiting.push(consume)
      }
    })
}

async function createWatcher(): Promise<RollupWatcher> {
  let result: Awaited<ReturnType<typeof build>>
  try {
    result = await build({
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
          entry: hookPath,
          formats: ['es'],
          fileName: w6ControlProfile
            ? 'w6-execution-control'
            : w6Profile
              ? 'w6-resume-page-client'
              : 'api-1009-background-work',
        },
        rollupOptions: {
          external: externalPackages,
        },
        watch: {
          clearScreen: false,
        },
      },
    })
  } catch (error) {
    throw new Error(
      `Vite watcher creation failed for ${inventoryId}: ${
        error instanceof Error ? error.stack : String(error)
      }`
    )
  }
  if (!('on' in result) || !('close' in result)) {
    throw new Error('Vite did not return a build watcher')
  }
  return result
}

async function measureCompile(): Promise<FrontendCompileMeasurement> {
  const originalSource = await readFile(hookPath, 'utf8')
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
    await writeFile(hookPath, editedSource, 'utf8')
    sourceEdited = true
    const incrementalDurationMs = await incrementalPromise

    const currentSource = await readFile(hookPath, 'utf8')
    if (currentSource !== editedSource) {
      throw new Error(
        `The ${inventoryId} entrypoint changed concurrently; refusing to overwrite it`
      )
    }
    await writeFile(hookPath, originalSource, 'utf8')
    sourceEdited = false
    const restoredSource = await readFile(hookPath, 'utf8')
    const restoredSha256 = sha256(restoredSource)
    if (restoredSha256 !== originalSha256) {
      throw new Error(
        `${inventoryId} entrypoint restoration hash does not match the original source`
      )
    }

    return {
      schemaVersion: 1,
      inventoryId,
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
      entrypoint: path.relative(repositoryRoot, hookPath).replaceAll(path.sep, '/'),
      measurementTool: await measureSource(scriptPath),
      configuration: {
        coldDefinition:
          'first Vite watch bundle in a fresh process with no in-process transform cache',
        incrementalDefinition:
          'next watch bundle after appending a valid TSDoc probe to the real entrypoint source',
        externalPackages,
      },
      measurementQuality: {
        stableMachineBaseline: false,
        use: 'source-bound local sample plus a wide fixed regression ceiling',
        limitation:
          'This shared integration worktree may run other agent processes concurrently; do not use one wall-clock sample as a cross-machine SLO baseline.',
      },
      sourceClosure: await Promise.all(sourcePaths.map(measureSource)),
      invalidation: {
        editedPath: path.relative(repositoryRoot, hookPath).replaceAll(path.sep, '/'),
        operation: 'append-probe-comment-then-restore',
        originalSha256,
        editedSha256,
        restoredSha256,
      },
      samples: {
        cold: {
          durationMs: coldDurationMs,
          sourceSha256: originalSha256,
        },
        incremental: {
          durationMs: incrementalDurationMs,
          sourceSha256: editedSha256,
        },
      },
    }
  } finally {
    await watcher?.close()
    if (sourceEdited) {
      const currentSource = await readFile(hookPath, 'utf8')
      if (currentSource === editedSource) {
        await writeFile(hookPath, originalSource, 'utf8')
      }
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

  if (process.argv.includes('--check')) {
    const budgetPath = path.resolve(repositoryRoot, argument('--budget') ?? defaultBudgetPath)
    const budget = JSON.parse(await readFile(budgetPath, 'utf8')) as CompileBudgetFile
    if (budget.inventoryId !== inventoryId) {
      throw new Error(
        `Compile budget inventory ${budget.inventoryId} does not match active profile ${inventoryId}`
      )
    }
    const failures = compileBudgetFailures(measurement.samples, budget.budgets)
    if (failures.length > 0) {
      console.error(`${inventoryId} frontend compile performance violations:`)
      for (const failure of failures) console.error(`- ${failure}`)
      process.exit(1)
    }
    console.log(
      `${inventoryId} frontend compile ratchet passed: cold ${measurement.samples.cold.durationMs} ms / ${budget.budgets.coldCompileMs} ms, incremental ${measurement.samples.incremental.durationMs} ms / ${budget.budgets.incrementalCompileMs} ms`
    )
    return
  }

  console.log(JSON.stringify(measurement, null, 2))
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exit(1)
  })
}
