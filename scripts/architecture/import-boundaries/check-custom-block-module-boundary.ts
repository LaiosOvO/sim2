#!/usr/bin/env bun
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const moduleRoot = path.join(root, 'apps', 'api', 'src', 'modules', 'custom-blocks')
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
  '@sim/security/encryption',
]
const facadePaths = [
  'apps/sim/app/api/blocks/visibility/route.ts',
  'apps/sim/app/api/custom-blocks/route.ts',
  'apps/sim/app/api/custom-blocks/[id]/route.ts',
  'apps/sim/app/api/custom-blocks/[id]/usages/route.ts',
]

async function sourceFiles(directory: string): Promise<string[]> {
  const results: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) results.push(...(await sourceFiles(absolute)))
    else if (/\.(ts|tsx)$/.test(entry.name)) results.push(absolute)
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
  for (const relative of facadePaths) {
    const absolute = path.join(root, relative)
    const bytes = (await stat(absolute)).size
    const source = await readFile(absolute, 'utf8')
    if (bytes > 1_500) failures.push(`${relative} is ${bytes} bytes; facade ceiling is 1,500`)
    for (const marker of ['@sim/db', 'drizzle-orm', '@/blocks/', '@/executor/', '@/tools/']) {
      if (source.includes(marker)) failures.push(`${relative} contains forbidden marker ${marker}`)
    }
  }
  if (failures.length > 0) {
    console.error('Custom-block module-boundary violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log(
    `Custom-block module boundary OK: ${files.length} module files, ${facadePaths.length} thin facades`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
