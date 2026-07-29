#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

interface ForbiddenImport {
  description: string
  matches(specifier: string): boolean
}

interface ScopeRule {
  root: string
  label: string
  forbidden: ForbiddenImport[]
}

interface Offender {
  description: string
  file: string
  line: number
  snippet: string
  specifier: string
}

const root = path.resolve(import.meta.dir, '..')
const skipDirectories = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage'])
const sourceExtensionPattern = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/

const appImport: ForbiddenImport = {
  description: 'import into apps/*',
  matches: (specifier) =>
    specifier.startsWith('@/') ||
    specifier.startsWith('apps/') ||
    /(^|\/)\.\.\/(?:\.\.\/)*apps\//.test(specifier),
}

const infraImport: ForbiddenImport = {
  description: 'Biz import of a concrete Infra extension',
  matches: (specifier) =>
    specifier.startsWith('@sim/infra-') ||
    specifier.startsWith('extensions/infra/') ||
    /(^|\/)\.\.\/(?:\.\.\/)*infra\//.test(specifier),
}

const workerExecutionImport: ForbiddenImport = {
  description: 'Feishu ingress import of execution/runtime/sandbox implementation',
  matches: (specifier) =>
    /^@\/(execution|runtime|sandbox)(\/|$)/.test(specifier) ||
    /(^|\/)\.\.\/(?:\.\.\/)*(execution|runtime|sandbox)(\/|$)/.test(specifier),
}

const rules: ScopeRule[] = [
  {
    root: 'packages',
    label: 'shared packages',
    forbidden: [appImport],
  },
  {
    root: 'extensions/biz',
    label: 'Biz extensions',
    forbidden: [appImport, infraImport],
  },
  {
    root: 'extensions/infra',
    label: 'Infra extensions',
    forbidden: [appImport],
  },
  {
    root: 'apps/worker/src/ingress/feishu-persistent-connection',
    label: 'Feishu persistent ingress',
    forbidden: [workerExecutionImport],
  },
]

async function walk(directory: string, results: string[] = []): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    if (skipDirectories.has(entry.name)) continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await walk(fullPath, results)
    } else if (sourceExtensionPattern.test(entry.name)) {
      results.push(fullPath)
    }
  }
  return results
}

function importedSpecifiers(line: string): string[] {
  const specifiers: string[] = []
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g,
    /^\s*import\s+['"]([^'"]+)['"]/g,
  ]
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1])
    }
  }
  return specifiers
}

async function inspectScope(rule: ScopeRule): Promise<Offender[]> {
  const offenders: Offender[] = []
  const files = await walk(path.join(root, rule.root))

  for (const file of files) {
    const lines = (await readFile(file, 'utf8')).split('\n')
    for (const [index, line] of lines.entries()) {
      for (const specifier of importedSpecifiers(line)) {
        for (const forbidden of rule.forbidden) {
          if (!forbidden.matches(specifier)) continue
          offenders.push({
            description: `${rule.label}: ${forbidden.description}`,
            file: path.relative(root, file),
            line: index + 1,
            snippet: line.trim(),
            specifier,
          })
        }
      }
    }
  }

  return offenders
}

async function main(): Promise<void> {
  const offenders = (await Promise.all(rules.map(inspectScope))).flat()

  if (offenders.length === 0) {
    console.log(
      'Monorepo boundaries OK: packages, Biz, Infra, and Feishu ingress dependency rules passed'
    )
    return
  }

  console.error(`Monorepo boundary violations found (${offenders.length}):`)
  for (const offender of offenders) {
    console.error(
      `  ${offender.file}:${offender.line} — ${offender.description}\n` +
        `    import: ${offender.specifier}\n` +
        `    ${offender.snippet}`
    )
  }
  process.exit(1)
}

void main().catch((error) => {
  console.error('Monorepo boundary check failed:', error)
  process.exit(1)
})
