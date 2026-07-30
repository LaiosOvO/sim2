#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { gzipSync } from 'node:zlib'

interface Budget {
  schemaVersion: 1
  inventoryGroup: 'W8-APPROVALS'
  budgets: {
    coldCompileMs: number
    rawBundleBytes: number
    gzipBundleBytes: number
  }
}

const repositoryRoot = path.resolve(import.meta.dir, '..', '..', '..')
const entrypoint = path.join(
  repositoryRoot,
  'apps',
  'sim',
  'app',
  'workspace',
  '[workspaceId]',
  'approvals',
  'page.tsx'
)
const closure = [
  entrypoint,
  path.join(repositoryRoot, 'apps', 'sim', 'hooks', 'queries', 'approvals.ts'),
  path.join(repositoryRoot, 'apps', 'sim', 'lib', 'api', 'contracts', 'approvals.ts'),
  path.join(repositoryRoot, 'packages', 'api-contracts', 'src', 'approvals.ts'),
]
const forbidden = [
  '@sim/db',
  'drizzle-orm',
  'PauseResumeManager',
  'block-executor',
  'toolRegistry',
  'Feishu',
  'Meegle',
]

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

async function measureSource(file: string) {
  const content = await readFile(file)
  return {
    path: path.relative(repositoryRoot, file).replaceAll(path.sep, '/'),
    bytes: content.byteLength,
    sha256: sha256(content),
  }
}

async function measure() {
  const startedAt = performance.now()
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: 'browser',
    minify: true,
    write: false,
    external: ['next/*', 'react', 'react/*', '@tanstack/react-query'],
  })
  const coldCompileMs = Math.round((performance.now() - startedAt) * 10) / 10
  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join('\n'))
  }
  const output = result.outputs.find((candidate) => candidate.kind === 'entry-point')
  if (!output) throw new Error('W8 approval browser bundle has no entry-point output')
  const bytes = new Uint8Array(await output.arrayBuffer())
  const source = new TextDecoder().decode(bytes)
  const forbiddenHits = forbidden.filter((token) => source.includes(token))
  return {
    schemaVersion: 1 as const,
    inventoryGroup: 'W8-APPROVALS' as const,
    capturedAt: new Date().toISOString(),
    runner: {
      kind: 'bun-browser-build',
      bunVersion: Bun.version,
      platform: process.platform,
      architecture: process.arch,
    },
    entrypoint: path.relative(repositoryRoot, entrypoint).replaceAll(path.sep, '/'),
    configuration: {
      target: 'browser',
      minify: true,
      external: ['next/*', 'react', 'react/*', '@tanstack/react-query'],
    },
    sourceClosure: await Promise.all(closure.map(measureSource)),
    samples: {
      coldCompileMs,
      rawBundleBytes: bytes.byteLength,
      gzipBundleBytes: gzipSync(bytes).byteLength,
    },
    closureAudit: {
      forbiddenTokens: forbidden,
      hits: forbiddenHits,
      passed: forbiddenHits.length === 0,
    },
  }
}

async function main() {
  const result = await measure()
  const output = argument('--output')
  if (output) {
    await writeFile(
      path.resolve(repositoryRoot, output),
      `${JSON.stringify(result, null, 2)}\n`,
      'utf8'
    )
  }
  if (process.argv.includes('--check')) {
    const budgetPath = path.resolve(
      repositoryRoot,
      argument('--budget') ?? 'docs/testing/w8-approvals-frontend-compile-budget.json'
    )
    const budget = JSON.parse(await readFile(budgetPath, 'utf8')) as Budget
    const failures: string[] = []
    if (result.samples.coldCompileMs > budget.budgets.coldCompileMs) {
      failures.push('cold compile budget exceeded')
    }
    if (result.samples.rawBundleBytes > budget.budgets.rawBundleBytes) {
      failures.push('raw bundle budget exceeded')
    }
    if (result.samples.gzipBundleBytes > budget.budgets.gzipBundleBytes) {
      failures.push('gzip bundle budget exceeded')
    }
    if (!result.closureAudit.passed) {
      failures.push(`forbidden browser closure tokens: ${result.closureAudit.hits.join(', ')}`)
    }
    if (failures.length) throw new Error(failures.join('; '))
    console.log(
      `W8 approvals client ratchet passed: ${result.samples.coldCompileMs} ms, ` +
        `${result.samples.rawBundleBytes} raw bytes, ${result.samples.gzipBundleBytes} gzip bytes`
    )
    return
  }
  console.log(JSON.stringify(result, null, 2))
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exit(1)
  })
}
