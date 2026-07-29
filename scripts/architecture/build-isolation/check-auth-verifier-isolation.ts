#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const inspectedRoots = [
  'packages/auth/src',
  'apps/api/src/middleware/authentication',
  'apps/api/src/middleware/authorization',
] as const
const forbiddenSpecifiers = [
  'next',
  'react',
  '@sim/execution-contracts',
  '@sim/tool-catalog',
  '@sim/runtime-secrets',
  'isolated-vm',
  'e2b',
  '@daytonaio/',
  '@larksuiteoapi/node-sdk',
]
const forbiddenPathMarkers = [
  '/webhooks/',
  '/mcp/',
  '/executor/',
  '/registry/',
  '/sandbox/',
  '/components/',
  '/app/',
]
const importPattern = /\b(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

async function sourceFiles(directory: string): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...(await sourceFiles(absolute)))
    else if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) result.push(absolute)
  }
  return result
}

function normalized(value: string): string {
  return value.replaceAll('\\', '/').toLowerCase()
}

async function build(entrypoint: string, externalPackages: boolean): Promise<string> {
  const result = await Bun.build({
    entrypoints: [path.join(root, entrypoint)],
    target: 'node',
    minify: true,
    write: false,
    packages: externalPackages ? 'external' : 'bundle',
  })
  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join('\n'))
  }
  return (await Promise.all(result.outputs.map((output) => output.text()))).join('\n')
}

async function main(): Promise<void> {
  const failures: string[] = []
  for (const relativeRoot of inspectedRoots) {
    for (const file of await sourceFiles(path.join(root, relativeRoot))) {
      const content = await readFile(file, 'utf8')
      importPattern.lastIndex = 0
      for (const match of content.matchAll(importPattern)) {
        const specifier = normalized(match[1])
        if (
          forbiddenSpecifiers.some(
            (forbidden) => specifier === forbidden || specifier.startsWith(forbidden)
          ) ||
          forbiddenPathMarkers.some((marker) => specifier.includes(marker))
        ) {
          failures.push(`${path.relative(root, file)} imports ${match[1]}`)
        }
      }
    }
  }

  const coreBuild = await build('packages/auth/src/request-context.ts', false)
  const coreGzipBytes = gzipSync(coreBuild).byteLength
  if (coreGzipBytes > 256 * 1024) {
    failures.push(`request authenticator core is ${coreGzipBytes} gzip bytes; budget is 262144`)
  }
  const coreMarkers = [
    'isolated-vm',
    '@larksuiteoapi/node-sdk',
    'createWorkerRuntimeRegistry',
    'executeWorkflow',
    'react',
  ].filter((marker) => coreBuild.includes(marker))
  if (coreMarkers.length > 0) {
    failures.push(`request authenticator core contains ${coreMarkers.join(', ')}`)
  }

  const compositionBuild = await build(
    'apps/api/src/middleware/authentication/composition/create-production-request-authenticator.ts',
    true
  )
  const compositionMarkers = [
    'apps/sim',
    '/webhooks/',
    '/mcp/',
    '/executor/',
    '/registry/',
    '/sandbox/',
  ].filter((marker) => normalized(compositionBuild).includes(marker))
  if (compositionMarkers.length > 0) {
    failures.push(`production auth composition contains ${compositionMarkers.join(', ')}`)
  }

  if (failures.length > 0) {
    console.error('Authentication verifier isolation failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log(
    `Authentication verifier isolation OK: core ${coreGzipBytes} gzip bytes, forbidden closure markers 0`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
