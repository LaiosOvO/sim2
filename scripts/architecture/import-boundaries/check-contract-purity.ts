#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

interface PackageManifest {
  dependencies?: Record<string, string>
}

interface ContractPackage {
  directory: string
  allowedRuntimeDependencies: Set<string>
}

const root = path.resolve(import.meta.dir, '..', '..', '..')
const packages: ContractPackage[] = [
  {
    directory: 'packages/api-contracts',
    allowedRuntimeDependencies: new Set(['zod']),
  },
  {
    directory: 'packages/execution-contracts',
    allowedRuntimeDependencies: new Set(['@sim/api-contracts', 'zod']),
  },
  {
    directory: 'packages/tool-catalog',
    allowedRuntimeDependencies: new Set(['zod']),
  },
  {
    directory: 'packages/polaris-extension-sdk',
    allowedRuntimeDependencies: new Set(),
  },
]
const forbiddenImports = [
  'next',
  'react',
  '@sim/db',
  '@sim/auth',
  '@sim/runtime-secrets',
  'isolated-vm',
  'e2b',
  '@daytonaio/',
  '@larksuiteoapi/node-sdk',
  'node:',
]
const forbiddenSourceMarkers = ['process.env', 'Buffer.', 'apps/sim/', '/executor/', '/registry']
const importPattern = /\b(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

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

async function main(): Promise<void> {
  const failures: string[] = []
  for (const contractPackage of packages) {
    const packageDirectory = path.join(root, contractPackage.directory)
    const manifest = JSON.parse(
      await readFile(path.join(packageDirectory, 'package.json'), 'utf8')
    ) as PackageManifest
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (!contractPackage.allowedRuntimeDependencies.has(dependency)) {
        failures.push(`${contractPackage.directory}: forbidden runtime dependency ${dependency}`)
      }
    }

    for (const file of await sourceFiles(path.join(packageDirectory, 'src'))) {
      const content = await readFile(file, 'utf8')
      importPattern.lastIndex = 0
      for (const match of content.matchAll(importPattern)) {
        const specifier = match[1]
        if (
          forbiddenImports.some(
            (forbidden) => specifier === forbidden || specifier.startsWith(forbidden)
          )
        ) {
          failures.push(`${path.relative(root, file)}: forbidden import ${specifier}`)
        }
      }
      for (const marker of forbiddenSourceMarkers) {
        if (content.includes(marker)) {
          failures.push(`${path.relative(root, file)}: forbidden source marker ${marker}`)
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error('Contract purity violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(`Contract purity OK: ${packages.length} packages`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
