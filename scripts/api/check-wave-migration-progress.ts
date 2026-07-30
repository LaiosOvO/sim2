#!/usr/bin/env bun
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

interface ProgressWave {
  wave: string
  plannedCount: number
  halfTarget: number
  completedInventoryIds: string[]
}

interface ProgressLedger {
  schemaVersion: number
  inventoryTotal: number
  acceptance: string[]
  independentReviewGate: {
    enforcedFrom: string
    routes: ReviewEvidence[]
  }
  waves: ProgressWave[]
}

interface ReviewEvidence {
  inventoryId: string
  status: 'pending' | 'approved' | 'changes-required'
  implementationAgent: string
  reviewerAgent: string | null
  implementationEvidence: string
  reviewEvidence: string | null
}

interface InventoryRoute {
  inventoryId: string
  wave: string
}

const root = path.resolve(import.meta.dir, '..', '..')
const enforceHalf = process.argv.includes('--enforce-half')

function inventoryRoutes(markdown: string): InventoryRoute[] {
  const routes: InventoryRoute[] = []
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith('| API-')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    const inventoryId = cells[0]
    const wave = cells[10]
    if (inventoryId && /^W[1-8]$/.test(wave ?? '')) {
      routes.push({ inventoryId, wave })
    }
  }
  return routes
}

async function main(): Promise<void> {
  const ledger = JSON.parse(
    await readFile(path.join(root, 'docs', 'testing', 'api-wave-migration-progress.json'), 'utf8')
  ) as ProgressLedger
  const inventory = inventoryRoutes(
    await readFile(path.join(root, 'docs', 'architecture', 'api-migration-inventory.md'), 'utf8')
  )
  const inventoryById = new Map(inventory.map((route) => [route.inventoryId, route]))
  const failures: string[] = []
  const seen = new Set<string>()

  if (ledger.schemaVersion !== 2) failures.push(`unsupported schemaVersion ${ledger.schemaVersion}`)
  if (ledger.acceptance.length < 4) failures.push('acceptance evidence is underspecified')
  if (inventory.length !== ledger.inventoryTotal) {
    failures.push(
      `inventory total ${inventory.length} does not match ledger ${ledger.inventoryTotal}`
    )
  }

  for (const wave of ledger.waves) {
    const inventoryCount = inventory.filter((route) => route.wave === wave.wave).length
    if (inventoryCount !== wave.plannedCount) {
      failures.push(`${wave.wave}: inventory=${inventoryCount}, ledger=${wave.plannedCount}`)
    }
    if (wave.halfTarget !== Math.ceil(wave.plannedCount / 2)) {
      failures.push(`${wave.wave}: halfTarget must be ${Math.ceil(wave.plannedCount / 2)}`)
    }
    for (const inventoryId of wave.completedInventoryIds) {
      const route = inventoryById.get(inventoryId)
      if (!route) {
        failures.push(`${wave.wave}: unknown completed route ${inventoryId}`)
      } else if (route.wave !== wave.wave) {
        failures.push(`${inventoryId}: belongs to ${route.wave}, not ${wave.wave}`)
      }
      if (seen.has(inventoryId)) failures.push(`${inventoryId}: completed more than once`)
      seen.add(inventoryId)
    }
    if (enforceHalf && wave.completedInventoryIds.length < wave.halfTarget) {
      failures.push(
        `${wave.wave}: ${wave.completedInventoryIds.length}/${wave.plannedCount}, ` +
          `${wave.halfTarget - wave.completedInventoryIds.length} short of 50%`
      )
    }
  }

  const reviewedRoutes = new Set<string>()
  for (const review of ledger.independentReviewGate.routes) {
    const route = inventoryById.get(review.inventoryId)
    if (!route) failures.push(`review gate: unknown route ${review.inventoryId}`)
    if (reviewedRoutes.has(review.inventoryId)) {
      failures.push(`review gate: duplicate route ${review.inventoryId}`)
    }
    reviewedRoutes.add(review.inventoryId)
    if (!review.implementationAgent.trim()) {
      failures.push(`${review.inventoryId}: missing implementation agent`)
    }
    try {
      await access(path.join(root, review.implementationEvidence))
    } catch {
      failures.push(`${review.inventoryId}: missing ${review.implementationEvidence}`)
    }

    if (review.status === 'approved') {
      if (!seen.has(review.inventoryId)) {
        failures.push(`${review.inventoryId}: approved review must be in accepted route ledger`)
      }
      if (!review.reviewerAgent?.trim()) {
        failures.push(`${review.inventoryId}: approved review has no reviewer agent`)
      } else if (review.reviewerAgent === review.implementationAgent) {
        failures.push(`${review.inventoryId}: implementation and review agents must be different`)
      }
      if (!review.reviewEvidence) {
        failures.push(`${review.inventoryId}: approved review has no review evidence`)
      } else {
        try {
          await access(path.join(root, review.reviewEvidence))
        } catch {
          failures.push(`${review.inventoryId}: missing ${review.reviewEvidence}`)
        }
      }
    } else if (seen.has(review.inventoryId)) {
      failures.push(
        `${review.inventoryId}: ${review.status} independent review cannot be counted as accepted`
      )
    }
  }

  if (failures.length > 0) {
    console.error('API wave migration progress violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  for (const wave of ledger.waves) {
    const completed = wave.completedInventoryIds.length
    const percent = ((completed / wave.plannedCount) * 100).toFixed(1)
    const deficit = Math.max(0, wave.halfTarget - completed)
    console.log(
      `${wave.wave}: ${completed}/${wave.plannedCount} (${percent}%), ` +
        `50% target=${wave.halfTarget}, deficit=${deficit}`
    )
  }
  console.log(`Accepted native routes: ${seen.size}/${ledger.inventoryTotal}`)
  const reviewSummary = ledger.independentReviewGate.routes.reduce(
    (summary, route) => {
      summary[route.status] += 1
      return summary
    },
    { approved: 0, pending: 0, 'changes-required': 0 }
  )
  console.log(
    `Independent review gate: approved=${reviewSummary.approved}, ` +
      `pending=${reviewSummary.pending}, changes-required=${reviewSummary['changes-required']}`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
