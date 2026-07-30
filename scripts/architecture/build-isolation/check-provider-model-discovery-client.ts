#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { providerModelDiscoveryRoutesV1 } from '@sim/api-contracts/provider-model-discovery'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const hookEntry = path.join(root, 'apps', 'sim', 'hooks', 'queries', 'providers.ts')
const loaderEntry = path.join(
  root,
  'apps',
  'sim',
  'app',
  'workspace',
  '[workspaceId]',
  'providers',
  'provider-models-loader.tsx'
)
const routeEntries = providerModelDiscoveryRoutesV1.map((route) =>
  path.join(root, 'apps', 'sim', 'app', ...route.path.split('/').filter(Boolean), 'route.ts')
)
const forbiddenMarkers = [
  '@sim/db',
  'drizzle-orm',
  'better-auth',
  'workspaceBYOKKeys',
  'ENCRYPTION_KEY',
  'providers/utils',
  'stores/modals/search/store',
  '/tools/registry',
  '/blocks/registry',
  '/executor/',
  'isolated-vm',
  '/sandbox/',
]

async function build(
  entrypoints: readonly string[],
  target: 'browser' | 'node',
  maximumGzipBytes: number,
  external: readonly string[] = [],
  markers: readonly string[] = forbiddenMarkers
): Promise<{ failures: string[]; largestGzipBytes: number }> {
  const result = await Bun.build({
    entrypoints: [...entrypoints],
    external: [...external],
    minify: true,
    target,
    write: false,
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error(`Provider model discovery ${target} build failed`)
  }

  const failures: string[] = []
  let largestGzipBytes = 0
  for (const output of result.outputs) {
    const content = await output.text()
    const gzipBytes = gzipSync(content).byteLength
    largestGzipBytes = Math.max(largestGzipBytes, gzipBytes)
    if (gzipBytes > maximumGzipBytes) {
      failures.push(`${path.basename(output.path)} is ${gzipBytes} gzip bytes`)
    }
    const present = markers.filter((marker) => content.includes(marker))
    if (present.length > 0) {
      failures.push(`${path.basename(output.path)} contains ${present.join(', ')}`)
    }
  }
  return { failures, largestGzipBytes }
}

export function providerModelClientSourceFailures(hook: string, loader: string): string[] {
  const failures: string[] = []
  if (!hook.includes('@/lib/api/contracts/provider-model-discovery')) {
    failures.push('provider query hook does not use the focused contract wrapper')
  }
  if (hook.includes('@/lib/api/contracts/providers')) {
    failures.push('provider query hook still imports the monolithic provider contract surface')
  }
  if (!loader.includes('@/stores/modals/search/open-state')) {
    failures.push('real provider loader does not use the browser-light search-open projection')
  }
  if (loader.includes('@/stores/modals/search/store')) {
    failures.push('real provider loader imports the registry-bearing search store')
  }
  if (loader.includes('@/providers/utils')) {
    failures.push('real provider loader imports the heavyweight provider utility module')
  }
  for (const requiredPolicy of [
    'isWorkflowEditor',
    'shouldLoadDynamicModels',
    '/integrations',
    '/settings/custom-blocks',
  ]) {
    if (!loader.includes(requiredPolicy)) {
      failures.push(`real provider loader is missing lazy-load policy ${requiredPolicy}`)
    }
  }
  return failures
}

async function main(): Promise<void> {
  const hook = await readFile(hookEntry, 'utf8')
  const loader = await readFile(loaderEntry, 'utf8')
  const failures = providerModelClientSourceFailures(hook, loader)

  for (let index = 0; index < routeEntries.length; index++) {
    const route = providerModelDiscoveryRoutesV1[index]
    const content = await readFile(routeEntries[index], 'utf8')
    const expected = `proxyProviderModelDiscoveryRequest(request, '${route.inventoryId}')`
    if (!content.includes(expected)) {
      failures.push(`${route.inventoryId}: facade is not bound to the exact inventory route`)
    }
    for (const marker of forbiddenMarkers) {
      if (content.includes(marker)) failures.push(`${route.inventoryId}: facade contains ${marker}`)
    }
  }

  const browser = await build(
    [loaderEntry],
    'browser',
    96 * 1024,
    ['react', 'react-dom', 'next/*', '@tanstack/react-query'],
    [...forbiddenMarkers, 'node:crypto']
  )
  const facades = await build(routeEntries, 'node', 24 * 1024)
  failures.push(...browser.failures, ...facades.failures)

  if (failures.length > 0) {
    console.error('Provider model discovery client-boundary violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log(
    `Provider model discovery client boundary OK: real loader ${browser.largestGzipBytes} gzip bytes; ${routeEntries.length} facades, largest ${facades.largestGzipBytes} gzip bytes`
  )
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exit(1)
  })
}
