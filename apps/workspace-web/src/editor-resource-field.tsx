import { useEffect, useId, useMemo, useState } from 'react'
import type { EditorBlockTemplateFieldV1, EditorTemplateJsonValue } from '@sim/tool-catalog'
import { requestJson } from './api'
import type { EditorWorkflow } from './editor-api'

interface ResourceOption {
  id: string
  label: string
}

interface EditorResourceFieldProps {
  blockId: string
  disabled: boolean
  field: EditorBlockTemplateFieldV1
  templateFields: EditorBlockTemplateFieldV1[]
  onError: (message: string | null) => void
  onValue: (value: EditorTemplateJsonValue) => void
  value: unknown
  workflow: EditorWorkflow
}

interface ResourceRequest {
  init?: RequestInit
  path: string
  select: (payload: unknown) => ResourceOption[]
}

type SelectorContext = Record<string, string>

const coreResourceTypes = new Set([
  'column-selector',
  'knowledge-base-selector',
  'mcp-server-selector',
  'mcp-tool-selector',
  'oauth-input',
  'table-selector',
  'workflow-selector',
])

const providerContextFields = new Set([
  'oauthCredential',
  'domain',
  'teamId',
  'projectId',
  'knowledgeBaseId',
  'planId',
  'siteId',
  'collectionId',
  'spreadsheetId',
  'driveId',
  'fileId',
  'baseId',
  'datasetId',
  'serviceDeskId',
  'impersonateUserEmail',
  'boardId',
  'spaceId',
  'listSpaceId',
  'folderId',
  'awsAccessKeyId',
  'awsSecretAccessKey',
  'awsRegion',
  'logGroupName',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === 'string' && record[key].length > 0 ? record[key] : null
}

function optionsFromArray(value: unknown, labelKeys: string[]): ResourceOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): ResourceOption[] => {
    if (!isRecord(entry)) return []
    const id = stringValue(entry, 'id')
    if (!id) return []
    const label = labelKeys.map((key) => stringValue(entry, key)).find(Boolean) ?? id
    return [{ id, label }]
  })
}

function nestedRecord(value: unknown, ...keys: string[]): Record<string, unknown> | null {
  let current: unknown = value
  for (const key of keys) {
    if (!isRecord(current)) return null
    current = current[key]
  }
  return isRecord(current) ? current : null
}

function nestedArray(value: unknown, ...keys: string[]): unknown[] {
  let current: unknown = value
  for (const key of keys) {
    if (!isRecord(current)) return []
    current = current[key]
  }
  return Array.isArray(current) ? current : []
}

function subBlockValue(workflow: EditorWorkflow, blockId: string, fieldId: string): unknown {
  const field = workflow.state.blocks[blockId]?.subBlocks[fieldId]
  return isRecord(field) && 'value' in field ? field.value : undefined
}

function firstSiblingString(
  workflow: EditorWorkflow,
  blockId: string,
  fieldIds: string[]
): string | null {
  for (const fieldId of fieldIds) {
    const value = subBlockValue(workflow, blockId, fieldId)
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

function dependencyGroups(value: unknown): { all: string[]; any: string[] } {
  if (Array.isArray(value)) {
    return {
      all: value.filter((entry): entry is string => typeof entry === 'string'),
      any: [],
    }
  }
  if (!isRecord(value)) return { all: [], any: [] }
  const strings = (entry: unknown) =>
    Array.isArray(entry) ? entry.filter((item): item is string => typeof item === 'string') : []
  return { all: strings(value.all), any: strings(value.any) }
}

function selectorContext(
  field: EditorBlockTemplateFieldV1,
  workflow: EditorWorkflow,
  blockId: string,
  templateFields: EditorBlockTemplateFieldV1[]
): SelectorContext | null {
  const workspaceId = workflow.workspaceId
  if (!workspaceId) return null
  const dependencies = dependencyGroups(field.dependsOn)
  const dependencyIds = [...dependencies.all, ...dependencies.any]
  const values = new Map(
    dependencyIds.map((id) => [id, subBlockValue(workflow, blockId, id)] as const)
  )
  const present = (id: string) => {
    const value = values.get(id)
    return value !== null && value !== undefined && String(value).length > 0
  }
  if (!dependencies.all.every(present)) return null
  if (dependencies.any.length > 0 && !dependencies.any.some(present)) return null

  const context: SelectorContext = {
    workspaceId,
    workflowId: workflow.id,
  }
  if (field.serviceId) context.serviceId = field.serviceId
  if (field.mimeType) context.mimeType = field.mimeType

  const byId = new Map(templateFields.map((templateField) => [templateField.id, templateField]))
  for (const dependencyId of dependencyIds) {
    const value = values.get(dependencyId)
    if (value === null || value === undefined || String(value).length === 0) continue
    const dependency = byId.get(dependencyId)
    let contextKey = dependency?.canonicalParamId ?? dependencyId
    if (
      contextKey !== 'oauthCredential' &&
      (dependency?.type === 'oauth-input' || dependencyId === 'botToken')
    ) {
      contextKey = 'oauthCredential'
    }
    if (providerContextFields.has(contextKey) && context[contextKey] === undefined) {
      context[contextKey] = String(value)
    }
  }

  const impersonateUserEmail = subBlockValue(workflow, blockId, 'impersonateUserEmail')
  if (typeof impersonateUserEmail === 'string' && impersonateUserEmail.length > 0) {
    context.impersonateUserEmail = impersonateUserEmail
  }
  return context
}

export function isCoreResourceField(field: EditorBlockTemplateFieldV1): boolean {
  return coreResourceTypes.has(field.type)
}

export function resourceRequest(
  field: EditorBlockTemplateFieldV1,
  workflow: EditorWorkflow,
  blockId: string,
  templateFields: EditorBlockTemplateFieldV1[] = [],
  search?: string
): ResourceRequest | null {
  const workspaceId = workflow.workspaceId
  if (!workspaceId) return null
  const workspace = encodeURIComponent(workspaceId)
  if (field.type === 'oauth-input') {
    const providerId = field.serviceId === 'gmail' ? 'google-email' : field.serviceId
    const provider = providerId ? `&providerId=${encodeURIComponent(providerId)}` : ''
    return {
      path: `/api/credentials?workspaceId=${workspace}${provider}`,
      select: (payload) => {
        const credentials =
          isRecord(payload) && Array.isArray(payload.credentials) ? payload.credentials : []
        return credentials.flatMap((entry): ResourceOption[] => {
          if (!isRecord(entry)) return []
          const id = stringValue(entry, 'id')
          if (!id) return []
          const type = stringValue(entry, 'type')
          if (field.credentialKind === 'service-account' && type !== 'service_account') return []
          if (field.credentialKind === 'oauth' && type === 'service_account') return []
          const label = stringValue(entry, 'displayName') ?? stringValue(entry, 'name') ?? id
          return [{ id, label }]
        })
      },
    }
  }
  if (field.type === 'workflow-selector') {
    return {
      path: `/api/workflows?workspaceId=${workspace}&scope=active`,
      select: (payload) =>
        optionsFromArray(isRecord(payload) ? payload.data : null, ['name']).filter(
          (option) => option.id !== workflow.id
        ),
    }
  }
  if (field.type === 'knowledge-base-selector') {
    return {
      path: `/api/knowledge?workspaceId=${workspace}&scope=active`,
      select: (payload) => optionsFromArray(isRecord(payload) ? payload.data : null, ['name']),
    }
  }
  if (field.type === 'table-selector') {
    return {
      path: `/api/table?workspaceId=${workspace}&scope=active`,
      select: (payload) =>
        optionsFromArray(nestedArray(payload, 'data', 'tables'), ['name', 'title']),
    }
  }
  if (field.type === 'mcp-server-selector') {
    return {
      path: `/api/mcp/servers?workspaceId=${workspace}`,
      select: (payload) => optionsFromArray(nestedArray(payload, 'data', 'servers'), ['name']),
    }
  }
  if (field.type === 'mcp-tool-selector') {
    const serverId = firstSiblingString(workflow, blockId, ['server', 'serverId'])
    if (!serverId) return null
    return {
      path: `/api/mcp/tools/discover?workspaceId=${workspace}&serverId=${encodeURIComponent(serverId)}`,
      select: (payload) =>
        nestedArray(payload, 'data', 'tools').flatMap((entry): ResourceOption[] => {
          if (!isRecord(entry) || typeof entry.name !== 'string') return []
          return [
            {
              id: `mcp-${serverId}-${entry.name}`,
              label: entry.description ? `${entry.name} — ${entry.description}` : entry.name,
            },
          ]
        }),
    }
  }
  if (field.type === 'column-selector' && field.selectorKey === 'table.columns') {
    const dependencies = Array.isArray(field.dependsOn)
      ? field.dependsOn.filter((entry): entry is string => typeof entry === 'string')
      : []
    const tableId = firstSiblingString(workflow, blockId, [
      ...dependencies,
      'tableSelector',
      'tableId',
      'manualTableId',
    ])
    if (!tableId) return null
    return {
      path: `/api/table/${encodeURIComponent(tableId)}?workspaceId=${workspace}`,
      select: (payload) => {
        const table = nestedRecord(payload, 'data', 'table')
        const schema = table ? nestedRecord(table, 'schema') : null
        const columns = schema && Array.isArray(schema.columns) ? schema.columns : []
        return columns.flatMap((entry): ResourceOption[] => {
          if (!isRecord(entry)) return []
          const id = stringValue(entry, 'id') ?? stringValue(entry, 'name')
          if (!id) return []
          return [{ id, label: stringValue(entry, 'name') ?? id }]
        })
      },
    }
  }
  if (field.selectorKey) {
    const context = selectorContext(field, workflow, blockId, templateFields)
    if (!context) return null
    return {
      path: '/api/selectors/query',
      init: {
        method: 'POST',
        body: JSON.stringify({
          selectorKey: field.selectorKey,
          context,
          ...(search ? { search } : {}),
        }),
      },
      select: (payload) => optionsFromArray(isRecord(payload) ? payload.items : null, ['label']),
    }
  }
  return null
}

export function EditorResourceField({
  blockId,
  disabled,
  field,
  templateFields,
  onError,
  onValue,
  value,
  workflow,
}: EditorResourceFieldProps) {
  const listId = useId()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const providerSearchEnabled = Boolean(
    field.selectorKey && !isCoreResourceField(field) && field.selectorAllowSearch !== false
  )

  useEffect(() => {
    setSearch('')
    setDebouncedSearch('')
  }, [field.id])

  useEffect(() => {
    if (!providerSearchEnabled) return
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [providerSearchEnabled, search])

  const request = useMemo(
    () =>
      resourceRequest(
        field,
        workflow,
        blockId,
        templateFields,
        providerSearchEnabled ? debouncedSearch : undefined
      ),
    [blockId, debouncedSearch, field, providerSearchEnabled, templateFields, workflow]
  )
  const [options, setOptions] = useState<ResourceOption[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!request) {
      setOptions([])
      setLoading(false)
      setLoadError(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    void requestJson<unknown>(request.path, { ...request.init, signal: controller.signal })
      .then((payload) => setOptions(request.select(payload)))
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setLoadError(caught instanceof Error ? caught.message : 'Unable to load resources')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [request])

  const currentValue = typeof value === 'string' ? value : ''
  return (
    <div className='editor-resource-field'>
      {providerSearchEnabled ? (
        <input
          aria-label={`Search ${field.title}`}
          disabled={disabled}
          onChange={(event) => setSearch(event.target.value)}
          placeholder='Search available resources'
          type='search'
          value={search}
        />
      ) : null}
      <input
        disabled={disabled}
        list={options.length > 0 ? listId : undefined}
        onChange={(event) => {
          onValue(event.target.value)
          onError(null)
        }}
        placeholder={field.placeholder ?? 'Select or enter a resource ID'}
        value={currentValue}
      />
      {options.length > 0 ? (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </datalist>
      ) : null}
      {loading ? <small>Loading resources…</small> : null}
      {!loading && !request ? <small>Select the required parent resource first.</small> : null}
      {loadError ? <small>{loadError}; manual ID entry remains available.</small> : null}
    </div>
  )
}
