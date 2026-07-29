#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const consumers = [
  'apps/sim/blocks/integration-matcher.ts',
  'apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/copilot/components/user-input/hooks/use-mention-data.ts',
]
const forbidden = [
  '@/blocks/registry',
  '@/blocks/registry-maps',
  '@/tools/registry',
  '@/executor',
  '@/lib/execution',
]

async function main(): Promise<void> {
  const failures: string[] = []
  for (const consumer of consumers) {
    const content = await readFile(path.join(root, consumer), 'utf8')
    if (!content.includes('@/lib/catalog/client')) {
      failures.push(`${consumer}: generated catalog client import is missing`)
    }
    for (const specifier of forbidden) {
      if (content.includes(specifier)) failures.push(`${consumer}: contains ${specifier}`)
    }
  }

  if (failures.length > 0) {
    console.error('Catalog consumer boundary violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(`Catalog consumer boundary OK: ${consumers.length} canvas consumers`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
