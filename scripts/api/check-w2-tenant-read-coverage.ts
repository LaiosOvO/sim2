#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { w2TenantReadRouteContracts } from '@sim/api-contracts/w2-tenant-read'

interface InventoryRow {
  inventoryId: string
  methods: string[]
  path: string
  domain: string
}

interface CoverageRecord {
  inventoryCount: number
  routes: Array<{
    inventoryId: string
    methods: string[]
    path: string
    authMode: string
    apiModule: string
    nextFacade: string
    tests: string[]
    backend: string
  }>
}

const root = path.resolve(import.meta.dir, '..', '..')
const selectedDomains = new Set([
  'workspaces',
  'organizations',
  'users',
  'invitations',
  'permission-groups',
  'workspace-events',
  'stars',
])
const requiredTests = ['contract', 'auth', 'differential', 'integration']

function inventoryRows(content: string): InventoryRow[] {
  return content
    .split(/\r?\n/)
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.length >= 11 && cells[10] === 'W2')
    .map((cells) => {
      const pathValue = cells[2].replaceAll('`', '')
      return {
        inventoryId: cells[0],
        methods: cells[1].split(',').map((method) => method.trim()),
        path: pathValue,
        domain: pathValue.split('/')[2] ?? '',
      }
    })
    .filter((row) => selectedDomains.has(row.domain))
}

async function main(): Promise<void> {
  const inventory = inventoryRows(
    await readFile(path.join(root, 'docs', 'architecture', 'api-migration-inventory.md'), 'utf8')
  )
  const coverage = JSON.parse(
    await readFile(path.join(root, 'docs', 'testing', 'api-w2-tenant-read-coverage.json'), 'utf8')
  ) as CoverageRecord
  const failures: string[] = []

  if (inventory.length !== 22)
    failures.push(`inventory selector returned ${inventory.length}, not 22`)
  if (coverage.inventoryCount !== 22) failures.push(`coverage count is ${coverage.inventoryCount}`)
  if (w2TenantReadRouteContracts.length !== 22) {
    failures.push(`contract count is ${w2TenantReadRouteContracts.length}`)
  }

  const inventoryById = new Map(inventory.map((row) => [row.inventoryId, row]))
  const contractById = new Map(
    w2TenantReadRouteContracts.map((route) => [route.inventoryId, route])
  )
  const coverageIds = new Set<string>()
  for (const route of coverage.routes) {
    if (coverageIds.has(route.inventoryId))
      failures.push(`${route.inventoryId}: duplicate coverage`)
    coverageIds.add(route.inventoryId)
    const inventoryRow = inventoryById.get(route.inventoryId)
    if (!inventoryRow) {
      failures.push(`${route.inventoryId}: not selected by inventory`)
      continue
    }
    if (route.path !== inventoryRow.path) failures.push(`${route.inventoryId}: path mismatch`)
    if (JSON.stringify(route.methods) !== JSON.stringify(inventoryRow.methods)) {
      failures.push(`${route.inventoryId}: methods mismatch`)
    }
    if (route.backend !== contractById.get(route.inventoryId)?.backend) {
      failures.push(`${route.inventoryId}: backend status mismatch`)
    }
    for (const test of requiredTests) {
      if (!route.tests.includes(test)) failures.push(`${route.inventoryId}: missing ${test}`)
    }
    const facade = await readFile(path.join(root, route.nextFacade), 'utf8')
    if (!facade.includes(`proxyW2TenantReadRequest(request, '${route.inventoryId}')`)) {
      failures.push(`${route.inventoryId}: stale facade binding`)
    }
    for (const marker of ['@sim/db', '@/lib/auth', 'drizzle-orm', '/executor/', '/registry']) {
      if (facade.includes(marker)) failures.push(`${route.inventoryId}: facade contains ${marker}`)
    }
  }
  for (const row of inventory) {
    if (!coverageIds.has(row.inventoryId)) failures.push(`${row.inventoryId}: missing coverage`)
  }

  if (failures.length > 0) {
    console.error('W2 tenant-read coverage violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log('W2 tenant-read coverage OK: 22/22 inventory paths with C/A/D/I evidence')
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
