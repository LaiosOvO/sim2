import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

type InventoryRow = {
  auth: string
  dependencies: readonly string[]
  donorParity: string
  inventoryId: string
  methods: readonly string[]
  pathTemplate: string
  requiredTests: readonly string[]
}

type GeneratedRoute = InventoryRow & {
  batch: string
  legacyHandlerSource: string
  provider: string
  rolloutKey: string
  runtimeToolIds: readonly string[]
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const inventoryPath = join(repositoryRoot, 'docs', 'architecture', 'api-migration-inventory.md')
const toolsRoot = join(repositoryRoot, 'apps', 'sim', 'tools')
const outputPath = join(
  repositoryRoot,
  'apps',
  'api',
  'src',
  'modules',
  'tool-adapters',
  'generated',
  'w4-tool-route-manifest.ts'
)
const checkOnly = process.argv.includes('--check')
const expectedBatchCounts = new Map([
  ['A-B', 77],
  ['C-D', 124],
  ['E-H', 47],
  ['I-L', 92],
])

function parseInventory(): InventoryRow[] {
  return readFileSync(inventoryPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('| API-'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim())
    )
    .filter(
      (cells) =>
        cells[4] === 'Integration Tool Adapter' &&
        cells[10] === 'W4' &&
        cells[2]?.includes('/api/tools/')
    )
    .map((cells) => ({
      auth: cells[5],
      dependencies: cells[8].split(',').map((dependency) => dependency.trim()),
      donorParity: cells[3],
      inventoryId: cells[0],
      methods: cells[1].split(',').map((method) => method.trim().toUpperCase()),
      pathTemplate: cells[2].replaceAll('`', ''),
      requiredTests: [...cells[12]],
    }))
}

function walkTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walkTypeScriptFiles(path)
    }
    if (
      !entry.name.endsWith('.ts') ||
      entry.name.includes('.test.') ||
      entry.name.includes('.spec.')
    ) {
      return []
    }
    return [path]
  })
}

function normalizeRoutePath(path: string): string {
  return path.replace(/[?#].*$/, '').replaceAll('-', '_')
}

function discoverRuntimeToolIds(): Map<string, Set<string>> {
  const byPath = new Map<string, Set<string>>()
  for (const sourcePath of walkTypeScriptFiles(toolsRoot)) {
    const source = readFileSync(sourcePath, 'utf8')
    const routePaths = [
      ...new Set(
        [...source.matchAll(/\/api\/tools\/[A-Za-z0-9_./-]+/g)].map((match) =>
          normalizeRoutePath(match[0])
        )
      ),
    ]
    if (routePaths.length === 0) {
      continue
    }
    const provider = routePaths[0].split('/')[3]
    const providerPrefix = `${provider.replaceAll('-', '_')}_`
    const ids = [
      ...new Set(
        [...source.matchAll(/\bid\s*:\s*['"`]([A-Za-z0-9_-]+)['"`]/g)]
          .map((match) => match[1])
          .filter((id) => id === provider || id.startsWith(providerPrefix))
      ),
    ]
    for (const routePath of routePaths) {
      const bucket = byPath.get(routePath) ?? new Set<string>()
      ids.forEach((id) => bucket.add(id))
      byPath.set(routePath, bucket)
    }
  }
  return byPath
}

function batchFor(provider: string): string {
  const initial = provider[0]?.toUpperCase()
  if (initial === 'A' || initial === 'B') {
    return 'A-B'
  }
  if (initial === 'C' || initial === 'D') {
    return 'C-D'
  }
  if (initial >= 'E' && initial <= 'H') {
    return 'E-H'
  }
  if (initial >= 'I' && initial <= 'L') {
    return 'I-L'
  }
  throw new Error(`Provider ${provider} is outside the requested W4 A-L scope`)
}

function legacyHandlerSource(pathTemplate: string): string {
  const segments = pathTemplate.replace(/^\/api\/tools\//, '').split('/')
  const source = join(repositoryRoot, 'apps', 'sim', 'app', 'api', 'tools', ...segments, 'route.ts')
  if (!existsSync(source)) {
    throw new Error(
      `Missing legacy handler for ${pathTemplate}: ${relative(repositoryRoot, source)}`
    )
  }
  return relative(repositoryRoot, source).split(sep).join('/')
}

function buildManifest(): GeneratedRoute[] {
  const runtimeToolIds = discoverRuntimeToolIds()
  return parseInventory()
    .filter((row) => {
      const provider = row.pathTemplate.split('/')[3]
      return provider && provider[0].toUpperCase() <= 'L'
    })
    .map((row) => {
      const provider = row.pathTemplate.split('/')[3]
      return {
        ...row,
        batch: batchFor(provider),
        legacyHandlerSource: legacyHandlerSource(row.pathTemplate),
        provider,
        rolloutKey: `tool-adapter:${provider}`,
        runtimeToolIds: [
          ...(runtimeToolIds.get(normalizeRoutePath(row.pathTemplate)) ?? []),
        ].sort(),
      }
    })
    .sort((left, right) => left.inventoryId.localeCompare(right.inventoryId))
}

function assertCoverage(routes: readonly GeneratedRoute[]): void {
  const seenInventoryIds = new Set<string>()
  const seenMethodPaths = new Set<string>()
  for (const route of routes) {
    if (seenInventoryIds.has(route.inventoryId)) {
      throw new Error(`Duplicate inventory id ${route.inventoryId}`)
    }
    seenInventoryIds.add(route.inventoryId)
    for (const method of route.methods) {
      const key = `${method} ${route.pathTemplate}`
      if (seenMethodPaths.has(key)) {
        throw new Error(`Duplicate method/path ${key}`)
      }
      seenMethodPaths.add(key)
    }
  }
  for (const [batch, expected] of expectedBatchCounts) {
    const actual = routes.filter((route) => route.batch === batch).length
    if (actual !== expected) {
      throw new Error(`Expected ${expected} ${batch} routes, received ${actual}`)
    }
  }
  if (routes.length !== 340) {
    throw new Error(`Expected 340 W4 A-L routes, received ${routes.length}`)
  }
}

function render(routes: readonly GeneratedRoute[]): string {
  const serializedRoutes = JSON.stringify(routes)
  return `import type { W4ToolRouteDescriptor } from '@/modules/tool-adapters/contracts'

/**
 * Generated by scripts/api/generate-w4-tool-adapters.ts.
 *
 * This file is route metadata only. A route is not migration-complete until its
 * provider adapter passes the required contract, auth, behavior, differential,
 * integration, and security evidence.
 */
export const W4_TOOL_ROUTE_MANIFEST: readonly W4ToolRouteDescriptor[] = JSON.parse(
  \`${serializedRoutes}\`
)
`
}

const routes = buildManifest()
assertCoverage(routes)
const nextOutput = render(routes)
const currentOutput = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : ''

if (checkOnly) {
  if (currentOutput !== nextOutput) {
    throw new Error(`Generated W4 manifest is stale: ${relative(repositoryRoot, outputPath)}`)
  }
  console.log(`Verified ${routes.length} W4 A-L route descriptors`)
} else {
  writeFileSync(outputPath, nextOutput)
  console.log(`Generated ${routes.length} W4 A-L route descriptors`)
}
