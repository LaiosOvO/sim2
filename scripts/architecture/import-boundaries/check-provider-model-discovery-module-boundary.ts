#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const moduleRoot = path.join(root, 'apps', 'api', 'src', 'modules', 'provider-model-discovery')
const forbiddenMarkers = [
  '@sim/db',
  '@/infrastructure/',
  'drizzle-orm',
  'process.env',
  'next/',
  'react',
  'apps/sim/',
  '/tools/registry',
  '/blocks/registry',
  '/executor/',
  '/sandbox/',
  'workspaceBYOKKeys',
  'ENCRYPTION_KEY',
]

async function sourceFiles(directory: string): Promise<string[]> {
  const results: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await sourceFiles(absolute)))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      results.push(absolute)
    }
  }
  return results
}

async function main(): Promise<void> {
  const failures: string[] = []
  const files = await sourceFiles(moduleRoot)
  for (const file of files) {
    const content = await readFile(file, 'utf8')
    for (const marker of forbiddenMarkers) {
      if (content.toLowerCase().includes(marker.toLowerCase())) {
        failures.push(`${path.relative(root, file)} contains forbidden marker ${marker}`)
      }
    }
  }
  if (failures.length > 0) {
    console.error('Provider model discovery module-boundary violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log(`Provider model discovery module boundary OK: ${files.length} files`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
