#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const appDirectory = path.join(root, 'apps', 'workspace-web')
const sourceDirectory = path.join(appDirectory, 'src')
const allowedRuntimeDependencies = new Set(['react', 'react-dom'])
const forbiddenImportPrefixes = [
  '@/',
  'next',
  '@sim/',
  'node:',
  'server-only',
  'apps/sim',
  '../../sim',
]
const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return sourceFiles(entryPath)
      return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : []
    })
  )
  return nested.flat()
}

async function main(): Promise<void> {
  const failures: string[] = []
  const packageJson = JSON.parse(
    await readFile(path.join(appDirectory, 'package.json'), 'utf8')
  ) as {
    dependencies?: Record<string, string>
  }
  const runtimeDependencies = Object.keys(packageJson.dependencies ?? {})
  const unexpectedDependencies = runtimeDependencies.filter(
    (dependency) => !allowedRuntimeDependencies.has(dependency)
  )
  if (unexpectedDependencies.length > 0) {
    failures.push(
      `runtime dependencies must stay browser-only: ${unexpectedDependencies.join(', ')}`
    )
  }

  for (const file of await sourceFiles(sourceDirectory)) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2]
      if (!specifier) continue
      const forbiddenPrefix = forbiddenImportPrefixes.find(
        (prefix) => specifier === prefix || specifier.startsWith(prefix)
      )
      if (forbiddenPrefix) {
        failures.push(
          `${path.relative(root, file).replaceAll('\\', '/')}: forbidden import ${specifier}`
        )
      }
      if (specifier.startsWith('../')) {
        failures.push(
          `${path.relative(root, file).replaceAll('\\', '/')}: source import escapes app boundary (${specifier})`
        )
      }
    }
  }

  if (failures.length > 0) {
    console.error('Workspace Vite boundary violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(
    `Workspace Vite boundary passed: ${runtimeDependencies.join(', ')} are the only runtime dependencies`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
