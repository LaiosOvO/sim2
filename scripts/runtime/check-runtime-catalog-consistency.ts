#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { RUNTIME_TOOL_DECLARATIONS } from '../../apps/worker/src/runtime/registry/declarations'

interface CatalogShard {
  catalogHash: string
  provider: string
  items: Array<{
    capabilities: string[]
  }>
}

const root = path.resolve(import.meta.dir, '..', '..')
const catalogDirectory = path.join(root, 'packages', 'tool-catalog', 'generated')

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(catalogDirectory, 'catalog.manifest.json'), 'utf8')
  ) as { catalogHash: string }
  const failures: string[] = []
  const seenIds = new Set<string>()

  for (const declaration of RUNTIME_TOOL_DECLARATIONS) {
    for (const id of [declaration.toolId, ...declaration.aliases]) {
      if (seenIds.has(id)) failures.push(`duplicate runtime tool ID or alias: ${id}`)
      seenIds.add(id)
    }

    const shardPath = path.join(catalogDirectory, 'providers', `${declaration.providerId}.json`)
    let shard: CatalogShard
    try {
      shard = JSON.parse(await readFile(shardPath, 'utf8')) as CatalogShard
    } catch {
      failures.push(`missing catalog shard for provider ${declaration.providerId}`)
      continue
    }
    if (shard.provider !== declaration.providerId) {
      failures.push(
        `${declaration.providerId}: shard declares unexpected provider ${shard.provider}`
      )
    }
    if (shard.catalogHash !== manifest.catalogHash) {
      failures.push(`${declaration.providerId}: shard catalog hash is stale`)
    }
    const capabilities = new Set(shard.items.flatMap((item) => item.capabilities))
    for (const id of [declaration.toolId, ...declaration.aliases]) {
      if (!capabilities.has(id)) {
        failures.push(`${declaration.providerId}: runtime tool ${id} is absent from catalog`)
      }
    }
  }

  if (failures.length > 0) {
    console.error('Runtime registry/catalog consistency violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(
    `Runtime registry/catalog consistency OK: ${RUNTIME_TOOL_DECLARATIONS.length} ` +
      `declaration(s), ${seenIds.size} canonical/legacy IDs`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
