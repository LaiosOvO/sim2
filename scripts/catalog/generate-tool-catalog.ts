#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import type {
  EditorBlockTemplateFieldV1,
  EditorBlockTemplateV1,
  EditorTemplateJsonValue,
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

interface BlockSource {
  block: ts.ObjectLiteralExpression | undefined
  declarations: Map<string, ts.Expression>
  literalBindings: Map<string, EditorTemplateJsonValue>
}

type EditorTemplateExclusionReason =
  | 'dynamic-field-default'
  | 'dynamic-field-spread'
  | 'dynamic-output'
  | 'field-default-too-large'
  | 'invalid-field'
  | 'missing-block-literal'
  | 'missing-outputs'
  | 'missing-sub-blocks'
  | 'trigger'

const editorTemplateExclusions = new Map<string, EditorTemplateExclusionReason>()
const sharedSubBlockArrays = new Map<string, ts.ArrayLiteralExpression>()

function excludeEditorTemplate(type: string, reason: EditorTemplateExclusionReason): undefined {
  editorTemplateExclusions.set(type, reason)
  return undefined
}

const root = path.resolve(import.meta.dir, '..', '..')
const appDirectory = path.join(root, 'apps', 'sim')
const registryPath = path.join(appDirectory, 'blocks', 'registry-maps.ts')
const integrationsPath = path.join(appDirectory, 'lib', 'integrations', 'integrations.json')
const generatedDirectory = path.join(root, 'packages', 'tool-catalog', 'generated')
const shardsDirectory = path.join(generatedDirectory, 'providers')
const editorTemplatesDirectory = path.join(generatedDirectory, 'editor-block-templates')
const browserSummaryBudgetBytes = 150 * 1024
const editorTemplatesBudgetBytes = 400 * 1024
const editorTemplateShardBudgetBytes = 40 * 1024
const E2B_MODE_SENTINEL = '__E2B_MODE__'
const LOCAL_TIMEZONE_SENTINEL = '__LOCAL_TIMEZONE__'

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

function resolvedObject(
  expression: ts.Expression | undefined,
  source: BlockSource,
  seen = new Set<string>()
): ts.ObjectLiteralExpression | undefined {
  if (!expression) return undefined
  const value = unwrap(expression)
  if (ts.isObjectLiteralExpression(value)) return value
  if (!ts.isIdentifier(value) || seen.has(value.text)) return undefined
  seen.add(value.text)
  return resolvedObject(source.declarations.get(value.text), source, seen)
}

function blockProperty(
  source: BlockSource,
  name: string,
  object = source.block,
  seen = new Set<ts.ObjectLiteralExpression>()
): ts.Expression | undefined {
  if (!object || seen.has(object)) return undefined
  seen.add(object)
  for (let index = object.properties.length - 1; index >= 0; index -= 1) {
    const member = object.properties[index]
    if (ts.isPropertyAssignment(member) && propertyName(member.name) === name) {
      return member.initializer
    }
    if (!ts.isSpreadAssignment(member)) continue
    const inherited = resolvedObject(member.expression, source)
    const inheritedValue = blockProperty(source, name, inherited, seen)
    if (inheritedValue) return inheritedValue
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

function jsonValue(expression: ts.Expression | undefined): EditorTemplateJsonValue | undefined {
  if (!expression) return undefined
  const value = unwrap(expression)
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text
  if (ts.isNumericLiteral(value)) return Number(value.text)
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false
  if (value.kind === ts.SyntaxKind.NullKeyword) return null
  if (
    ts.isPrefixUnaryExpression(value) &&
    value.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(value.operand)
  ) {
    return -Number(value.operand.text)
  }
  if (ts.isArrayLiteralExpression(value)) {
    const result: EditorTemplateJsonValue[] = []
    for (const element of value.elements) {
      if (ts.isSpreadElement(element)) return undefined
      const item = jsonValue(element)
      if (item === undefined) return undefined
      result.push(item)
    }
    return result
  }
  if (ts.isObjectLiteralExpression(value)) {
    const result: Record<string, EditorTemplateJsonValue> = {}
    for (const member of value.properties) {
      if (!ts.isPropertyAssignment(member)) return undefined
      const key = propertyName(member.name)
      const item = jsonValue(member.initializer)
      if (!key || item === undefined) return undefined
      result[key] = item
    }
    return result
  }
  return undefined
}

function sourceJsonValue(
  expression: ts.Expression | undefined,
  source: BlockSource,
  seen = new Set<string>()
): EditorTemplateJsonValue | undefined {
  if (!expression) return undefined
  const direct = jsonValue(expression)
  if (direct !== undefined) return direct
  const value = unwrap(expression)
  if (ts.isIdentifier(value)) {
    if (seen.has(value.text)) return undefined
    seen.add(value.text)
    return (
      source.literalBindings.get(value.text) ??
      sourceJsonValue(source.declarations.get(value.text), source, seen)
    )
  }
  if (ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.expression)) {
    const direct = source.literalBindings.get(`${value.expression.text}.${value.name.text}`)
    if (direct !== undefined) return direct
    const owner = source.literalBindings.get(value.expression.text)
    if (owner && typeof owner === 'object' && !Array.isArray(owner)) {
      return owner[value.name.text]
    }
  }
  if (
    ts.isCallExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === 'String' &&
    value.arguments.length === 1
  ) {
    const argument = sourceJsonValue(value.arguments[0], source, seen)
    if (argument !== undefined && (typeof argument === 'string' || typeof argument === 'number')) {
      return String(argument)
    }
  }
  return undefined
}

function compactOutputExpression(expression: ts.Expression): EditorTemplateJsonValue | undefined {
  const literal = objectLiteral(expression)
  if (!literal) return stringValue(expression)
  const type = stringValue(property(literal, 'type'))
  if (!type) return undefined
  const compact: Record<string, EditorTemplateJsonValue> = { type }
  const condition = jsonValue(property(literal, 'condition'))
  if (condition !== undefined) compact.condition = condition
  const hiddenFromDisplay = booleanValue(property(literal, 'hiddenFromDisplay'))
  if (hiddenFromDisplay !== undefined) {
    compact.hiddenFromDisplay = hiddenFromDisplay
  }
  return compact
}

function initialFieldValue(
  descriptor: ts.ObjectLiteralExpression,
  type: string,
  source: BlockSource
): { supported: boolean; value: EditorTemplateJsonValue } {
  const defaultExpression = property(descriptor, 'defaultValue')
  if (defaultExpression) {
    const value = sourceJsonValue(defaultExpression, source)
    if (value === undefined && type === 'text') return { supported: true, value: null }
    return value === undefined ? { supported: false, value: null } : { supported: true, value }
  }

  const valueExpression = property(descriptor, 'value')
  if (valueExpression) {
    const unwrapped = unwrap(valueExpression)
    let returned: EditorTemplateJsonValue | undefined
    if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
      if (!ts.isBlock(unwrapped.body)) returned = sourceJsonValue(unwrapped.body, source)
      else if (unwrapped.parameters.length === 0) {
        const statement = unwrapped.body.statements.find(ts.isReturnStatement)
        returned = sourceJsonValue(statement?.expression, source)
      }
    }
    if (returned === undefined && booleanValue(property(descriptor, 'hidden')) === true) {
      return { supported: true, value: null }
    }
    if (
      returned === undefined &&
      type === 'dropdown' &&
      valueExpression.getText().includes('NEXT_PUBLIC_E2B_ENABLED')
    ) {
      return { supported: true, value: E2B_MODE_SENTINEL }
    }
    if (
      returned === undefined &&
      valueExpression.getText().includes('resolvedOptions().timeZone')
    ) {
      return { supported: true, value: LOCAL_TIMEZONE_SENTINEL }
    }
    if (returned === undefined && valueExpression.getText().includes('generateId()')) {
      return { supported: true, value: '__GENERATE_ID__' }
    }
    if (returned === undefined && type === 'text') {
      return { supported: true, value: null }
    }
    return returned === undefined
      ? { supported: false, value: null }
      : { supported: true, value: returned }
  }

  if (type === 'table') return { supported: true, value: [] }
  if (type === 'input-format' || type === 'response-format') {
    return {
      supported: true,
      value: [{ id: '__GENERATE_ID__', name: '', type: 'string', value: '', collapsed: false }],
    }
  }
  return { supported: true, value: null }
}

function fieldOptions(
  descriptor: ts.ObjectLiteralExpression,
  source: BlockSource
): Array<{ id: string; label: string }> | undefined {
  const expression = property(descriptor, 'options')
  const value = expression ? unwrap(expression) : undefined
  const array =
    value && ts.isIdentifier(value)
      ? arrayLiteral(source.declarations.get(value.text))
      : arrayLiteral(value)
  if (!array) return undefined
  const options: Array<{ id: string; label: string }> = []
  for (const element of array.elements) {
    if (ts.isSpreadElement(element)) return undefined
    const option = objectLiteral(element)
    const id = sourceJsonValue(property(option, 'id'), source)
    const label = sourceJsonValue(property(option, 'label'), source)
    if ((typeof id !== 'string' && typeof id !== 'number') || typeof label !== 'string') {
      return undefined
    }
    options.push({ id: String(id), label })
  }
  return options
}

function isTriggerSubBlockSpread(element: ts.SpreadElement): boolean {
  const spread = unwrap(element.expression)
  if (ts.isPropertyAccessExpression(spread) && spread.name.text === 'subBlocks') {
    const owner = unwrap(spread.expression)
    if (ts.isCallExpression(owner)) {
      const called = unwrap(owner.expression)
      return ts.isIdentifier(called) && called.text === 'getTrigger'
    }
  }
  if (
    ts.isCallExpression(spread) &&
    ts.isPropertyAccessExpression(unwrap(spread.expression)) &&
    unwrap(spread.expression).name.text === 'flatMap'
  ) {
    return spread.arguments.some((argument) => argument.getText().includes('getTrigger('))
  }
  return false
}

function expandedSubBlockElements(
  array: ts.ArrayLiteralExpression,
  source: BlockSource,
  seen = new Set<ts.ArrayLiteralExpression>()
): ts.Expression[] | undefined {
  if (seen.has(array)) return undefined
  seen.add(array)
  const elements: ts.Expression[] = []
  for (const element of array.elements) {
    if (!ts.isSpreadElement(element)) {
      elements.push(element)
      continue
    }
    if (isTriggerSubBlockSpread(element)) continue
    const spread = unwrap(element.expression)
    let inherited: ts.ArrayLiteralExpression | undefined
    if (ts.isIdentifier(spread)) {
      inherited =
        arrayLiteral(source.declarations.get(spread.text)) ?? sharedSubBlockArrays.get(spread.text)
    } else if (ts.isCallExpression(spread)) {
      const called = unwrap(spread.expression)
      if (ts.isIdentifier(called)) inherited = sharedSubBlockArrays.get(called.text)
    } else if (ts.isPropertyAccessExpression(spread) && spread.name.text === 'subBlocks') {
      const owner = resolvedObject(spread.expression, source)
      const inheritedExpression = owner ? blockProperty(source, 'subBlocks', owner) : undefined
      inherited = arrayLiteral(inheritedExpression)
    }
    if (!inherited) return undefined
    const nested = expandedSubBlockElements(inherited, source, seen)
    if (!nested) return undefined
    elements.push(...nested)
  }
  return elements
}

function subBlockFilterResult(
  expression: ts.Expression,
  parameterName: string,
  id: string
): boolean | undefined {
  const value = unwrap(expression)
  if (ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.ExclamationToken) {
    const result = subBlockFilterResult(value.operand, parameterName, id)
    return result === undefined ? undefined : !result
  }
  if (ts.isBinaryExpression(value)) {
    if (
      value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      value.operatorToken.kind === ts.SyntaxKind.BarBarToken
    ) {
      const left = subBlockFilterResult(value.left, parameterName, id)
      const right = subBlockFilterResult(value.right, parameterName, id)
      if (left === undefined || right === undefined) return undefined
      return value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        ? left && right
        : left || right
    }
    const left = unwrap(value.left)
    const expected = stringValue(value.right)
    if (
      expected !== undefined &&
      ts.isPropertyAccessExpression(left) &&
      ts.isIdentifier(left.expression) &&
      left.expression.text === parameterName &&
      left.name.text === 'id'
    ) {
      if (
        value.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        value.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken
      ) {
        return id === expected
      }
      if (
        value.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        value.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken
      ) {
        return id !== expected
      }
    }
  }
  if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression)) {
    const method = value.expression
    const target = unwrap(method.expression)
    const prefix = stringValue(value.arguments[0])
    if (
      method.name.text === 'startsWith' &&
      prefix !== undefined &&
      ts.isPropertyAccessExpression(target) &&
      ts.isIdentifier(target.expression) &&
      target.expression.text === parameterName &&
      target.name.text === 'id'
    ) {
      return id.startsWith(prefix)
    }
  }
  return undefined
}

function expandedSubBlockExpression(
  expression: ts.Expression | undefined,
  source: BlockSource,
  seen = new Set<string>()
): ts.Expression[] | undefined {
  if (!expression) return undefined
  const value = unwrap(expression)
  if (ts.isArrayLiteralExpression(value)) return expandedSubBlockElements(value, source)
  if (ts.isIdentifier(value)) {
    if (seen.has(value.text)) return undefined
    seen.add(value.text)
    return expandedSubBlockExpression(source.declarations.get(value.text), source, seen)
  }
  if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    return (
      expandedSubBlockExpression(value.left, source, seen) ??
      expandedSubBlockExpression(value.right, source, seen)
    )
  }
  if (ts.isPropertyAccessExpression(value) && value.name.text === 'subBlocks') {
    const owner = resolvedObject(value.expression, source)
    return owner
      ? expandedSubBlockExpression(blockProperty(source, 'subBlocks', owner), source, seen)
      : undefined
  }
  if (
    ts.isCallExpression(value) &&
    ts.isPropertyAccessExpression(value.expression) &&
    value.expression.name.text === 'filter'
  ) {
    const elements = expandedSubBlockExpression(value.expression.expression, source, seen)
    const callback = value.arguments[0]
    if (
      !elements ||
      !callback ||
      (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) ||
      callback.parameters.length !== 1 ||
      !ts.isIdentifier(callback.parameters[0].name) ||
      ts.isBlock(callback.body)
    ) {
      return undefined
    }
    const parameterName = callback.parameters[0].name.text
    const filtered: ts.Expression[] = []
    for (const element of elements) {
      const descriptor = objectLiteral(element)
      const id = stringValue(property(descriptor, 'id'))
      if (!id) return undefined
      const included = subBlockFilterResult(callback.body, parameterName, id)
      if (included === undefined) return undefined
      if (included) filtered.push(element)
    }
    return filtered
  }
  return undefined
}

function editorTemplate(
  entry: RegistryEntry,
  source: BlockSource
): EditorBlockTemplateV1 | undefined {
  const block = source.block
  if (!block) return excludeEditorTemplate(entry.id, 'missing-block-literal')
  if (stringValue(blockProperty(source, 'category')) === 'triggers') {
    return excludeEditorTemplate(entry.id, 'trigger')
  }
  const subBlocksExpression = blockProperty(source, 'subBlocks')
  const outputObject = resolvedObject(blockProperty(source, 'outputs'), source)
  if (!subBlocksExpression) return excludeEditorTemplate(entry.id, 'missing-sub-blocks')
  if (!outputObject) return excludeEditorTemplate(entry.id, 'missing-outputs')
  const subBlockElements = expandedSubBlockExpression(subBlocksExpression, source)
  if (!subBlockElements) return excludeEditorTemplate(entry.id, 'dynamic-field-spread')

  const fields: EditorBlockTemplateFieldV1[] = []
  for (const element of subBlockElements) {
    const descriptor = objectLiteral(element)
    const id = stringValue(property(descriptor, 'id'))
    const type = stringValue(property(descriptor, 'type'))
    if (!descriptor || !id || !type) return excludeEditorTemplate(entry.id, 'invalid-field')
    const initial = initialFieldValue(descriptor, type, source)
    if (!initial.supported) return excludeEditorTemplate(entry.id, 'dynamic-field-default')
    if (JSON.stringify(initial.value).length > 4_096) {
      return excludeEditorTemplate(entry.id, 'field-default-too-large')
    }
    const modeValue = stringValue(property(descriptor, 'mode'))
    const placeholder = stringValue(property(descriptor, 'placeholder'))
    const columnsValue = sourceJsonValue(property(descriptor, 'columns'), source)
    fields.push({
      id,
      title: stringValue(property(descriptor, 'title')) || id,
      type,
      required: booleanValue(property(descriptor, 'required')) ?? false,
      mode: modeValue === 'advanced' || modeValue === 'trigger-advanced' ? 'advanced' : 'basic',
      placeholder:
        placeholder && placeholder.length <= 160 && !placeholder.includes('\n')
          ? placeholder
          : undefined,
      canonicalParamId: stringValue(property(descriptor, 'canonicalParamId')),
      columns:
        Array.isArray(columnsValue) && columnsValue.every((column) => typeof column === 'string')
          ? columnsValue
          : undefined,
      selectorKey: stringValue(property(descriptor, 'selectorKey')),
      selectorAllowSearch: booleanValue(property(descriptor, 'selectorAllowSearch')),
      serviceId: stringValue(property(descriptor, 'serviceId')),
      mimeType: stringValue(property(descriptor, 'mimeType')),
      credentialKind: (() => {
        const value = stringValue(property(descriptor, 'credentialKind'))
        return value === 'oauth' || value === 'service-account' || value === 'any'
          ? value
          : undefined
      })(),
      dependsOn: sourceJsonValue(property(descriptor, 'dependsOn'), source),
      condition: sourceJsonValue(property(descriptor, 'condition'), source),
      options: fieldOptions(descriptor, source),
      minimum:
        typeof sourceJsonValue(property(descriptor, 'min'), source) === 'number'
          ? (sourceJsonValue(property(descriptor, 'min'), source) as number)
          : undefined,
      maximum:
        typeof sourceJsonValue(property(descriptor, 'max'), source) === 'number'
          ? (sourceJsonValue(property(descriptor, 'max'), source) as number)
          : undefined,
      multiple: booleanValue(property(descriptor, 'multiSelect')),
      readOnly: booleanValue(property(descriptor, 'readOnly')),
      initialValue: initial.value,
    })
  }

  const uniqueFields = [...new Map(fields.map((field) => [field.id, field])).values()]
  const outputs: Record<string, EditorTemplateJsonValue> = {}
  for (const member of outputObject.properties) {
    if (!ts.isPropertyAssignment(member)) {
      return excludeEditorTemplate(entry.id, 'dynamic-output')
    }
    const key = propertyName(member.name)
    const compact = compactOutputExpression(member.initializer)
    if (!key || compact === undefined) return excludeEditorTemplate(entry.id, 'dynamic-output')
    outputs[key] = compact
  }

  const canonicalGroups = new Map<string, { basic: boolean; advanced: boolean }>()
  for (const field of uniqueFields) {
    if (!field.canonicalParamId) continue
    const group = canonicalGroups.get(field.canonicalParamId) ?? {
      basic: false,
      advanced: false,
    }
    if (field.mode === 'advanced') group.advanced = true
    else group.basic = true
    canonicalGroups.set(field.canonicalParamId, group)
  }
  const canonicalModes = Object.fromEntries(
    [...canonicalGroups.entries()]
      .filter(([, group]) => group.basic && group.advanced)
      .map(([id]) => [id, 'basic' as const])
  )

  return {
    catalogVersion: 1,
    type: entry.id,
    name: stringValue(blockProperty(source, 'name')) ?? entry.id.replaceAll('_', ' '),
    kind: 'action',
    singleInstance: booleanValue(blockProperty(source, 'singleInstance')) ?? false,
    fields: uniqueFields,
    outputs,
    canonicalModes,
  }
}

function canonicalModes(
  fields: EditorBlockTemplateFieldV1[]
): Record<string, 'basic' | 'advanced'> {
  const groups = new Map<string, { basic: boolean; advanced: boolean }>()
  for (const field of fields) {
    if (!field.canonicalParamId) continue
    const group = groups.get(field.canonicalParamId) ?? { basic: false, advanced: false }
    group[field.mode] = true
    groups.set(field.canonicalParamId, group)
  }
  return Object.fromEntries(
    [...groups.entries()]
      .filter(([, group]) => group.basic && group.advanced)
      .map(([id]) => [id, 'basic' as const])
  )
}

function cloneTemplate(
  templates: Map<string, EditorBlockTemplateV1>,
  sourceType: string,
  type: string,
  name?: string
): EditorBlockTemplateV1 {
  const source = templates.get(sourceType)
  if (!source) throw new Error(`Editor template recipe ${type} requires ${sourceType}`)
  return {
    ...structuredClone(source),
    type,
    name: name ?? source.name.replace(/ \(Legacy\)$/, ''),
  }
}

function field(
  id: string,
  title: string,
  type: string,
  options: Partial<EditorBlockTemplateFieldV1> = {}
): EditorBlockTemplateFieldV1 {
  return {
    id,
    title,
    type,
    required: false,
    mode: 'basic',
    initialValue: null,
    ...options,
  }
}

function templateIgnoringDynamicSpreads(
  entry: RegistryEntry,
  source: BlockSource
): EditorBlockTemplateV1 | undefined {
  if (!source.block) return undefined
  const expression = blockProperty(source, 'subBlocks')
  const array = arrayLiteral(expression)
  if (!array) return undefined
  const staticElements = array.elements.filter(
    (element): element is ts.Expression => !ts.isSpreadElement(element)
  )
  const block = ts.factory.createObjectLiteralExpression([
    ts.factory.createSpreadAssignment(source.block),
    ts.factory.createPropertyAssignment(
      'subBlocks',
      ts.factory.createArrayLiteralExpression(staticElements)
    ),
  ])
  return editorTemplate(entry, { ...source, block })
}

function providerCredentialFields(): EditorBlockTemplateFieldV1[] {
  const hallucinationCondition = { field: 'validationType', value: ['hallucination'] }
  return [
    field('vertexCredential', 'Google Cloud Account', 'oauth-input', {
      canonicalParamId: 'vertexCredential',
      placeholder: 'Select Google Cloud account',
      required: true,
      condition: hallucinationCondition,
    }),
    field('vertexManualCredential', 'Google Cloud Account', 'short-input', {
      canonicalParamId: 'vertexCredential',
      placeholder: 'Enter credential ID',
      required: true,
      mode: 'advanced',
      condition: hallucinationCondition,
    }),
    field('apiKey', 'API Key', 'short-input', {
      placeholder: 'Enter your API key',
      required: true,
      condition: hallucinationCondition,
    }),
    field('azureEndpoint', 'Azure Endpoint', 'short-input', {
      placeholder: 'https://your-resource.services.ai.azure.com',
      condition: hallucinationCondition,
    }),
    field('azureApiVersion', 'Azure API Version', 'short-input', {
      placeholder: 'Enter API version',
      condition: hallucinationCondition,
    }),
    field('vertexProject', 'Vertex AI Project', 'short-input', {
      placeholder: 'your-gcp-project-id',
      required: true,
      condition: hallucinationCondition,
    }),
    field('vertexLocation', 'Vertex AI Location', 'short-input', {
      placeholder: 'us-central1',
      required: true,
      condition: hallucinationCondition,
    }),
    field('bedrockAccessKeyId', 'AWS Access Key ID', 'short-input', {
      placeholder: 'Enter your AWS Access Key ID',
      required: true,
      condition: hallucinationCondition,
    }),
    field('bedrockSecretKey', 'AWS Secret Access Key', 'short-input', {
      placeholder: 'Enter your AWS Secret Access Key',
      required: true,
      condition: hallucinationCondition,
    }),
    field('bedrockRegion', 'AWS Region', 'short-input', {
      placeholder: 'us-east-1',
      condition: hallucinationCondition,
    }),
  ]
}

interface EnrichmentDefinition {
  id: string
  name: string
  inputs: Array<{ id: string; name: string; required?: boolean; description?: string }>
  outputs: Array<{ id: string; type: string }>
}

async function enrichmentTemplate(): Promise<EditorBlockTemplateV1> {
  const registryFile = path.join(appDirectory, 'enrichments', 'registry.ts')
  const registry = (await import(pathToFileURL(registryFile).href)) as {
    ALL_ENRICHMENTS: EnrichmentDefinition[]
  }
  const enrichments = registry.ALL_ENRICHMENTS
  const outputOperations = new Map<string, string[]>()
  const outputTypes = new Map<string, string>()
  for (const enrichment of enrichments) {
    for (const output of enrichment.outputs) {
      const operations = outputOperations.get(output.id) ?? []
      operations.push(enrichment.id)
      outputOperations.set(output.id, operations)
      outputTypes.set(output.id, output.type)
    }
  }
  return {
    catalogVersion: 1,
    type: 'enrichment',
    name: 'Data Enrichment',
    kind: 'action',
    singleInstance: false,
    fields: [
      field('operation', 'Enrichment', 'dropdown', {
        options: enrichments.map((enrichment) => ({ id: enrichment.id, label: enrichment.name })),
        initialValue: enrichments[0]?.id ?? '',
      }),
      ...enrichments.flatMap((enrichment) =>
        enrichment.inputs.map((input) =>
          field(`${enrichment.id}__${input.id}`, input.name, 'short-input', {
            required: input.required ?? false,
            placeholder: input.description ?? `Enter ${input.name.toLowerCase()}`,
            condition: { field: 'operation', value: enrichment.id },
          })
        )
      ),
    ],
    outputs: {
      ...Object.fromEntries(
        [...outputOperations].map(([id, operations]) => [
          id,
          {
            type: outputTypes.get(id) ?? 'string',
            condition: { field: 'operation', value: operations },
          },
        ])
      ),
      matched: { type: 'boolean' },
      provider: { type: 'string' },
    },
    canonicalModes: {},
  }
}

const triggerSourceDefinitions: Record<string, Array<{ file: string; symbol: string }>> = {
  circleback: [
    { file: 'circleback/meeting_completed.ts', symbol: 'circlebackMeetingCompletedTrigger' },
    { file: 'circleback/meeting_notes.ts', symbol: 'circlebackMeetingNotesTrigger' },
    { file: 'circleback/webhook.ts', symbol: 'circlebackWebhookTrigger' },
  ],
  generic_webhook: [{ file: 'generic/webhook.ts', symbol: 'genericWebhookTrigger' }],
  imap: [{ file: 'imap/poller.ts', symbol: 'imapPollingTrigger' }],
  rss: [{ file: 'rss/poller.ts', symbol: 'rssPollingTrigger' }],
  sim_workspace_event: [{ file: 'sim/workspace-event.ts', symbol: 'simWorkspaceEventTrigger' }],
}

async function triggerTemplate(
  entry: RegistryEntry,
  blockSourceValue: BlockSource
): Promise<EditorBlockTemplateV1 | undefined> {
  if (!blockSourceValue.block) return undefined
  const definitions = triggerSourceDefinitions[entry.id]
  const sources = definitions
    ? await Promise.all(
        definitions.map(({ file, symbol }) =>
          sourceFromFile(path.join(appDirectory, 'triggers', file), symbol)
        )
      )
    : [blockSourceValue]
  const elements: ts.Expression[] = []
  const declarations = new Map(blockSourceValue.declarations)
  const literalBindings = new Map(blockSourceValue.literalBindings)

  for (const source of sources) {
    for (const [name, expression] of source.declarations) declarations.set(name, expression)
    for (const [name, value] of source.literalBindings) literalBindings.set(name, value)
    const subBlocks = blockProperty(source, 'subBlocks')
    const expanded = expandedSubBlockExpression(subBlocks, source)
    if (!expanded) return undefined
    elements.push(...expanded)
  }

  const block = ts.factory.createObjectLiteralExpression([
    ts.factory.createSpreadAssignment(blockSourceValue.block),
    ts.factory.createPropertyAssignment('category', ts.factory.createStringLiteral('blocks')),
    ts.factory.createPropertyAssignment(
      'subBlocks',
      ts.factory.createArrayLiteralExpression(elements)
    ),
  ])
  const template = editorTemplate(entry, {
    block,
    declarations,
    literalBindings,
  })
  if (!template) return undefined
  template.kind = 'trigger'
  if (entry.id === 'start_trigger') {
    template.outputs = {
      input: { type: 'string' },
      conversationId: { type: 'string' },
      files: { type: 'file[]' },
    }
  }
  return template
}

async function applyEditorTemplateRecipes(
  templates: EditorBlockTemplateV1[],
  entries: RegistryEntry[],
  sources: Map<string, BlockSource>
): Promise<EditorBlockTemplateV1[]> {
  const byType = new Map(templates.map((template) => [template.type, template]))
  const add = (template: EditorBlockTemplateV1 | undefined) => {
    if (!template) return
    template.canonicalModes = canonicalModes(template.fields)
    byType.set(template.type, template)
    editorTemplateExclusions.delete(template.type)
  }

  for (const [type, sourceType, title, placeholder] of [
    ['extend_v2', 'extend', 'Document', 'Connect a file output from another block'],
    ['pulse_v2', 'pulse', 'Document', 'File reference'],
    ['reducto_v2', 'reducto', 'PDF Document', 'File reference'],
  ] as const) {
    const template = cloneTemplate(byType, sourceType, type)
    template.fields = template.fields.flatMap((item) => {
      if (item.id === 'filePath') return []
      if (item.id !== 'fileUpload') return [item]
      return [
        { ...item, canonicalParamId: 'file' },
        field('fileReference', title, 'short-input', {
          canonicalParamId: 'file',
          placeholder,
          mode: 'advanced',
          required: true,
        }),
      ]
    })
    add(template)
  }

  const slides = cloneTemplate(byType, 'google_slides', 'google_slides_v2', 'Google Slides')
  slides.fields = slides.fields.flatMap((item) => {
    if (item.id === 'imageFile') return [{ ...item, canonicalParamId: 'imageFile' }]
    if (item.id !== 'imageUrl') return [item]
    return [
      field('imageFileReference', 'Image', 'short-input', {
        canonicalParamId: 'imageFile',
        placeholder: 'Reference image from previous blocks',
        mode: 'advanced',
        required: true,
        condition: { field: 'operation', value: 'add_image' },
      }),
    ]
  })
  add(slides)

  add(cloneTemplate(byType, 'linear', 'linear_v2', 'Linear'))

  const slack = cloneTemplate(byType, 'slack', 'slack_v2', 'Slack')
  slack.fields = slack.fields.flatMap((item) => {
    if (item.id === 'authMethod' || item.id === 'botToken' || item.id === 'botCredential') return []
    if (item.id === 'credential') {
      return [
        {
          ...item,
          condition: undefined,
          placeholder: 'Select Slack account or bot',
        },
      ]
    }
    if (item.id === 'manualCredential') {
      return [{ ...item, condition: undefined, placeholder: 'Enter credential ID' }]
    }
    const condition = item.condition
    if (
      condition &&
      typeof condition === 'object' &&
      !Array.isArray(condition) &&
      condition.field === 'authMethod'
    ) {
      return [{ ...item, condition: undefined }]
    }
    return [item]
  })
  add(slack)

  const grain = cloneTemplate(byType, 'grain', 'grain_v2', 'Grain')
  grain.fields = grain.fields.flatMap((item) => {
    if (['selectedTriggerId', 'viewId', 'hookUrl', 'hookId'].includes(item.id)) return []
    if (item.id === 'operation') {
      return [
        {
          ...item,
          options: [
            { label: 'List Recordings', id: 'grain_list_recordings' },
            { label: 'Get Recording', id: 'grain_get_recording' },
            { label: 'Get Transcript', id: 'grain_get_transcript' },
            { label: 'List Teams', id: 'grain_list_teams' },
            { label: 'List Meeting Types', id: 'grain_list_meeting_types' },
            { label: 'Create Webhook', id: 'grain_create_hook_v2' },
            { label: 'List Webhooks', id: 'grain_list_hooks_v2' },
            { label: 'Delete Webhook', id: 'grain_delete_hook_v2' },
          ],
        },
      ]
    }
    return [{ ...item, mode: item.id === 'cursor' ? 'advanced' : item.mode }]
  })
  const hookTypes = [
    { label: 'Recording Added', id: 'recording_added' },
    { label: 'Recording Updated', id: 'recording_updated' },
    { label: 'Recording Deleted', id: 'recording_deleted' },
    { label: 'Highlight Added', id: 'highlight_added' },
    { label: 'Highlight Updated', id: 'highlight_updated' },
    { label: 'Highlight Deleted', id: 'highlight_deleted' },
    { label: 'Story Added', id: 'story_added' },
    { label: 'Story Updated', id: 'story_updated' },
    { label: 'Story Deleted', id: 'story_deleted' },
    { label: 'Upload Status', id: 'upload_status' },
  ]
  grain.fields.push(
    field('hookUrl', 'Webhook URL', 'short-input', {
      placeholder: 'Enter webhook endpoint URL',
      required: true,
      condition: { field: 'operation', value: ['grain_create_hook_v2'] },
    }),
    field('hookType', 'Event Type', 'dropdown', {
      options: hookTypes,
      initialValue: 'recording_added',
      required: true,
      condition: { field: 'operation', value: ['grain_create_hook_v2'] },
    }),
    field('hookInclude', 'Include Options', 'code', {
      placeholder: '{"participants": true, "highlights": true, "ai_summary": true}',
      mode: 'advanced',
      condition: { field: 'operation', value: ['grain_create_hook_v2'] },
    }),
    field('hookTypeFilter', 'Event Type Filter', 'dropdown', {
      options: [{ label: 'All', id: '' }, ...hookTypes],
      initialValue: '',
      mode: 'advanced',
      condition: { field: 'operation', value: ['grain_list_hooks_v2'] },
    }),
    field('hookState', 'State Filter', 'dropdown', {
      options: [
        { label: 'All', id: '' },
        { label: 'Enabled', id: 'enabled' },
        { label: 'Disabled', id: 'disabled' },
      ],
      initialValue: '',
      mode: 'advanced',
      condition: { field: 'operation', value: ['grain_list_hooks_v2'] },
    }),
    field('hookId', 'Webhook ID', 'short-input', {
      placeholder: 'Enter webhook UUID to delete',
      required: true,
      condition: { field: 'operation', value: ['grain_delete_hook_v2'] },
    })
  )
  add(grain)

  const video = cloneTemplate(byType, 'video_generator_v2', 'video_generator_v3', 'Video Generator')
  const falModels = [
    ['Google Veo 3.1', 'veo-3.1'],
    ['Google Veo 3.1 Fast', 'veo-3.1-fast'],
    ['OpenAI Sora 2', 'sora-2'],
    ['OpenAI Sora 2 Pro', 'sora-2-pro'],
    ['ByteDance Seedance 2.0', 'seedance-2.0'],
    ['ByteDance Seedance 2.0 Fast', 'seedance-2.0-fast'],
    ['Kling 3.0 Pro', 'kling-v3-pro'],
    ['Kling 3.0 4K', 'kling-v3-4k'],
    ['Kling O3 Pro', 'kling-o3-pro'],
    ['Kling O3 4K', 'kling-o3-4k'],
    ['MiniMax Hailuo 2.3 Pro', 'minimax-hailuo-2.3-pro'],
    ['MiniMax Hailuo 2.3 Standard', 'minimax-hailuo-2.3-standard'],
    ['WAN 2.2 A14B Turbo', 'wan-2.2-a14b-turbo'],
    ['LTX 2.3', 'ltx-2.3'],
    ['LTX 2.3 Fast', 'ltx-2.3-fast'],
  ].map(([label, id]) => ({ label, id }))
  video.fields = video.fields.map((item) =>
    item.id === 'model' &&
    item.condition &&
    typeof item.condition === 'object' &&
    !Array.isArray(item.condition) &&
    item.condition.field === 'provider' &&
    item.condition.value === 'falai'
      ? { ...item, options: falModels }
      : item
  )
  add(video)

  for (const type of ['guardrails', 'pi'] as const) {
    const entry = entries.find((candidate) => candidate.id === type)
    const source = sources.get(type)
    const template = entry && source ? templateIgnoringDynamicSpreads(entry, source) : undefined
    if (template) {
      template.fields.push(...providerCredentialFields())
      if (type === 'pi') {
        const mode = template.fields.find((item) => item.id === 'mode')
        if (mode) {
          mode.options = [
            { label: 'Create PR', id: 'cloud' },
            { label: 'Review Code', id: 'cloud_review' },
            { label: 'Local Dev', id: 'local' },
          ]
        }
        for (const item of template.fields) {
          if (providerCredentialFields().some((provider) => provider.id === item.id)) {
            item.condition = undefined
          }
        }
      }
      add(template)
    }
  }

  add(await enrichmentTemplate())
  for (const entry of entries) {
    const source = sources.get(entry.id)
    if (source && stringValue(blockProperty(source, 'category')) === 'triggers') {
      add(await triggerTemplate(entry, source))
    }
  }
  return [...byType.values()].sort((left, right) => left.type.localeCompare(right.type))
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

function resolveImportedModule(specifier: string, importer: string): string | undefined {
  if (!specifier.startsWith('@/') && !specifier.startsWith('.')) return undefined
  const base = specifier.startsWith('@/')
    ? path.join(appDirectory, specifier.slice(2))
    : path.resolve(path.dirname(importer), specifier)
  return [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(
    (candidate) => Bun.file(candidate).size > 0
  )
}

async function importedLiteralBindings(
  source: ts.SourceFile,
  file: string,
  referencedText: string
): Promise<Map<string, EditorTemplateJsonValue>> {
  const bindings = new Map<string, EditorTemplateJsonValue>()
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue
    }
    const requested = statement.importClause.namedBindings.elements.filter((element) =>
      referencedText.includes(element.name.text)
    )
    if (requested.length === 0) continue
    const importedFile = resolveImportedModule(statement.moduleSpecifier.text, file)
    if (!importedFile) continue
    const importedSource = parseSource(importedFile, await readFile(importedFile, 'utf8'))
    for (const element of requested) {
      const importedName = element.propertyName?.text ?? element.name.text
      const localName = element.name.text
      for (const importedStatement of importedSource.statements) {
        if (ts.isVariableStatement(importedStatement)) {
          for (const declaration of importedStatement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== importedName)
              continue
            const value = jsonValue(declaration.initializer)
            if (value !== undefined) bindings.set(localName, value)
          }
        }
        if (
          !ts.isEnumDeclaration(importedStatement) ||
          importedStatement.name.text !== importedName
        ) {
          continue
        }
        for (const member of importedStatement.members) {
          const name = propertyName(member.name)
          const value = jsonValue(member.initializer)
          if (name && value !== undefined) bindings.set(`${localName}.${name}`, value)
        }
      }
    }
  }
  return bindings
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

async function blockSource(entry: RegistryEntry): Promise<BlockSource> {
  const file = resolveModule(entry.moduleSpecifier)
  return sourceFromFile(file, entry.symbol)
}

async function sourceFromFile(file: string, symbol: string): Promise<BlockSource> {
  const source = parseSource(file, await readFile(file, 'utf8'))
  const declarations = new Map<string, ts.Expression>()
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        declarations.set(declaration.name.text, declaration.initializer)
      }
    }
  }
  const referencedText = declarations.get(symbol)?.getText() ?? ''
  const literalBindings = await importedLiteralBindings(source, file, referencedText)
  const result: BlockSource = { block: undefined, declarations, literalBindings }
  result.block = resolvedObject(declarations.get(symbol), result)
  return result
}

async function loadSharedSubBlockArrays(): Promise<void> {
  const utilitiesPath = path.join(appDirectory, 'blocks', 'utils.ts')
  const source = parseSource(utilitiesPath, await readFile(utilitiesPath, 'utf8'))
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        const array = arrayLiteral(declaration.initializer)
        if (array && declaration.name.text === 'SERVICE_ACCOUNT_SUBBLOCKS') {
          sharedSubBlockArrays.set(declaration.name.text, array)
        }
      }
    }
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'getProviderCredentialSubBlocks' &&
      statement.body
    ) {
      const returned = statement.body.statements.find(ts.isReturnStatement)
      const array = arrayLiteral(returned?.expression)
      if (array) sharedSubBlockArrays.set(statement.name.text, array)
    }
  }
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

function editorTemplateBucket(type: string): string {
  let value = 0
  for (const character of type) value = (value * 31 + character.charCodeAt(0)) >>> 0
  return (value % 16).toString(16)
}

async function expectedArtifacts(): Promise<{
  artifacts: Map<string, string>
  itemCount: number
  integrationCount: number
  gzipBytes: number
  templateCount: number
  templateGzipBytes: number
}> {
  const integrations = JSON.parse(await readFile(integrationsPath, 'utf8')) as IntegrationsSource
  const integrationsByType = new Map(
    integrations.integrations.map((integration) => [integration.type, integration])
  )
  const items: ToolCatalogItemV1[] = []
  const blocksById = new Map<string, ts.ObjectLiteralExpression | undefined>()
  const blockSourcesById = new Map<string, BlockSource>()
  const entries = await registryEntries()
  await loadSharedSubBlockArrays()

  for (const entry of entries) {
    const source = await blockSource(entry)
    const block = source.block
    blocksById.set(entry.id, block)
    blockSourcesById.set(entry.id, source)
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
  const parsedTemplates = entries
    .flatMap((entry) => {
      const source = blockSourcesById.get(entry.id)
      const template = source ? editorTemplate(entry, source) : undefined
      return template ? [template] : []
    })
    .sort((left, right) => left.type.localeCompare(right.type))
  const templates = await applyEditorTemplateRecipes(parsedTemplates, entries, blockSourcesById)
  for (const template of templates) editorTemplateExclusions.delete(template.type)
  const templateTypes = new Set(templates.map((template) => template.type))
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
        editorCreatable: templateTypes.has(id),
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

  const templateArtifacts = new Map<string, string>()
  const templateGzipBytes = [...Array(16).keys()].reduce((total, index) => {
    const bucket = index.toString(16)
    const content = serialized({
      catalogVersion: 1,
      catalogHash,
      templates: templates.filter((template) => editorTemplateBucket(template.type) === bucket),
    })
    const shardGzipBytes = gzipSync(content).byteLength
    if (shardGzipBytes > editorTemplateShardBudgetBytes) {
      throw new Error(
        `Editor template shard ${bucket} is ${shardGzipBytes} gzip bytes; budget is ${editorTemplateShardBudgetBytes}`
      )
    }
    templateArtifacts.set(path.join(editorTemplatesDirectory, `${bucket}.json`), content)
    return total + shardGzipBytes
  }, 0)
  if (templateGzipBytes > editorTemplatesBudgetBytes) {
    throw new Error(
      `Editor block templates are ${templateGzipBytes} gzip bytes; budget is ${editorTemplatesBudgetBytes}`
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
  artifacts.set(
    path.join(generatedDirectory, 'agent-tool-options.json'),
    serialized({
      catalogVersion: 1,
      catalogHash,
      items: items
        .filter((item) => item.capabilities.length > 0)
        .map((item) => ({
          type: item.id,
          title: item.display.name,
          capabilities: item.capabilities,
        })),
    })
  )
  for (const [file, content] of templateArtifacts) artifacts.set(file, content)
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
    templateCount: templates.length,
    templateGzipBytes,
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
  let actualEditorShards: string[] = []
  try {
    actualEditorShards = (await readdir(editorTemplatesDirectory)).sort()
  } catch {
    // A missing directory is represented as an empty generated shard set.
  }
  const expectedEditorShards = [...expected.keys()]
    .filter((file) => path.dirname(file) === editorTemplatesDirectory)
    .map((file) => path.basename(file))
    .sort()
  if (JSON.stringify(actualEditorShards) !== JSON.stringify(expectedEditorShards)) {
    failures.push(path.relative(root, editorTemplatesDirectory))
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
    await mkdir(editorTemplatesDirectory, { recursive: true })
    for (const [file, content] of result.artifacts) {
      await writeFile(file, content, 'utf8')
    }
  }
  console.log(
    `${process.argv.includes('--check') ? 'Verified' : 'Generated'} ${result.itemCount} catalog ` +
      `items; ${result.integrationCount} UI integrations matched; browser summary ` +
      `${result.gzipBytes} gzip bytes; ${result.templateCount} editor templates ` +
      `${result.templateGzipBytes} gzip bytes`
  )
  if (process.argv.includes('--explain-editor-templates')) {
    const counts = Object.fromEntries(
      [...editorTemplateExclusions.values()].sort().reduce((result, reason) => {
        result.set(reason, (result.get(reason) ?? 0) + 1)
        return result
      }, new Map<EditorTemplateExclusionReason, number>())
    )
    console.log(
      JSON.stringify({ counts, items: Object.fromEntries(editorTemplateExclusions) }, null, 2)
    )
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
