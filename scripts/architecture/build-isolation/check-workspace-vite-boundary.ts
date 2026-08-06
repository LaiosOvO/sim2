#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..', '..', '..')
const appDirectory = path.join(root, 'apps', 'workspace-web')
const sourceDirectory = path.join(appDirectory, 'src')
const allowedRuntimeDependencies = new Set([
  '@sim/tool-catalog',
  '@sim/utils',
  'react',
  'react-dom',
  'socket.io-client',
])
const lazyEntryModules = [
  './advanced-capabilities',
  './attachment-list',
  './attachment-upload',
  './desktop-runtime',
  './desktop-resource-panel',
  './editor-basic-fields',
  './editor-activity-panel',
  './editor-collaboration',
  './editor-inspector',
  './editor-shell',
  './home-shell',
  './speech-input',
  './tool-catalog-panel',
  './tool-call-list',
]
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

  const entrySource = [
    await readFile(path.join(sourceDirectory, 'advanced-capabilities.tsx'), 'utf8'),
    await readFile(path.join(sourceDirectory, 'app.tsx'), 'utf8'),
    await readFile(path.join(sourceDirectory, 'editor-inspector.tsx'), 'utf8'),
    await readFile(path.join(sourceDirectory, 'editor-shell.tsx'), 'utf8'),
    await readFile(path.join(sourceDirectory, 'home-shell.tsx'), 'utf8'),
  ].join('\n')
  for (const specifier of lazyEntryModules) {
    if (!entrySource.includes(`import('${specifier}')`)) {
      failures.push(`apps/workspace-web/src: ${specifier} must stay dynamically imported`)
    }
  }
  const toolCallSource = await readFile(path.join(sourceDirectory, 'tool-call-list.tsx'), 'utf8')
  if (!toolCallSource.includes("import('./tool-actions')")) {
    failures.push(
      'apps/workspace-web/src/tool-call-list.tsx: ./tool-actions must stay dynamically imported'
    )
  }
  const editorTemplateSource = await readFile(
    path.join(sourceDirectory, 'editor-templates.ts'),
    'utf8'
  )
  if (
    !editorTemplateSource.includes("import('@sim/tool-catalog/generated/editor-block-templates/")
  ) {
    failures.push(
      'apps/workspace-web/src/editor-templates.ts: editor templates must stay dynamically imported'
    )
  }
  const collaborationSource = await readFile(
    path.join(sourceDirectory, 'editor-collaboration.tsx'),
    'utf8'
  )
  if (!collaborationSource.includes("import('socket.io-client')")) {
    failures.push(
      'apps/workspace-web/src/editor-collaboration.tsx: socket.io-client must stay dynamically imported'
    )
  }

  for (const file of await sourceFiles(sourceDirectory)) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2]
      if (!specifier) continue
      const allowedCatalogImport =
        specifier === '@sim/tool-catalog/generated/browser-summary' ||
        specifier === '@sim/tool-catalog/generated/agent-tool-options' ||
        specifier === '@sim/utils/id' ||
        (specifier === '@sim/tool-catalog' && match[0].startsWith('import type')) ||
        (specifier.startsWith('@sim/tool-catalog/generated/editor-block-templates/') &&
          match[0].startsWith('import('))
      const forbiddenPrefix = allowedCatalogImport
        ? undefined
        : forbiddenImportPrefixes.find(
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
