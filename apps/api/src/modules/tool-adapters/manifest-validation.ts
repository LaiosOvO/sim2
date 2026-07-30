import type { W4ToolRouteDescriptor } from '@/modules/tool-adapters/contracts'

export const W4_EXPECTED_BATCH_COUNTS = {
  'A-B': 77,
  'C-D': 124,
  'E-H': 47,
  'I-L': 92,
} as const

export type W4ManifestValidation = {
  readonly batchCounts: Readonly<Record<string, number>>
  readonly methodCount: number
  readonly routeCount: number
}

/**
 * Enforces inventory coverage only; it deliberately does not award migration
 * completion without provider behavior evidence.
 */
export function validateW4Manifest(
  manifest: readonly W4ToolRouteDescriptor[]
): W4ManifestValidation {
  const inventoryIds = new Set<string>()
  const methodPaths = new Set<string>()
  const batchCounts: Record<string, number> = {}

  for (const route of manifest) {
    if (inventoryIds.has(route.inventoryId)) {
      throw new Error(`Duplicate inventory id ${route.inventoryId}`)
    }
    inventoryIds.add(route.inventoryId)
    batchCounts[route.batch] = (batchCounts[route.batch] ?? 0) + 1
    if (!route.legacyHandlerSource.endsWith('/route.ts')) {
      throw new Error(`Missing legacy source binding for ${route.inventoryId}`)
    }
    if (route.requiredTests.length === 0) {
      throw new Error(`Missing test requirements for ${route.inventoryId}`)
    }
    for (const method of route.methods) {
      const key = `${method} ${route.pathTemplate}`
      if (methodPaths.has(key)) {
        throw new Error(`Duplicate method/path ${key}`)
      }
      methodPaths.add(key)
    }
  }

  for (const [batch, expected] of Object.entries(W4_EXPECTED_BATCH_COUNTS)) {
    if (batchCounts[batch] !== expected) {
      throw new Error(`Expected ${expected} ${batch} routes, received ${batchCounts[batch] ?? 0}`)
    }
  }
  if (manifest.length !== 340) {
    throw new Error(`Expected 340 W4 A-L routes, received ${manifest.length}`)
  }
  return {
    batchCounts,
    methodCount: methodPaths.size,
    routeCount: manifest.length,
  }
}
