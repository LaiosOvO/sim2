#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

interface PackageManifest {
  name?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const root = path.resolve(import.meta.dir, '..', '..', '..')
const fixedModuleRoots = [
  'apps/api',
  'apps/worker',
  'packages/api-contracts',
  'packages/execution-contracts',
  'packages/tool-catalog',
  'packages/polaris-extension-sdk',
]
const extensionRoots = ['extensions/biz', 'extensions/infra']
const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
const importPatterns = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g,
  /^\s*import\s+['"]([^'"]+)['"]/gm,
]

async function moduleRoots(): Promise<string[]> {
  const roots = fixedModuleRoots.map((directory) => path.join(root, directory))
  for (const extensionRoot of extensionRoots) {
    const absolute = path.join(root, extensionRoot)
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(path.join(absolute, entry.name))
    }
  }
  return roots
}

async function sourceFiles(directory: string, result: string[] = []): Promise<string[]> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage'].includes(entry.name)) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await sourceFiles(absolute, result)
    } else if (sourceExtensions.includes(path.extname(entry.name))) {
      result.push(absolute)
    }
  }
  return result
}

function importedSpecifiers(content: string): string[] {
  const specifiers = new Set<string>()
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0
    for (const match of content.matchAll(pattern)) {
      if (match[1]) specifiers.add(match[1])
    }
  }
  return [...specifiers]
}

function resolveRelative(source: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const candidate = path.resolve(path.dirname(source), specifier)
  const candidates = [
    candidate,
    ...sourceExtensions.map((extension) => `${candidate}${extension}`),
    ...sourceExtensions.map((extension) => path.join(candidate, `index${extension}`)),
  ]
  return candidates.find((file) => existsSync(file))
}

function cycles(graph: Map<string, Set<string>>): string[][] {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  const found = new Map<string, string[]>()

  function visit(node: string): void {
    if (visited.has(node)) return
    if (visiting.has(node)) {
      const start = stack.indexOf(node)
      const cycle = [...stack.slice(start), node]
      const canonical = [...cycle.slice(0, -1)].sort()[0]
      found.set(canonical, cycle)
      return
    }
    visiting.add(node)
    stack.push(node)
    for (const dependency of graph.get(node) ?? []) visit(dependency)
    stack.pop()
    visiting.delete(node)
    visited.add(node)
  }

  for (const node of graph.keys()) visit(node)
  return [...found.values()]
}

function display(node: string): string {
  return path.isAbsolute(node) ? path.relative(root, node).replaceAll(path.sep, '/') : node
}

async function main(): Promise<void> {
  const roots = await moduleRoots()
  const manifests = new Map<string, PackageManifest>()
  for (const moduleRoot of roots) {
    const manifest = JSON.parse(
      await readFile(path.join(moduleRoot, 'package.json'), 'utf8')
    ) as PackageManifest
    if (!manifest.name) throw new Error(`${display(moduleRoot)}/package.json has no name`)
    manifests.set(manifest.name, manifest)
  }

  const packageGraph = new Map<string, Set<string>>()
  for (const [name, manifest] of manifests) {
    const declared = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    }
    packageGraph.set(
      name,
      new Set(Object.keys(declared).filter((dependency) => manifests.has(dependency)))
    )
  }

  const sourceGraph = new Map<string, Set<string>>()
  for (const moduleRoot of roots) {
    for (const file of await sourceFiles(path.join(moduleRoot, 'src'))) {
      const dependencies = new Set<string>()
      for (const specifier of importedSpecifiers(await readFile(file, 'utf8'))) {
        const resolved = resolveRelative(file, specifier)
        if (resolved) dependencies.add(resolved)
      }
      sourceGraph.set(file, dependencies)
    }
  }

  const failures = [
    ...cycles(packageGraph).map((cycle) => `package: ${cycle.map(display).join(' -> ')}`),
    ...cycles(sourceGraph).map((cycle) => `source: ${cycle.map(display).join(' -> ')}`),
  ]
  if (failures.length > 0) {
    console.error('Target module cycles found:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(
    `Target module cycles OK: ${manifests.size} packages and ${sourceGraph.size} source nodes`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
