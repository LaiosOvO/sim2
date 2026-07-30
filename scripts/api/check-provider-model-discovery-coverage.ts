#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { providerModelDiscoveryRoutesV1 } from '@sim/api-contracts/provider-model-discovery-routes'

interface Coverage {
  inventoryCount: number
  routes: Array<{
    inventoryId: string
    method: string
    path: string
    provider: string
    authMode: string
    backend: string
  }>
  evidence: Record<string, string>
}

const root = path.resolve(import.meta.dir, '..', '..')

async function main(): Promise<void> {
  const coverage = JSON.parse(
    await readFile(
      path.join(root, 'docs', 'testing', 'api-w2-provider-model-discovery-coverage.json'),
      'utf8'
    )
  ) as Coverage
  const failures: string[] = []

  if (coverage.inventoryCount !== 9) failures.push(`coverage count is ${coverage.inventoryCount}`)
  if (coverage.routes.length !== 9) failures.push(`route count is ${coverage.routes.length}`)
  const routeById = new Map(coverage.routes.map((route) => [route.inventoryId, route]))
  for (const expected of providerModelDiscoveryRoutesV1) {
    const route = routeById.get(expected.inventoryId)
    if (!route) {
      failures.push(`${expected.inventoryId}: missing coverage`)
      continue
    }
    if (route.method !== 'GET') failures.push(`${expected.inventoryId}: method drift`)
    if (route.path !== expected.path) failures.push(`${expected.inventoryId}: path drift`)
    if (route.provider !== expected.provider)
      failures.push(`${expected.inventoryId}: provider drift`)
    const expectedAuth = expected.workspaceAware
      ? 'public-with-optional-workspace-session'
      : 'public'
    if (route.authMode !== expectedAuth) failures.push(`${expected.inventoryId}: auth drift`)
    if (route.backend !== 'native-pending-review') {
      failures.push(`${expected.inventoryId}: backend must remain native-pending-review`)
    }
  }

  for (const [name, relative] of Object.entries(coverage.evidence)) {
    try {
      await readFile(path.join(root, relative), 'utf8')
    } catch {
      failures.push(`${name}: missing evidence ${relative}`)
    }
  }

  if (failures.length > 0) {
    console.error('Provider model discovery coverage violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log('Provider model discovery coverage OK: 9/9 native routes with C/A/D/I/HTTP evidence')
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
