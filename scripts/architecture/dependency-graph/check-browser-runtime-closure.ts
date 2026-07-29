#!/usr/bin/env bun
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
// TypeScript 7's native package does not expose the legacy compiler API used by this graph walker.
import * as ts from '@typescript/typescript6'

interface Baseline {
  schemaVersion: 1
  maxClientRootsByCategory: Record<string, number>
}

interface Category {
  id: string
  matches(file: string): boolean
}

interface CategoryResult {
  category: string
  clientRoots: string[]
  shortestChain?: string[]
}

const root = path.resolve(import.meta.dir, '..', '..', '..')
const appDirectory = path.join(root, 'apps', 'sim')
const baselinePath = path.join(root, 'docs', 'testing', 'browser-runtime-closure-baseline.json')

const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
const excludedSegments = new Set(['node_modules', '.next', 'dist', 'coverage', '.turbo'])

const categories: Category[] = [
  {
    id: 'executor',
    matches: (file) => isWithin(file, path.join(appDirectory, 'executor')),
  },
  {
    id: 'execution-and-sandbox',
    matches: (file) => isWithin(file, path.join(appDirectory, 'lib', 'execution')),
  },
  {
    id: 'runtime-tools-blocks-triggers',
    matches: (file) =>
      ['tools', 'blocks', 'triggers'].some((directory) =>
        isWithin(file, path.join(appDirectory, directory))
      ),
  },
  {
    id: 'database-auth-secrets',
    matches: (file) =>
      ['db', 'auth', 'runtime-secrets'].some((directory) =>
        isWithin(file, path.join(root, 'packages', directory))
      ),
  },
  {
    id: 'server-crypto-and-provider-sdk',
    matches: (file) =>
      file.startsWith('external:') ||
      isWithin(file, path.join(appDirectory, 'lib', 'core', 'security', 'encryption.ts')),
  },
  {
    id: 'infra-extensions',
    matches: (file) => isWithin(file, path.join(root, 'extensions', 'infra')),
  },
  {
    id: 'api-or-worker',
    matches: (file) =>
      ['api', 'worker'].some((application) => isWithin(file, path.join(root, 'apps', application))),
  },
]

const serverRuntimeSpecifiers = [
  'isolated-vm',
  'e2b',
  '@e2b/',
  '@daytonaio/',
  '@larksuiteoapi/node-sdk',
  '@aws-sdk/',
  '@google-cloud/',
  '@anthropic-ai/sdk',
  'openai',
  'node:crypto',
  'node:fs',
  'node:child_process',
  'node:worker_threads',
]

function normalize(file: string): string {
  return path.resolve(file)
}

async function canonicalize(file: string): Promise<string> {
  try {
    return normalize(await realpath(file))
  } catch {
    return normalize(file)
  }
}

function isWithin(file: string, directory: string): boolean {
  const relative = path.relative(normalize(directory), normalize(file))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isSourceFile(file: string): boolean {
  return (
    sourceExtensions.has(path.extname(file)) &&
    !file
      .split(path.sep)
      .some((segment) => excludedSegments.has(segment) || segment.endsWith('.d.ts'))
  )
}

function isClientRoot(content: string): boolean {
  return /^(?:\uFEFF)?(?:\s|\/\/[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)*(?:'use client'|"use client")\s*;?/.test(
    content
  )
}

function importClauseHasRuntimeValue(clause: ts.ImportClause | undefined): boolean {
  if (!clause) return true
  if (clause.isTypeOnly) return false
  if (clause.name) return true
  if (!clause.namedBindings) return false
  if (ts.isNamespaceImport(clause.namedBindings)) return true
  return clause.namedBindings.elements.some((element) => !element.isTypeOnly)
}

function runtimeSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers = new Set<string>()

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      importClauseHasRuntimeValue(node.importClause)
    ) {
      specifiers.add(node.moduleSpecifier.text)
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.add(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      specifiers.add(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return [...specifiers]
}

function relative(file: string): string {
  if (file.startsWith('external:')) return file
  return path.relative(root, file).replaceAll(path.sep, '/')
}

function serverRuntimeNode(specifier: string): string | undefined {
  if (
    serverRuntimeSpecifiers.some(
      (candidate) => specifier === candidate || specifier.startsWith(candidate)
    )
  ) {
    return `external:${specifier}`
  }
  return undefined
}

function readCompilerConfiguration(): ts.ParsedCommandLine {
  const configPath = path.join(appDirectory, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  return ts.parseJsonConfigFileContent(config.config, ts.sys, appDirectory)
}

async function buildGraph(): Promise<{
  clientRoots: Set<string>
  reverse: Map<string, Set<string>>
}> {
  const parsedConfig = readCompilerConfiguration()
  const compilerOptions = parsedConfig.options
  const resolutionCache = ts.createModuleResolutionCache(
    appDirectory,
    (file) => (ts.sys.useCaseSensitiveFileNames ? file : file.toLowerCase()),
    compilerOptions
  )
  const sourceCache = new Map<string, string>()
  const clientRoots = new Set<string>()
  for (const configuredFile of parsedConfig.fileNames.filter(isSourceFile).map(normalize)) {
    let content: string
    try {
      content = await readFile(configuredFile, 'utf8')
    } catch {
      continue
    }
    if (!isWithin(configuredFile, appDirectory) || !isClientRoot(content)) continue
    clientRoots.add(configuredFile)
    sourceCache.set(configuredFile, content)
  }

  const queue = [...clientRoots]
  let queueIndex = 0
  const seen = new Set<string>()
  const reverse = new Map<string, Set<string>>()
  const canonicalPaths = new Map<string, string>()

  while (queueIndex < queue.length) {
    const file = queue[queueIndex]
    queueIndex += 1
    if (seen.has(file)) continue
    seen.add(file)

    let content = sourceCache.get(file)
    if (content === undefined) {
      try {
        content = await readFile(file, 'utf8')
      } catch {
        continue
      }
    }

    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )
    for (const specifier of runtimeSpecifiers(sourceFile)) {
      const externalRuntime = serverRuntimeNode(specifier)
      if (externalRuntime) {
        const importers = reverse.get(externalRuntime) ?? new Set<string>()
        importers.add(file)
        reverse.set(externalRuntime, importers)
        continue
      }
      const resolution = ts.resolveModuleName(
        specifier,
        file,
        compilerOptions,
        ts.sys,
        resolutionCache
      ).resolvedModule
      if (!resolution) continue
      const dependency =
        canonicalPaths.get(resolution.resolvedFileName) ??
        (await canonicalize(resolution.resolvedFileName))
      canonicalPaths.set(resolution.resolvedFileName, dependency)
      if (!isSourceFile(dependency) || !isWithin(dependency, root)) continue
      const importers = reverse.get(dependency) ?? new Set<string>()
      importers.add(file)
      reverse.set(dependency, importers)
      if (!seen.has(dependency)) queue.push(dependency)
    }
  }

  return { clientRoots, reverse }
}

function inspectCategory(
  category: Category,
  graph: Awaited<ReturnType<typeof buildGraph>>
): CategoryResult {
  const queue: string[] = []
  const nextHop = new Map<string, string>()
  const visited = new Set<string>()

  for (const file of graph.reverse.keys()) {
    if (!category.matches(file)) continue
    queue.push(file)
    visited.add(file)
  }

  while (queue.length > 0) {
    const dependency = queue.shift()
    if (!dependency) continue
    for (const importer of graph.reverse.get(dependency) ?? []) {
      if (visited.has(importer)) continue
      visited.add(importer)
      nextHop.set(importer, dependency)
      queue.push(importer)
    }
  }

  const roots = [...graph.clientRoots].filter((file) => visited.has(file)).sort()
  let shortestChain: string[] | undefined
  for (const clientRoot of roots) {
    const chain = [clientRoot]
    let current = clientRoot
    while (nextHop.has(current)) {
      current = nextHop.get(current) as string
      chain.push(current)
    }
    if (!shortestChain || chain.length < shortestChain.length) shortestChain = chain
  }

  return {
    category: category.id,
    clientRoots: roots.map(relative),
    shortestChain: shortestChain?.map(relative),
  }
}

function isZeroBudgetRoot(file: string): boolean {
  return [
    'apps/sim/features/',
    'apps/sim/lib/api-client/',
    'apps/sim/lib/browser/',
    'apps/sim/lib/catalog/',
  ].some((prefix) => file.startsWith(prefix))
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const graph = await buildGraph()
  const results = categories.map((category) => inspectCategory(category, graph))
  const zeroBudgetViolations = results.flatMap((result) =>
    result.clientRoots
      .filter(isZeroBudgetRoot)
      .map((clientRoot) => `${result.category}: ${clientRoot}`)
  )

  console.log(
    JSON.stringify(
      {
        clientRootCount: graph.clientRoots.size,
        categories: Object.fromEntries(
          results.map((result) => [
            result.category,
            {
              clientRootCount: result.clientRoots.length,
              shortestChain: result.shortestChain,
            },
          ])
        ),
        zeroBudgetViolations,
      },
      null,
      2
    )
  )

  if (!check) return

  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as Baseline
  const failures: string[] = [...zeroBudgetViolations]
  for (const result of results) {
    const maximum = baseline.maxClientRootsByCategory[result.category]
    if (maximum === undefined) {
      failures.push(`${result.category}: missing baseline`)
    } else if (result.clientRoots.length > maximum) {
      failures.push(`${result.category}: ${result.clientRoots.length} exceeds baseline ${maximum}`)
    }
  }

  if (failures.length === 0) {
    console.log('Browser runtime closure ratchet passed')
    return
  }

  console.error('Browser runtime closure violations:')
  for (const failure of failures) console.error(`- ${failure}`)
  for (const result of results) {
    if (!result.shortestChain) continue
    console.error(`Shortest ${result.category} pollution chain:`)
    for (const [index, file] of result.shortestChain.entries()) {
      console.error(`${'  '.repeat(index)}${index === 0 ? '' : '-> '}${file}`)
    }
  }
  process.exit(1)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
