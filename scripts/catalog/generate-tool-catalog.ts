#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import type {
  ToolCatalogItemV1,
  ToolCatalogSummaryDocumentV1,
  ToolCatalogSummaryItemV1,
  ToolInputDescriptorV1,
} from '@sim/tool-catalog'
import * as ts from '@typescript/typescript6'

interface IntegrationSource {
  type: string
  slug: string
  name: string
  description: string
  bgColor: string
  iconName: string
  category: string
  operations: Array<{ name: string }>
}

interface IntegrationsSource {
  integrations: IntegrationSource[]
}

interface RegistryEntry {
  id: string
  symbol: string
  moduleSpecifier: string
}

const root = path.resolve(import.meta.dir, '..', '..')
const appDirectory = path.join(root, 'apps', 'sim')
const registryPath = path.join(appDirectory, 'blocks', 'registry-maps.ts')
const integrationsPath = path.join(appDirectory, 'lib', 'integrations', 'integrations.json')
const generatedDirectory = path.join(root, 'packages', 'tool-catalog', 'generated')
const shardsDirectory = path.join(generatedDirectory, 'providers')
const browserSummaryBudgetBytes = 150 * 1024

function parseSource(file: string, content: string): ts.SourceFile {
  return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  return undefined
}

function unwrap(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
    return unwrap(expression.expression)
  }
  return expression
}

function objectLiteral(
  expression: ts.Expression | undefined
): ts.ObjectLiteralExpression | undefined {
  if (!expression) return undefined
  const unwrapped = unwrap(expression)
  return ts.isObjectLiteralExpression(unwrapped) ? unwrapped : undefined
}

function arrayLiteral(
  expression: ts.Expression | undefined
): ts.ArrayLiteralExpression | undefined {
  if (!expression) return undefined
  const unwrapped = unwrap(expression)
  return ts.isArrayLiteralExpression(unwrapped) ? unwrapped : undefined
}

function property(
  object: ts.ObjectLiteralExpression | undefined,
  name: string
): ts.Expression | undefined {
  if (!object) return undefined
  for (const member of object.properties) {
    if (!ts.isPropertyAssignment(member) || propertyName(member.name) !== name) continue
    return member.initializer
  }
  return undefined
}

function stringValue(expression: ts.Expression | undefined): string | undefined {
  if (!expression) return undefined
  const unwrapped = unwrap(expression)
  if (ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)) {
    return unwrapped.text
  }
  return undefined
}

function booleanValue(expression: ts.Expression | undefined): boolean | undefined {
  if (!expression) return undefined
  const unwrapped = unwrap(expression)
  if (unwrapped.kind === ts.SyntaxKind.TrueKeyword) return true
  if (unwrapped.kind === ts.SyntaxKind.FalseKeyword) return false
  return undefined
}

function identifierValue(expression: ts.Expression | undefined): string | undefined {
  if (!expression) return undefined
  const unwrapped = unwrap(expression)
  return ts.isIdentifier(unwrapped) ? unwrapped.text : undefined
}

function strings(expression: ts.Expression | undefined): string[] {
  const array = arrayLiteral(expression)
  if (!array) return []
  return array.elements.flatMap((element) => {
    if (ts.isSpreadElement(element)) return []
    const value = stringValue(element)
    return value === undefined ? [] : [value]
  })
}

function inputType(control: string | undefined): ToolInputDescriptorV1['type'] {
  if (!control) return 'string'
  if (control.includes('credential') || control.includes('oauth')) return 'credential'
  if (control.includes('file')) return 'file'
  if (control.includes('number') || control.includes('slider')) return 'number'
  if (control.includes('boolean') || control.includes('switch') || control.includes('checkbox')) {
    return 'boolean'
  }
  if (control.includes('json') || control === 'code') return 'json'
  return 'string'
}

function inputs(block: ts.ObjectLiteralExpression | undefined): ToolInputDescriptorV1[] {
  const subBlocks = arrayLiteral(property(block, 'subBlocks'))
  if (!subBlocks) return []
  return subBlocks.elements.flatMap((element) => {
    if (ts.isSpreadElement(element)) return []
    const descriptor = objectLiteral(element)
    const key = stringValue(property(descriptor, 'id'))
    if (!key) return []
    return [
      {
        key,
        label: stringValue(property(descriptor, 'title')) ?? key,
        type: inputType(stringValue(property(descriptor, 'type'))),
        required: booleanValue(property(descriptor, 'required')) ?? false,
        description: stringValue(property(descriptor, 'description')),
      },
    ]
  })
}

function resolveModule(specifier: string): string {
  const base = specifier.startsWith('@/')
    ? path.join(appDirectory, specifier.slice(2))
    : path.resolve(path.dirname(registryPath), specifier)
  const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]
  const resolved = candidates.find((candidate) => Bun.file(candidate).size > 0)
  if (!resolved) throw new Error(`Cannot resolve ${specifier} from blocks registry`)
  return resolved
}

async function registryEntries(): Promise<RegistryEntry[]> {
  const content = await readFile(registryPath, 'utf8')
  const source = parseSource(registryPath, content)
  const imports = new Map<string, string>()
  let registry: ts.ObjectLiteralExpression | undefined

  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        imports.set(element.name.text, statement.moduleSpecifier.text)
      }
    }
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'BLOCK_REGISTRY') {
        registry = objectLiteral(declaration.initializer)
      }
    }
  }

  if (!registry) throw new Error('BLOCK_REGISTRY object literal was not found')
  return registry.properties.flatMap((member) => {
    if (!ts.isPropertyAssignment(member)) return []
    const id = propertyName(member.name)
    const initializer = unwrap(member.initializer)
    if (!id || !ts.isIdentifier(initializer)) return []
    const moduleSpecifier = imports.get(initializer.text)
    if (!moduleSpecifier) throw new Error(`No import found for ${initializer.text}`)
    return [{ id, symbol: initializer.text, moduleSpecifier }]
  })
}

async function blockLiteral(entry: RegistryEntry): Promise<ts.ObjectLiteralExpression | undefined> {
  const file = resolveModule(entry.moduleSpecifier)
  const source = parseSource(file, await readFile(file, 'utf8'))
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === entry.symbol) {
        return objectLiteral(declaration.initializer)
      }
    }
  }
  return undefined
}

function providerAndVersion(id: string): { provider: string; version: string } {
  const match = id.match(/^(.*)_v(\d+)$/)
  return match ? { provider: match[1], version: match[2] } : { provider: id, version: '1' }
}

function legacyIds(id: string, integration: IntegrationSource | undefined): string[] {
  const aliases = new Set<string>()
  if (id.includes('_')) aliases.add(id.replaceAll('_', '-'))
  if (integration?.slug && integration.slug !== id) aliases.add(integration.slug)
  aliases.delete(id)
  return [...aliases].sort()
}

function serialized(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function hash(items: ToolCatalogItemV1[]): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(items)).digest('hex')}`
}

async function expectedArtifacts(): Promise<{
  artifacts: Map<string, string>
  itemCount: number
  integrationCount: number
  gzipBytes: number
}> {
  const integrations = JSON.parse(await readFile(integrationsPath, 'utf8')) as IntegrationsSource
  const integrationsByType = new Map(
    integrations.integrations.map((integration) => [integration.type, integration])
  )
  const items: ToolCatalogItemV1[] = []
  const blocksById = new Map<string, ts.ObjectLiteralExpression | undefined>()

  for (const entry of await registryEntries()) {
    const block = await blockLiteral(entry)
    blocksById.set(entry.id, block)
    const integration = integrationsByType.get(entry.id)
    const { provider, version } = providerAndVersion(entry.id)
    const tools = objectLiteral(property(block, 'tools'))
    const item: ToolCatalogItemV1 = {
      catalogVersion: 1,
      id: entry.id,
      legacyIds: legacyIds(entry.id, integration),
      provider,
      version,
      display: {
        name:
          stringValue(property(block, 'name')) ??
          integration?.name ??
          entry.id.replaceAll('_', ' '),
        description: stringValue(property(block, 'description')) ?? integration?.description ?? '',
        category: stringValue(property(block, 'category')) ?? integration?.category ?? 'blocks',
        icon: identifierValue(property(block, 'icon')) ?? integration?.iconName,
        bgColor: stringValue(property(block, 'bgColor')) ?? integration?.bgColor,
      },
      capabilities: strings(property(tools, 'access')),
      inputs: inputs(block),
    }
    items.push(item)
  }
  items.sort((left, right) => left.id.localeCompare(right.id))

  for (const integration of integrations.integrations) {
    const item = items.find((candidate) => candidate.id === integration.type)
    if (!item) throw new Error(`Catalog omitted visible integration ${integration.type}`)
    const differences = [
      item.display.name === integration.name ? undefined : 'name',
      item.display.description === integration.description ? undefined : 'description',
      item.display.category === integration.category ? undefined : 'category',
      item.display.bgColor === integration.bgColor ? undefined : 'bgColor',
    ].filter(Boolean)
    if (differences.length > 0) {
      throw new Error(
        `${integration.type} differs from UI integration JSON: ${differences.join(', ')}`
      )
    }
  }

  const catalogHash = hash(items)
  const summaryItems: ToolCatalogSummaryItemV1[] = items.map(
    ({ id, legacyIds: aliases, provider, version, display }) => ({
      id,
      legacyIds: aliases,
      provider,
      version,
      display,
      visibility: {
        hideFromToolbar: Boolean(booleanValue(property(blocksById.get(id), 'hideFromToolbar'))),
        preview: Boolean(booleanValue(property(blocksById.get(id), 'preview'))),
      },
    })
  )
  const summary: ToolCatalogSummaryDocumentV1 = {
    catalogVersion: 1,
    catalogHash,
    items: summaryItems,
  }
  const summaryContent = serialized(summary)
  const gzipBytes = gzipSync(summaryContent).byteLength
  if (gzipBytes > browserSummaryBudgetBytes) {
    throw new Error(
      `Browser catalog summary is ${gzipBytes} gzip bytes; budget is ${browserSummaryBudgetBytes}`
    )
  }

  const byProvider = new Map<string, ToolCatalogItemV1[]>()
  for (const item of items) {
    const providerItems = byProvider.get(item.provider) ?? []
    providerItems.push(item)
    byProvider.set(item.provider, providerItems)
  }

  const artifacts = new Map<string, string>()
  artifacts.set(path.join(generatedDirectory, 'browser-summary.json'), summaryContent)
  const providers = [...byProvider.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([provider, providerItems]) => {
      const file = `${provider}.json`
      artifacts.set(
        path.join(shardsDirectory, file),
        serialized({
          catalogVersion: 1,
          catalogHash,
          provider,
          items: providerItems,
        })
      )
      return { id: provider, count: providerItems.length, file: `providers/${file}` }
    })
  artifacts.set(
    path.join(generatedDirectory, 'catalog.manifest.json'),
    serialized({
      catalogVersion: 1,
      catalogHash,
      itemCount: items.length,
      providerCount: providers.length,
      providers,
    })
  )

  return {
    artifacts,
    itemCount: items.length,
    integrationCount: integrations.integrations.length,
    gzipBytes,
  }
}

async function checkArtifacts(expected: Map<string, string>): Promise<void> {
  const failures: string[] = []
  for (const [file, content] of expected) {
    let actual = ''
    try {
      actual = await readFile(file, 'utf8')
    } catch {
      // Report the missing file through the common stale message.
    }
    if (actual !== content) failures.push(path.relative(root, file))
  }
  let actualShards: string[] = []
  try {
    actualShards = (await readdir(shardsDirectory)).sort()
  } catch {
    // A missing directory is represented as an empty generated shard set.
  }
  const expectedShards = [...expected.keys()]
    .filter((file) => path.dirname(file) === shardsDirectory)
    .map((file) => path.basename(file))
    .sort()
  if (JSON.stringify(actualShards) !== JSON.stringify(expectedShards)) {
    failures.push(path.relative(root, shardsDirectory))
  }
  if (failures.length > 0) {
    throw new Error(
      `Generated catalog is stale: ${failures.join(', ')}. Run: bun run catalog:generate`
    )
  }
}

async function main(): Promise<void> {
  const result = await expectedArtifacts()
  if (process.argv.includes('--check')) {
    await checkArtifacts(result.artifacts)
  } else {
    await mkdir(shardsDirectory, { recursive: true })
    for (const [file, content] of result.artifacts) {
      await writeFile(file, content, 'utf8')
    }
  }
  console.log(
    `${process.argv.includes('--check') ? 'Verified' : 'Generated'} ${result.itemCount} catalog ` +
      `items; ${result.integrationCount} UI integrations matched; browser summary ` +
      `${result.gzipBytes} gzip bytes`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
