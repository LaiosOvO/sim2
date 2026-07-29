#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { w2TenantReadRouteContracts } from '@sim/api-contracts/w2-tenant-read'

const root = path.resolve(import.meta.dir, '..', '..')
const check = process.argv.includes('--check')

function facadePath(pathTemplate: string): string {
  return path.join('apps', 'sim', 'app', ...pathTemplate.split('/').filter(Boolean), 'route.ts')
}

function facadeSource(inventoryId: string): string {
  return `import { proxyW2TenantReadRequest } from '@/lib/api-proxy/w2-tenant-read'

export const dynamic = 'force-dynamic'

export function GET(request: Request): Promise<Response> {
  return proxyW2TenantReadRequest(request, '${inventoryId}')
}
`
}

async function assertCurrent(file: string, expected: string): Promise<void> {
  let actual = ''
  try {
    actual = await readFile(file, 'utf8')
  } catch {
    // The stale output below also covers a missing generated file.
  }
  if (actual !== expected) {
    throw new Error(`${path.relative(root, file)} is stale. Run: bun run w2:tenant:generate`)
  }
}

async function main(): Promise<void> {
  const outputs = w2TenantReadRouteContracts.map((route) => ({
    route,
    relativePath: facadePath(route.pathTemplate),
    content: facadeSource(route.inventoryId),
  }))
  const coverage = `${JSON.stringify(
    {
      schemaVersion: 1,
      wave: 'W2',
      selector: {
        domains: [
          'workspaces',
          'organizations',
          'users',
          'invitations',
          'permission-groups',
          'workspace-events',
          'stars',
        ],
      },
      inventoryCount: outputs.length,
      routes: outputs.map(({ route, relativePath }) => ({
        inventoryId: route.inventoryId,
        methods: [route.method],
        path: route.pathTemplate,
        authMode: route.authMode,
        apiModule: 'apps/api/src/modules/tenant-read',
        nextFacade: relativePath.replaceAll('\\', '/'),
        tests: route.requiredTests,
        backend: 'legacy-origin-compatibility',
      })),
    },
    null,
    2
  )
    .replace(/"methods": \[\s+"GET"\s+\]/g, '"methods": ["GET"]')
    .replace(
      /"tests": \[\s+"contract",\s+"auth",\s+"differential",\s+"integration"\s+\]/g,
      '"tests": ["contract", "auth", "differential", "integration"]'
    )}\n`
  const coveragePath = path.join(root, 'docs', 'testing', 'api-w2-tenant-read-coverage.json')
  const proxyIncludes = [
    ...outputs.map(({ relativePath }) =>
      path
        .relative(path.join(root, 'apps', 'sim'), path.join(root, relativePath))
        .replaceAll('\\', '/')
    ),
    'lib/api-proxy/w2-tenant-read.ts',
    'lib/api-proxy/w2-tenant-read.test.ts',
  ]
    .map((entry) => `    ${JSON.stringify(entry)}`)
    .join(',\n')
  const proxyTsconfig = `{
  "extends": "./tsconfig.json",
  "include": [
${proxyIncludes}
  ],
  "exclude": ["node_modules", ".next", "dist"]
}
`
  const proxyTsconfigPath = path.join(root, 'apps', 'sim', 'tsconfig.w2-tenant-read-proxy.json')

  if (check) {
    await Promise.all([
      ...outputs.map(({ relativePath, content }) =>
        assertCurrent(path.join(root, relativePath), content)
      ),
      assertCurrent(coveragePath, coverage),
      assertCurrent(proxyTsconfigPath, proxyTsconfig),
    ])
    console.log(`W2 tenant-read generated facades OK: ${outputs.length}`)
    return
  }

  for (const { relativePath, content } of outputs) {
    const absolute = path.join(root, relativePath)
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeFile(absolute, content, 'utf8')
  }
  await writeFile(coveragePath, coverage, 'utf8')
  await writeFile(proxyTsconfigPath, proxyTsconfig, 'utf8')
  console.log(`Generated ${outputs.length} W2 tenant-read facades and coverage records`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
