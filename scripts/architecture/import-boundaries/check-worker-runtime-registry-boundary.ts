#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const workerRoot = path.join(root, 'apps', 'worker')
const registryRoot = path.join(workerRoot, 'src', 'runtime', 'registry')
const compositionRoot = path.join(workerRoot, 'src', 'bootstrap', 'composition')
const sourcePattern = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const skipped = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage'])
const importPattern =
  /\b(?:from\s+|import\s*\(\s*|require\s*\(\s*|export\s+(?:\*|\{[^}]*\})\s+from\s+)['"]([^'"]+)['"]/g

async function walk(directory: string, results: string[] = []): Promise<string[]> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await walk(absolute, results)
    } else if (sourcePattern.test(entry.name)) {
      results.push(absolute)
    }
  }
  return results
}

function isWithin(file: string, directory: string): boolean {
  const relative = path.relative(directory, file)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function importedSpecifiers(content: string): string[] {
  importPattern.lastIndex = 0
  return [...content.matchAll(importPattern)].map((match) => match[1])
}

async function main(): Promise<void> {
  const failures: string[] = []
  const workerManifest = JSON.parse(
    await readFile(path.join(workerRoot, 'package.json'), 'utf8')
  ) as { exports?: unknown }
  if (workerManifest.exports !== undefined) {
    failures.push('apps/worker/package.json must not export the Worker runtime to other workspaces')
  }

  for (const file of await walk(path.join(workerRoot, 'src'))) {
    const content = await readFile(file, 'utf8')
    for (const specifier of importedSpecifiers(content)) {
      if (specifier !== '@/runtime/registry') continue
      if (!isWithin(file, compositionRoot) && !isWithin(file, registryRoot)) {
        failures.push(
          `${path.relative(root, file)} imports the Runtime Registry public entry outside composition`
        )
      }
    }
  }

  for (const directory of [
    path.join(root, 'apps', 'sim'),
    path.join(root, 'apps', 'api'),
    path.join(root, 'packages'),
    path.join(root, 'extensions'),
  ]) {
    for (const file of await walk(directory)) {
      const content = await readFile(file, 'utf8')
      for (const specifier of importedSpecifiers(content)) {
        if (
          specifier === '@sim/worker' ||
          specifier.startsWith('@sim/worker/') ||
          specifier.includes('apps/worker/src/runtime/registry')
        ) {
          failures.push(
            `${path.relative(root, file)} imports Worker Runtime Registry through ${specifier}`
          )
        }
      }
    }
  }

  const catalogSource = await walk(path.join(root, 'packages', 'tool-catalog', 'src'))
  for (const file of catalogSource) {
    const content = await readFile(file, 'utf8')
    if (content.includes('apps/worker') || content.includes('runtime/registry')) {
      failures.push(`${path.relative(root, file)} couples Catalog back to Runtime Registry`)
    }
  }

  if (failures.length > 0) {
    console.error('Worker Runtime Registry boundary violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(
    'Worker Runtime Registry boundary OK: no package export, browser/API/Catalog import, or ' +
      'composition bypass'
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
