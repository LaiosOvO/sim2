#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { apiErrorEnvelopeSchema } from '@sim/api-contracts/errors'
import { requestIdentitySchema } from '@sim/api-contracts/identity'
import { pageRequestSchema } from '@sim/api-contracts/pagination'
import { traceContextSchema } from '@sim/api-contracts/tracing'
import { debugCommandV1Schema, debugSessionV1Schema } from '@sim/execution-contracts/debug'
import { executionEventV1Schema } from '@sim/execution-contracts/events'
import { executionJobV1Schema } from '@sim/execution-contracts/jobs'
import { toolCatalogItemV1Schema, toolCatalogPageV1Schema } from '@sim/tool-catalog'

interface JsonSchemaProvider {
  toJSONSchema(): unknown
}

const root = path.resolve(import.meta.dir, '..', '..')
const generatedDirectory = path.join(root, 'packages', 'api-contracts', 'generated')
const openApiPath = path.join(generatedDirectory, 'platform.openapi.json')
const manifestPath = path.join(generatedDirectory, 'contract-versions.json')

const schemas: Record<string, JsonSchemaProvider> = {
  ApiErrorEnvelope: apiErrorEnvelopeSchema,
  RequestIdentity: requestIdentitySchema,
  PageRequest: pageRequestSchema,
  TraceContext: traceContextSchema,
  ExecutionJobV1: executionJobV1Schema,
  ExecutionEventV1: executionEventV1Schema,
  DebugSessionV1: debugSessionV1Schema,
  DebugCommandV1: debugCommandV1Schema,
  ToolCatalogItemV1: toolCatalogItemV1Schema,
  ToolCatalogPageV1: toolCatalogPageV1Schema,
}

function jsonSafe(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '~standard' && key !== '$schema')
      .map(([key, nested]) => [key, jsonSafe(nested)])
  )
}

function serialized(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function assertCurrent(file: string, expected: string): Promise<void> {
  let actual = ''
  try {
    actual = await readFile(file, 'utf8')
  } catch {
    // The actionable stale-artifact message below also covers a missing file.
  }
  if (actual !== expected) {
    throw new Error(`${path.relative(root, file)} is stale. Run: bun run contracts:generate`)
  }
}

async function main(): Promise<void> {
  const components = Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [name, jsonSafe(schema.toJSONSchema())])
  )
  const openApi = serialized({
    openapi: '3.1.0',
    info: {
      title: 'Sim Platform Contracts',
      version: '1.0.0',
    },
    paths: {},
    components: { schemas: components },
  })
  const manifest = serialized({
    schemaVersion: 1,
    apiContractsVersion: 1,
    executionContractsVersion: 1,
    toolCatalogVersion: 1,
    schemas: Object.keys(schemas),
    unknownFieldPolicy: 'strip additive unknown fields at every versioned wire boundary',
    typescriptTypes: 'derived from the committed Zod schemas with z.infer',
  })

  if (process.argv.includes('--check')) {
    await Promise.all([assertCurrent(openApiPath, openApi), assertCurrent(manifestPath, manifest)])
    console.log(`Platform contract artifacts OK: ${Object.keys(schemas).length} schemas`)
    return
  }

  await mkdir(generatedDirectory, { recursive: true })
  await Promise.all([
    writeFile(openApiPath, openApi, 'utf8'),
    writeFile(manifestPath, manifest, 'utf8'),
  ])
  console.log(`Generated platform contract artifacts: ${Object.keys(schemas).length} schemas`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
