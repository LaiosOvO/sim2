import type {
  RuntimeProviderModule,
  RuntimeToolAdapter,
  RuntimeToolContext,
} from '@/runtime/registry/types'
import { RuntimeRegistryFailure } from '@/runtime/registry/types'

const NOTION_API_VERSION = '2022-06-28'
const NOTION_CREATE_PAGE_URL = 'https://api.notion.com/v1/pages'

export interface NotionDatabaseRow {
  id: string
  url: string
  title: string
  createdTime: string
  lastEditedTime: string
}

export interface NotionTransport {
  addDatabaseRow(input: {
    accessToken: string
    databaseId: string
    properties: Readonly<Record<string, unknown>>
    signal?: AbortSignal
  }): Promise<NotionDatabaseRow>
}

function requiredString(params: Readonly<Record<string, unknown>>, key: string): string {
  const value = params[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RuntimeRegistryFailure(
      'RUNTIME_TOOL_INPUT_INVALID',
      `${key} must be a non-empty string`
    )
  }
  return value.trim()
}

function requiredRecord(
  params: Readonly<Record<string, unknown>>,
  key: string
): Readonly<Record<string, unknown>> {
  const value = params[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RuntimeRegistryFailure('RUNTIME_TOOL_INPUT_INVALID', `${key} must be an object`)
  }
  return value as Readonly<Record<string, unknown>>
}

function titleFromProperties(properties: unknown): string {
  if (!properties || typeof properties !== 'object') return 'Untitled'
  for (const value of Object.values(properties)) {
    if (!value || typeof value !== 'object') continue
    const property = value as { type?: unknown; title?: unknown }
    if (property.type !== 'title' || !Array.isArray(property.title)) continue
    const title = property.title
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        const plainText = (part as { plain_text?: unknown }).plain_text
        return typeof plainText === 'string' ? plainText : ''
      })
      .join('')
    if (title) return title
  }
  return 'Untitled'
}

function createFetchTransport(): NotionTransport {
  return {
    async addDatabaseRow(input) {
      const response = await fetch(NOTION_CREATE_PAGE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'Notion-Version': NOTION_API_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: {
            type: 'database_id',
            database_id: input.databaseId,
          },
          properties: input.properties,
        }),
        signal: input.signal,
      })
      const body = (await response.json()) as Record<string, unknown>
      if (!response.ok) {
        const message =
          typeof body.message === 'string'
            ? body.message
            : `Notion request failed with status ${response.status}`
        throw new Error(message)
      }
      if (
        typeof body.id !== 'string' ||
        typeof body.url !== 'string' ||
        typeof body.created_time !== 'string' ||
        typeof body.last_edited_time !== 'string'
      ) {
        throw new Error('Notion returned an invalid page response')
      }
      return {
        id: body.id,
        url: body.url,
        title: titleFromProperties(body.properties),
        createdTime: body.created_time,
        lastEditedTime: body.last_edited_time,
      }
    },
  }
}

function createAddDatabaseRowTool(transport: NotionTransport): RuntimeToolAdapter {
  return {
    id: 'notion_add_database_row_v2',
    version: '2.0.0',
    async execute(params: Readonly<Record<string, unknown>>, context: RuntimeToolContext) {
      const databaseId = requiredString(params, 'databaseId')
      const properties = requiredRecord(params, 'properties')
      const credential = await context.credentials.resolve({
        providerId: 'notion',
        workspaceId: context.workspaceId,
        credentialRef: context.credentialRef,
      })
      if (credential.type !== 'bearer' || !credential.token) {
        throw new RuntimeRegistryFailure(
          'RUNTIME_CREDENTIAL_NOT_FOUND',
          'Notion requires a bearer credential'
        )
      }
      const row = await transport.addDatabaseRow({
        accessToken: credential.token,
        databaseId,
        properties,
        signal: context.signal,
      })
      return {
        id: row.id,
        url: row.url,
        title: row.title,
        created_time: row.createdTime,
        last_edited_time: row.lastEditedTime,
      }
    },
  }
}

export function createNotionRuntimeProvider(
  transport: NotionTransport = createFetchTransport()
): RuntimeProviderModule {
  return {
    providerId: 'notion',
    buildMarker: 'runtime-provider:notion:lazy-chunk',
    tools: [createAddDatabaseRowTool(transport)],
  }
}
