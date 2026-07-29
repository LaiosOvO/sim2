#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import path from 'node:path'

interface BundlePolicy {
  schemaVersion: number
  forbiddenRuntimeMarkers: string[]
  allowedHeavyChunks: Array<{ marker: string; scope: string }>
  budgets: Record<string, number>
  enforcement: {
    current: string
    strictBundleScanActivation: string
  }
}

interface PerformanceBaseline {
  targetBudgets: Record<string, number>
}

const root = path.resolve(import.meta.dir, '..', '..', '..')
const policyPath = path.join(root, 'docs', 'testing', 'browser-bundle-policy.json')
const baselinePath = path.join(root, 'docs', 'testing', 'performance-baseline.json')

async function main(): Promise<void> {
  const policy = JSON.parse(await readFile(policyPath, 'utf8')) as BundlePolicy
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as PerformanceBaseline
  const failures: string[] = []

  if (policy.schemaVersion !== 1) failures.push('schemaVersion must be 1')
  if (policy.forbiddenRuntimeMarkers.length === 0) {
    failures.push('forbiddenRuntimeMarkers must not be empty')
  }
  if (new Set(policy.forbiddenRuntimeMarkers).size !== policy.forbiddenRuntimeMarkers.length) {
    failures.push('forbiddenRuntimeMarkers must be unique')
  }
  for (const allowed of policy.allowedHeavyChunks) {
    if (!allowed.marker.trim() || !allowed.scope.trim()) {
      failures.push('every allowed heavy chunk requires a marker and a narrow scope')
    }
  }
  for (const [name, budget] of Object.entries(policy.budgets)) {
    if (!Number.isInteger(budget) || budget <= 0)
      failures.push(`${name} must be a positive integer`)
  }

  const ordinaryBudget = policy.budgets.ordinaryPageIncrementalClientGzipBytes
  if (ordinaryBudget !== baseline.targetBudgets.ordinaryPageIncrementalClientGzipBytes) {
    failures.push('ordinary page budget differs from performance-baseline.json')
  }
  if (!policy.enforcement.current.includes('ratchet')) {
    failures.push('current transitional enforcement must explicitly name the ratchet')
  }
  if (!policy.enforcement.strictBundleScanActivation.trim()) {
    failures.push('strict bundle scan activation condition is required')
  }

  if (failures.length > 0) {
    console.error('Browser bundle policy violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(
    `Browser bundle policy OK: ${policy.forbiddenRuntimeMarkers.length} forbidden markers, ` +
      `${policy.allowedHeavyChunks.length} scoped heavy dependencies`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
