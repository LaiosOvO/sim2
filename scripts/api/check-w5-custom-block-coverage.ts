#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { customBlockRoutesV1 } from '@sim/api-contracts/custom-blocks'

interface SourceClosureEntry {
  path: string
  bytes: number
  sha256: string
}

interface Evidence {
  inventoryId: string
  sourceClosure: SourceClosureEntry[]
}

interface Coverage {
  inventory: string[]
  routes: number
  methodPathPairs: number
  acceptedLedgerUpdated: boolean
}

interface CompileEvidence extends Evidence {
  entrypoint: string
  invalidation: {
    originalSha256: string
    restoredSha256: string
  }
  samples: {
    cold: { durationMs: number; sourceSha256: string }
    incremental: { durationMs: number }
  }
}

interface CompileBudget {
  inventoryId: string
  budgets: {
    coldCompileMs: number
    incrementalCompileMs: number
  }
}

interface PostgresEvidence extends Evidence {
  database: { majorVersion: number; disposable: boolean }
  result: { testsPassed: number; testsFailed: number }
  queryRatchets: {
    listHydrationQueries: number
    usageQueries: number
    perRowDeploymentQueriesAllowed: number
  }
  coverage: string[]
}

const root = path.resolve(import.meta.dir, '..', '..')
const inventoryId = 'W5-CUSTOM-BLOCKS'
const evidencePaths = [
  'docs/testing/evidence/w5-custom-block-frontend-compile-raw.json',
  'docs/testing/evidence/w5-custom-block-postgres-raw.json',
] as const

async function readJson<T>(relative: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8')) as T
}

async function validateSourceClosure(
  relativeEvidencePath: string,
  evidence: Evidence,
  failures: string[]
): Promise<void> {
  if (evidence.inventoryId !== inventoryId) {
    failures.push(`${relativeEvidencePath}: inventoryId is ${evidence.inventoryId}`)
  }
  if (evidence.sourceClosure.length === 0) {
    failures.push(`${relativeEvidencePath}: sourceClosure is empty`)
  }
  for (const entry of evidence.sourceClosure) {
    const absolute = path.resolve(root, entry.path)
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
      failures.push(`${relativeEvidencePath}: source path escapes repository: ${entry.path}`)
      continue
    }
    try {
      const source = await readFile(absolute)
      const bytes = (await stat(absolute)).size
      const sha256 = createHash('sha256').update(source).digest('hex')
      if (entry.bytes !== bytes) {
        failures.push(`${relativeEvidencePath}: ${entry.path} bytes ${entry.bytes} != ${bytes}`)
      }
      if (entry.sha256 !== sha256) {
        failures.push(`${relativeEvidencePath}: ${entry.path} sha256 is stale`)
      }
    } catch {
      failures.push(`${relativeEvidencePath}: missing source ${entry.path}`)
    }
  }
}

async function main(): Promise<void> {
  const failures: string[] = []
  const [coverage, compile, budget, postgres, packageJson, workflow] = await Promise.all([
    readJson<Coverage>('docs/testing/api-w5-custom-block-coverage.json'),
    readJson<CompileEvidence>(evidencePaths[0]),
    readJson<CompileBudget>('docs/testing/w5-custom-block-frontend-compile-budget.json'),
    readJson<PostgresEvidence>(evidencePaths[1]),
    readJson<{ scripts: Record<string, string> }>('package.json'),
    readFile(path.join(root, '.github', 'workflows', 'test-build.yml'), 'utf8'),
  ])

  const expectedInventory = [
    ...new Set(customBlockRoutesV1.map((route) => route.inventoryId)),
  ].sort()
  if (JSON.stringify([...coverage.inventory].sort()) !== JSON.stringify(expectedInventory)) {
    failures.push(`coverage inventory must equal ${expectedInventory.join(', ')}`)
  }
  if (coverage.routes !== customBlockRoutesV1.length) {
    failures.push(`coverage routes ${coverage.routes} != ${customBlockRoutesV1.length}`)
  }
  const methodPathPairs = customBlockRoutesV1.reduce(
    (total, route) => total + route.methods.length,
    0
  )
  if (coverage.methodPathPairs !== methodPathPairs) {
    failures.push(`coverage methodPathPairs ${coverage.methodPathPairs} != ${methodPathPairs}`)
  }
  if (coverage.acceptedLedgerUpdated) {
    failures.push('accepted ledger must remain unchanged before independent approval')
  }

  if (compile.entrypoint !== 'apps/sim/hooks/queries/custom-blocks.ts') {
    failures.push(`compile evidence entrypoint drifted to ${compile.entrypoint}`)
  }
  if (
    compile.invalidation.originalSha256 !== compile.invalidation.restoredSha256 ||
    compile.samples.cold.sourceSha256 !== compile.invalidation.originalSha256
  ) {
    failures.push('compile invalidation did not restore the measured entrypoint')
  }
  if (budget.inventoryId !== inventoryId) failures.push('compile budget inventoryId drifted')
  if (compile.samples.cold.durationMs > budget.budgets.coldCompileMs) {
    failures.push('cold compile sample exceeds budget')
  }
  if (compile.samples.incremental.durationMs > budget.budgets.incrementalCompileMs) {
    failures.push('incremental compile sample exceeds budget')
  }

  if (
    postgres.database.majorVersion !== 16 ||
    !postgres.database.disposable ||
    postgres.result.testsPassed !== 2 ||
    postgres.result.testsFailed !== 0
  ) {
    failures.push('PostgreSQL evidence must be a passing disposable PostgreSQL 16 run')
  }
  if (
    postgres.queryRatchets.listHydrationQueries !== 1 ||
    postgres.queryRatchets.usageQueries !== 2 ||
    postgres.queryRatchets.perRowDeploymentQueriesAllowed !== 0
  ) {
    failures.push('PostgreSQL query-count ratchets drifted')
  }
  for (const required of [
    'cross-tenant workflow binding is unreadable and immutable',
    'all five donor input trigger types',
    'current and legacy input locations',
    'query counts remain constant as rows grow',
  ]) {
    if (!postgres.coverage.includes(required)) {
      failures.push(`PostgreSQL evidence is missing coverage: ${required}`)
    }
  }

  for (const relative of evidencePaths) {
    await validateSourceClosure(
      relative,
      relative === evidencePaths[0] ? compile : postgres,
      failures
    )
  }

  const requiredScripts = {
    'check:w5-custom-block-coverage': 'bun run scripts/api/check-w5-custom-block-coverage.ts',
    'check:w5-custom-block-boundary':
      'bun run scripts/architecture/import-boundaries/check-custom-block-module-boundary.ts',
    'check:w5-custom-block-frontend-compile':
      'bun run scripts/architecture/performance/provider-model-discovery-frontend-compile-ratchet.ts --w5 --check',
  }
  for (const [name, command] of Object.entries(requiredScripts)) {
    if (packageJson.scripts[name] !== command) failures.push(`package script ${name} drifted`)
    if (!workflow.includes(`bun run ${name}`)) failures.push(`CI does not run ${name}`)
  }

  if (failures.length > 0) {
    console.error('W5 custom-block coverage violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log(
    'W5 custom-block coverage OK: 4/4 inventories, immutable source evidence, query and compile ratchets enforced'
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
