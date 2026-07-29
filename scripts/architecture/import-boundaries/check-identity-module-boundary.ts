#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

interface Boundary {
  directory: string
  allowedImports: (specifier: string) => boolean
  forbiddenMarkers: readonly string[]
}

const root = path.resolve(import.meta.dir, '..', '..', '..')
const importPattern = /\b(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g
const providerMarkers = ['@larksuiteoapi/node-sdk', 'feishu', 'lark', 'openId', 'unionId'] as const

const boundaries: Boundary[] = [
  {
    directory: 'extensions/biz/identity/src',
    allowedImports: (specifier) => specifier.startsWith('.'),
    forbiddenMarkers: [...providerMarkers, '@sim/db', 'apps/', 'infrastructure/', 'process.env'],
  },
  {
    directory: 'apps/api/src/modules/identity',
    allowedImports: (specifier) =>
      specifier.startsWith('.') ||
      specifier.startsWith('@/modules/identity/') ||
      specifier === '@sim/api-contracts/auth' ||
      specifier === '@sim/api-contracts/workspaces' ||
      specifier === '@sim/auth/authorization' ||
      specifier === '@sim/biz-identity' ||
      specifier === '@sim/logger',
    forbiddenMarkers: [
      '@larksuiteoapi/node-sdk',
      '@sim/db',
      '@/infrastructure/',
      'apps/sim/',
      'process.env',
    ],
  },
  {
    directory: 'apps/api/src/infrastructure/postgres/repositories',
    allowedImports: () => true,
    forbiddenMarkers: ['@larksuiteoapi/node-sdk', 'from-feishu', 'feishu-client'],
  },
]

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
  let checkedFiles = 0

  for (const boundary of boundaries) {
    for (const file of await sourceFiles(path.join(root, boundary.directory))) {
      checkedFiles += 1
      const content = await readFile(file, 'utf8')
      importPattern.lastIndex = 0
      for (const match of content.matchAll(importPattern)) {
        const specifier = match[1]
        if (!boundary.allowedImports(specifier)) {
          failures.push(`${path.relative(root, file)}: forbidden import ${specifier}`)
        }
      }
      for (const marker of boundary.forbiddenMarkers) {
        if (content.toLowerCase().includes(marker.toLowerCase())) {
          failures.push(
            `${path.relative(root, file)}: forbidden provider/boundary marker ${marker}`
          )
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error('Identity boundary violations:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log(`Identity boundary OK: ${boundaries.length} boundaries, ${checkedFiles} files`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
