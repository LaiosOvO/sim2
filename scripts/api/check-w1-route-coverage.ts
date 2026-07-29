#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import path from 'node:path'

interface CoverageRecord {
  inventoryCount: number
  routes: Array<{
    inventoryId: string
    methods: string[]
    path: string
    apiModule: string
    nextFacade: string
    tests: string[]
  }>
}

const root = path.resolve(import.meta.dir, '..', '..')
const requiredTestKinds = ['contract', 'differential', 'integration', 'performance']

function inventoryW1Rows(content: string): Array<{
  inventoryId: string
  methods: string[]
  path: string
}> {
  return content
    .split(/\r?\n/)
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.length >= 11 && cells[10] === 'W1')
    .map((cells) => ({
      inventoryId: cells[0],
      methods: cells[1].split(',').map((method) => method.trim()),
      path: cells[2].replaceAll('`', ''),
    }))
}

async function main(): Promise<void> {
  const inventory = inventoryW1Rows(
    await readFile(path.join(root, 'docs', 'architecture', 'api-migration-inventory.md'), 'utf8')
  )
  const coverage = JSON.parse(
    await readFile(path.join(root, 'docs', 'testing', 'api-w1-route-coverage.json'), 'utf8')
  ) as CoverageRecord
  const failures: string[] = []

  if (inventory.length !== 3)
    failures.push(`inventory contains ${inventory.length} W1 rows, expected 3`)
  if (coverage.inventoryCount !== inventory.length) {
    failures.push(
      `coverage count ${coverage.inventoryCount} does not match inventory ${inventory.length}`
    )
  }
  const coverageById = new Map(coverage.routes.map((route) => [route.inventoryId, route]))
  for (const row of inventory) {
    const route = coverageById.get(row.inventoryId)
    if (!route) {
      failures.push(`${row.inventoryId}: missing coverage record`)
      continue
    }
    if (route.path !== row.path) failures.push(`${row.inventoryId}: path mismatch`)
    if (JSON.stringify(route.methods) !== JSON.stringify(row.methods)) {
      failures.push(`${row.inventoryId}: method mismatch`)
    }
    for (const testKind of requiredTestKinds) {
      if (!route.tests.includes(testKind))
        failures.push(`${row.inventoryId}: missing ${testKind} test`)
    }
    const facade = await readFile(path.join(root, route.nextFacade), 'utf8')
    if (!facade.includes('proxyW1Request')) {
      failures.push(`${row.inventoryId}: Next facade does not use proxyW1Request`)
    }
    for (const marker of ['@sim/db', '@/lib/auth', 'encryption', 'registry', 'executor']) {
      if (facade.includes(marker)) failures.push(`${row.inventoryId}: facade contains ${marker}`)
    }
  }
  for (const route of coverage.routes) {
    try {
      await readFile(
        path.join(
          root,
          route.apiModule,
          'application',
          `create-${path.basename(route.apiModule)}-module.ts`
        )
      )
    } catch {
      failures.push(`${route.inventoryId}: API module implementation is missing`)
    }
  }

  if (failures.length > 0) {
    console.error('W1 route coverage violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log('W1 route coverage OK: 3/3 inventory paths with C/D/I/P evidence')
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
