#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const moduleDirectory = path.join(root, 'apps/api/src/modules/workspace-forking')
const adapterPaths = [
  'apps/api/src/infrastructure/appconfig/appconfig-fork-rollout-reader.ts',
  'apps/api/src/infrastructure/postgres/repositories/drizzle-fork-entitlement-reader.ts',
  'apps/api/src/infrastructure/postgres/repositories/drizzle-platform-admin-reader.ts',
  'apps/api/src/infrastructure/postgres/repositories/drizzle-workspace-fork-context-reader.ts',
].map((file) => path.join(root, file))
const contractPath = path.join(root, 'packages/api-contracts/src/workspace-forking.ts')
const appConfigDirectory = path.join(root, 'extensions/infra/appconfig/src')
const importPattern = /\b(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

const allowedModuleImports = new Set([
  '@sim/api-contracts/auth',
  '@sim/api-contracts/workspace-forking',
  '@sim/logger',
  '@/config/forking-runtime',
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
        specifier.startsWith('@/modules/workspace-forking/') ||
        allowedModuleImports.has(specifier)
      if (!allowed) {
        failures.push(`${path.relative(root, file)}: forbidden module import ${specifier}`)
      }
    }
    for (const marker of [
      'process.env',
      '@sim/db',
      '@sim/infra-appconfig',
      '@/infrastructure/',
      '@/lib/',
    ]) {
      if (content.includes(marker)) {
        failures.push(`${path.relative(root, file)}: forbidden module marker ${marker}`)
      }
    }
  }

  for (const adapterPath of adapterPaths) {
    const content = await readFile(adapterPath, 'utf8')
    for (const marker of [
      'next/',
      'react',
      '@/lib/',
      'executor',
      'sandbox',
      'tool-catalog',
      'registry',
    ]) {
      if (content.toLowerCase().includes(marker.toLowerCase())) {
        failures.push(`${path.relative(root, adapterPath)}: forbidden adapter marker ${marker}`)
      }
    }
  }

  for (const file of await sourceFiles(appConfigDirectory)) {
    const content = await readFile(file, 'utf8')
    for (const marker of ['next/', 'react', '@sim/db', 'executor', 'sandbox', 'registry']) {
      if (content.toLowerCase().includes(marker.toLowerCase())) {
        failures.push(`${path.relative(root, file)}: forbidden AppConfig marker ${marker}`)
      }
    }
  }

  for (const specifier of imports(await readFile(contractPath, 'utf8'))) {
    if (specifier !== 'zod') {
      failures.push(`${path.relative(root, contractPath)}: forbidden contract import ${specifier}`)
    }
  }

  if (failures.length > 0) {
    console.error('Workspace Forking module boundary violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(
    `Workspace Forking module boundary OK: ${moduleFiles.length} module files, ${adapterPaths.length} adapters, 1 AppConfig infra package, 1 contract`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
