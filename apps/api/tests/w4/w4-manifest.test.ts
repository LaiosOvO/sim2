import { describe, expect, it } from 'vitest'
import {
  validateW4Manifest,
  W4_EXPECTED_BATCH_COUNTS,
  W4_TOOL_ROUTE_MANIFEST,
} from '@/modules/tool-adapters'

describe('W4 A-L generated route manifest', () => {
  it('covers the exact four documented batches without awarding behavior completion', () => {
    const validation = validateW4Manifest(W4_TOOL_ROUTE_MANIFEST)

    expect(validation.routeCount).toBe(340)
    expect(validation.batchCounts).toEqual(W4_EXPECTED_BATCH_COUNTS)
    expect(validation.methodCount).toBeGreaterThanOrEqual(340)
  })

  it('binds every descriptor to inventory, legacy source, rollout, and required evidence', () => {
    for (const route of W4_TOOL_ROUTE_MANIFEST) {
      expect(route.inventoryId).toMatch(/^API-\d{4}$/)
      expect(route.pathTemplate).toMatch(new RegExp(`^/api/tools/${route.provider}(?:/|$)`))
      expect(route.legacyHandlerSource).toBe(
        `apps/sim/app${route.pathTemplate}/route.ts`.replaceAll('\\', '/')
      )
      expect(route.rolloutKey).toBe(`tool-adapter:${route.provider}`)
      expect(route.requiredTests).toEqual(expect.arrayContaining(['C', 'A', 'D', 'I', 'S']))
    }
  })
})
