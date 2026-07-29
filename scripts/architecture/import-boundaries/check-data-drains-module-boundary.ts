#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const moduleDirectory = path.join(root, 'apps/api/src/modules/data-drains')
const adapterPaths = [
  'apps/api/src/infrastructure/postgres/repositories/drizzle-data-drain-entitlement-reader.ts',
  'apps/api/src/infrastructure/postgres/repositories/drizzle-data-drain-run-read-repository.ts',
].map((file) => path.join(root, file))
const contractPath = path.join(root, 'packages/api-contracts/src/data-drains.ts')
const importPattern = /\b(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

const allowedModuleImports = new Set([
  '@sim/api-contracts/auth',
  '@sim/api-contracts/data-drains',
  '@sim/auth/authorization',
  '@sim/logger',
  '@/config/data-drain-runtime',
])

async function sourceFiles(directory: string): Promise<string[]> {
  const results: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await sourceFiles(absolute)))
    } else if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      results.push(absolute)
    }
  }
  return results
}

function imports(content: string): string[] {
  importPattern.lastIndex = 0
  return [...content.matchAll(importPattern)].map((match) => match[1])
}

async function main(): Promise<void> {
  const failures: string[] = []
  const moduleFiles = await sourceFiles(moduleDirectory)

  for (const file of moduleFiles) {
    const content = await readFile(file, 'utf8')
    for (const specifier of imports(content)) {
      const allowed =
        specifier.startsWith('.') ||
        specifier.startsWith('@/modules/data-drains/') ||
        allowedModuleImports.has(specifier)
      if (!allowed) {
        failures.push(`${path.relative(root, file)}: forbidden module import ${specifier}`)
      }
    }
    for (const marker of ['process.env', '@sim/db', '@/infrastructure/', '@/lib/']) {
      if (content.includes(marker)) {
        failures.push(`${path.relative(root, file)}: forbidden module marker ${marker}`)
      }
    }
  }

  for (const adapterPath of adapterPaths) {
    const content = await readFile(adapterPath, 'utf8')
    for (const marker of ['next/', 'react', '@/lib/', 'destination', 'executor', 'registry']) {
      if (content.toLowerCase().includes(marker.toLowerCase())) {
        failures.push(`${path.relative(root, adapterPath)}: forbidden adapter marker ${marker}`)
      }
    }
  }

  for (const specifier of imports(await readFile(contractPath, 'utf8'))) {
    if (specifier !== 'zod') {
      failures.push(`${path.relative(root, contractPath)}: forbidden contract import ${specifier}`)
    }
  }

  if (failures.length > 0) {
    console.error('Data Drains module boundary violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(
    `Data Drains module boundary OK: ${moduleFiles.length} module files, ${adapterPaths.length} adapters, 1 contract`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
