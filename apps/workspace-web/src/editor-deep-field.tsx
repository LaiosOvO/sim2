import { useEffect, useMemo, useState } from 'react'
import type { EditorBlockTemplateFieldV1, EditorTemplateJsonValue } from '@sim/tool-catalog'
import agentToolOptions from '@sim/tool-catalog/generated/agent-tool-options'
import { generateId } from '@sim/utils/id'
import { requestJson } from './api'
import type { EditorWorkflow } from './editor-api'

interface EditorDeepFieldProps {
  blockId: string
  disabled: boolean
  field: EditorBlockTemplateFieldV1
  onError: (message: string | null) => void
  onValue: (value: EditorTemplateJsonValue) => void
  value: unknown
  workflow: EditorWorkflow
}

interface SkillOption {
  id: string
  name: string
}

interface InputField {
  name: string
  type: string
}

interface JsonSchemaProperty {
  default?: unknown
  description?: string
  enum?: unknown[]
  maximum?: number
  minimum?: number
  type?: string | string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isJsonValue(value: unknown): value is EditorTemplateJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true
  }
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

function jsonRecord(value: unknown): Record<string, EditorTemplateJsonValue> {
  if (!isRecord(value)) return {}
  const result: Record<string, EditorTemplateJsonValue> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (isJsonValue(entry)) result[key] = entry
  }
  return result
}

function subBlockValue(workflow: EditorWorkflow, blockId: string, fieldId: string): unknown {
  const field = workflow.state.blocks[blockId]?.subBlocks[fieldId]
  return isRecord(field) && 'value' in field ? field.value : undefined
}

function siblingString(
  workflow: EditorWorkflow,
  blockId: string,
  field: EditorBlockTemplateFieldV1,
  fallbacks: string[]
): string | null {
  const dependencies = Array.isArray(field.dependsOn)
    ? field.dependsOn.filter((entry): entry is string => typeof entry === 'string')
    : []
  for (const fieldId of [...dependencies, ...fallbacks]) {
    const value = subBlockValue(workflow, blockId, fieldId)
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

export function isDeepEditorField(field: EditorBlockTemplateFieldV1): boolean {
  return ['input-mapping', 'mcp-dynamic-args', 'skill-input', 'table', 'tool-input'].includes(
    field.type
  )
}

function RawJsonEditor({
  disabled,
  label,
  onError,
  onValue,
  value,
}: {
  disabled: boolean
  label: string
  onError: (message: string | null) => void
  onValue: (value: EditorTemplateJsonValue) => void
  value: unknown
}) {
  const serialized = JSON.stringify(value ?? null, null, 2)
  const [draft, setDraft] = useState(serialized)
  useEffect(() => setDraft(serialized), [serialized])
  return (
    <textarea
      aria-label={`${label} JSON`}
      disabled={disabled}
      onBlur={() => {
        try {
          const parsed = JSON.parse(draft) as unknown
          if (!isJsonValue(parsed)) throw new Error('Unsupported JSON value')
          onValue(parsed)
          onError(null)
        } catch {
          onError(`${label} must contain valid JSON`)
        }
      }}
      onChange={(event) => setDraft(event.target.value)}
      rows={7}
      value={draft}
    />
  )
}

function TableField(props: EditorDeepFieldProps) {
  const { disabled, field, onError, onValue, value } = props
  const rows = Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : []
  const columns = useMemo(() => {
    if (field.columns && field.columns.length > 0) return field.columns
    const names = new Set<string>()
    for (const row of rows) {
      if (!isRecord(row.cells)) continue
      for (const name of Object.keys(row.cells)) names.add(name)
    }
    return [...names]
  }, [field.columns, rows])
  const commit = (nextRows: Array<Record<string, unknown>>) => {
    if (!isJsonValue(nextRows)) {
      onError('Table rows contain an unsupported value')
      return
    }
    onValue(nextRows)
    onError(null)
  }
  if (columns.length === 0) {
    return (
      <RawJsonEditor
        disabled={disabled}
        label={field.title}
        onError={onError}
        onValue={onValue}
        value={value ?? []}
      />
    )
  }
  return (
    <div className='editor-deep-field editor-table-field'>
      <div className='editor-table-scroll'>
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const cells = isRecord(row.cells) ? row.cells : {}
              return (
                <tr key={typeof row.id === 'string' ? row.id : rowIndex}>
                  {columns.map((column) => (
                    <td key={column}>
                      <input
                        disabled={disabled}
                        onChange={(event) =>
                          commit(
                            rows.map((item, itemIndex) =>
                              itemIndex === rowIndex
                                ? {
                                    ...item,
                                    cells: {
                                      ...(isRecord(item.cells) ? item.cells : {}),
                                      [column]: event.target.value,
                                    },
                                  }
                                : item
                            )
                          )
                        }
                        value={typeof cells[column] === 'string' ? cells[column] : ''}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      disabled={disabled}
                      onClick={() => commit(rows.filter((_, index) => index !== rowIndex))}
                      type='button'
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <button
        disabled={disabled}
        onClick={() =>
          commit([
            ...rows,
            { id: generateId(), cells: Object.fromEntries(columns.map((column) => [column, ''])) },
          ])
        }
        type='button'
      >
        Add row
      </button>
    </div>
  )
}

function SkillField(props: EditorDeepFieldProps) {
  const { disabled, onError, onValue, value, workflow } = props
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!workflow.workspaceId) return
    const controller = new AbortController()
    setLoading(true)
    void requestJson<unknown>(
      `/api/skills?workspaceId=${encodeURIComponent(workflow.workspaceId)}`,
      { signal: controller.signal }
    )
      .then((payload) => {
        const entries = isRecord(payload) && Array.isArray(payload.data) ? payload.data : []
        setSkills(
          entries.flatMap((entry): SkillOption[] =>
            isRecord(entry) && typeof entry.id === 'string' && typeof entry.name === 'string'
              ? [{ id: entry.id, name: entry.name }]
              : []
          )
        )
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          onError(caught instanceof Error ? caught.message : 'Unable to load skills')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [onError, workflow.workspaceId])
  const selected = Array.isArray(value)
    ? value.flatMap(
        (entry): Array<{ name?: string; skillId: string }> =>
          isRecord(entry) && typeof entry.skillId === 'string'
            ? [
                {
                  skillId: entry.skillId,
                  ...(typeof entry.name === 'string' ? { name: entry.name } : {}),
                },
              ]
            : []
      )
    : []
  const selectedIds = new Set(selected.map((entry) => entry.skillId))
  return (
    <div className='editor-deep-field editor-skill-field'>
      {loading ? <small>Loading skills…</small> : null}
      {skills.map((skill) => (
        <label key={skill.id}>
          <input
            checked={selectedIds.has(skill.id)}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.checked
                ? [...selected, { skillId: skill.id, name: skill.name }]
                : selected.filter((entry) => entry.skillId !== skill.id)
              onValue(next)
              onError(null)
            }}
            type='checkbox'
          />
          {skill.name}
        </label>
      ))}
      {selected
        .filter((entry) => !skills.some((skill) => skill.id === entry.skillId))
        .map((entry) => (
          <small key={entry.skillId}>
            Unavailable skill retained: {entry.name ?? entry.skillId}
          </small>
        ))}
    </div>
  )
}

export function extractWorkflowInputFields(payload: unknown): InputField[] {
  if (!isRecord(payload) || !isRecord(payload.data) || !isRecord(payload.data.state)) return []
  const blocks = isRecord(payload.data.state.blocks) ? payload.data.state.blocks : {}
  const trigger = Object.values(blocks).find(
    (block) =>
      isRecord(block) &&
      typeof block.type === 'string' &&
      ['input_trigger', 'start_trigger', 'starter'].includes(block.type)
  )
  if (!isRecord(trigger)) return []
  const subBlocks = isRecord(trigger.subBlocks) ? trigger.subBlocks : {}
  const inputFormat = isRecord(subBlocks.inputFormat) ? subBlocks.inputFormat.value : undefined
  const legacyConfig = isRecord(trigger.config) ? trigger.config : null
  const legacyParams = legacyConfig && isRecord(legacyConfig.params) ? legacyConfig.params : null
  const source = Array.isArray(inputFormat)
    ? inputFormat
    : legacyParams && Array.isArray(legacyParams.inputFormat)
      ? legacyParams.inputFormat
      : []
  return source.flatMap((entry): InputField[] =>
    isRecord(entry) && typeof entry.name === 'string' && entry.name.trim()
      ? [{ name: entry.name, type: typeof entry.type === 'string' ? entry.type : 'string' }]
      : []
  )
}

function InputMappingField(props: EditorDeepFieldProps) {
  const { blockId, disabled, field, onError, onValue, value, workflow } = props
  const childWorkflowId = siblingString(workflow, blockId, field, ['workflowId', 'workflow'])
  const [fields, setFields] = useState<InputField[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!childWorkflowId) {
      setFields([])
      return
    }
    const controller = new AbortController()
    setLoading(true)
    void requestJson<unknown>(`/api/workflows/${encodeURIComponent(childWorkflowId)}`, {
      signal: controller.signal,
    })
      .then((payload) => setFields(extractWorkflowInputFields(payload)))
      .catch((caught) => {
        if (!controller.signal.aborted) {
          onError(caught instanceof Error ? caught.message : 'Unable to load workflow inputs')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [childWorkflowId, onError])
  const mapping = jsonRecord(value)
  if (!childWorkflowId) return <small>Select a workflow above to configure its inputs.</small>
  if (loading) return <small>Loading workflow inputs…</small>
  if (fields.length === 0) return <small>The selected workflow has no custom inputs.</small>
  return (
    <div className='editor-deep-field editor-input-mapping'>
      {fields.map((inputField) => (
        <label key={inputField.name}>
          <span>
            {inputField.name} <small>{inputField.type}</small>
          </span>
          <input
            disabled={disabled}
            onChange={(event) => {
              onValue({ ...mapping, [inputField.name]: event.target.value })
              onError(null)
            }}
            placeholder='Enter a value or workflow reference'
            value={
              typeof mapping[inputField.name] === 'string' ? String(mapping[inputField.name]) : ''
            }
          />
        </label>
      ))}
    </div>
  )
}

function schemaType(property: JsonSchemaProperty): string {
  return Array.isArray(property.type)
    ? (property.type.find((type) => type !== 'null') ?? 'string')
    : (property.type ?? 'string')
}

function McpArgsField(props: EditorDeepFieldProps) {
  const { blockId, disabled, field, onError, onValue, value, workflow } = props
  const workspaceId = workflow.workspaceId
  const serverId = siblingString(workflow, blockId, field, ['server', 'serverId'])
  const toolId = siblingString(workflow, blockId, field, ['tool'])
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    if (!workspaceId || !serverId || !toolId) {
      setSchema(null)
      return
    }
    const controller = new AbortController()
    void requestJson<unknown>(
      `/api/mcp/tools/discover?workspaceId=${encodeURIComponent(workspaceId)}&serverId=${encodeURIComponent(serverId)}`,
      { signal: controller.signal }
    )
      .then((payload) => {
        const tools =
          isRecord(payload) && isRecord(payload.data) && Array.isArray(payload.data.tools)
            ? payload.data.tools
            : []
        const prefix = `mcp-${serverId}-`
        const toolName = toolId.startsWith(prefix) ? toolId.slice(prefix.length) : toolId
        const selected = tools.find((tool) => isRecord(tool) && tool.name === toolName)
        setSchema(
          isRecord(selected) && isRecord(selected.inputSchema) ? selected.inputSchema : null
        )
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          onError(caught instanceof Error ? caught.message : 'Unable to load MCP schema')
        }
      })
    return () => controller.abort()
  }, [onError, serverId, toolId, workspaceId])
  const properties = schema && isRecord(schema.properties) ? schema.properties : {}
  const required = new Set(
    schema && Array.isArray(schema.required)
      ? schema.required.filter((entry): entry is string => typeof entry === 'string')
      : []
  )
  const args = jsonRecord(value)
  if (!serverId || !toolId) return <small>Select an MCP server and tool first.</small>
  if (!schema) return <small>Loading MCP argument schema…</small>
  if (Object.keys(properties).length === 0) return <small>This MCP tool has no arguments.</small>
  const update = (name: string, next: EditorTemplateJsonValue) => {
    onValue({ ...args, [name]: next })
    onError(null)
  }
  return (
    <div className='editor-deep-field editor-mcp-args'>
      {Object.entries(properties).map(([name, rawProperty]) => {
        const property = isRecord(rawProperty) ? (rawProperty as JsonSchemaProperty) : {}
        const type = schemaType(property)
        const current = args[name]
        return (
          <label htmlFor={`mcp-argument-${name}`} key={name}>
            <span>
              {name}
              {required.has(name) ? ' *' : ''} <small>{property.description ?? type}</small>
            </span>
            {Array.isArray(property.enum) && property.enum.every(isJsonValue) ? (
              <select
                disabled={disabled}
                id={`mcp-argument-${name}`}
                onChange={(event) => {
                  const option = property.enum?.find(
                    (entry) => String(entry) === event.target.value
                  )
                  if (isJsonValue(option)) update(name, option)
                }}
                value={String(current ?? '')}
              >
                <option value=''>Select a value</option>
                {property.enum.map((option) => (
                  <option key={JSON.stringify(option)} value={String(option)}>
                    {String(option)}
                  </option>
                ))}
              </select>
            ) : type === 'boolean' ? (
              <select
                disabled={disabled}
                id={`mcp-argument-${name}`}
                onChange={(event) => update(name, event.target.value === 'true')}
                value={typeof current === 'boolean' ? String(current) : ''}
              >
                <option value=''>Select</option>
                <option value='true'>true</option>
                <option value='false'>false</option>
              </select>
            ) : type === 'number' || type === 'integer' ? (
              <input
                disabled={disabled}
                id={`mcp-argument-${name}`}
                max={property.maximum}
                min={property.minimum}
                onChange={(event) =>
                  update(name, event.target.value === '' ? null : event.target.valueAsNumber)
                }
                step={type === 'integer' ? 1 : 'any'}
                type='number'
                value={typeof current === 'number' ? current : ''}
              />
            ) : type === 'array' || type === 'object' ? (
              <textarea
                defaultValue={JSON.stringify(
                  current ?? property.default ?? (type === 'array' ? [] : {}),
                  null,
                  2
                )}
                disabled={disabled}
                id={`mcp-argument-${name}`}
                key={JSON.stringify(current)}
                onBlur={(event) => {
                  try {
                    const parsed = JSON.parse(event.target.value) as unknown
                    if (!isJsonValue(parsed)) throw new Error('Unsupported JSON')
                    update(name, parsed)
                  } catch {
                    onError(`${name} must contain valid JSON`)
                  }
                }}
                rows={4}
              />
            ) : (
              <input
                disabled={disabled}
                id={`mcp-argument-${name}`}
                onChange={(event) => update(name, event.target.value)}
                value={typeof current === 'string' ? current : ''}
              />
            )}
          </label>
        )
      })}
    </div>
  )
}

function ToolField(props: EditorDeepFieldProps) {
  const { disabled, field, onError, onValue, value, workflow } = props
  const tools = Array.isArray(value) ? value.filter(isRecord) : []
  const [selectedCapability, setSelectedCapability] = useState('')
  const [selectedWorkspaceTool, setSelectedWorkspaceTool] = useState('')
  const [workspaceTools, setWorkspaceTools] = useState<
    Array<{
      id: string
      label: string
      value: Record<string, unknown>
    }>
  >([])
  const capabilityOptions = useMemo(
    () =>
      agentToolOptions.items.flatMap((item) =>
        item.capabilities.map((capability) => ({
          id: `${item.type}\u0000${capability}`,
          capability,
          title: item.title,
          type: item.type,
        }))
      ),
    []
  )
  useEffect(() => {
    if (!workflow.workspaceId) return
    const controller = new AbortController()
    const workspaceId = encodeURIComponent(workflow.workspaceId)
    void Promise.all([
      requestJson<unknown>(`/api/tools/custom?workspaceId=${workspaceId}`, {
        signal: controller.signal,
      }),
      requestJson<unknown>(`/api/mcp/tools/discover?workspaceId=${workspaceId}`, {
        signal: controller.signal,
      }),
    ])
      .then(([customPayload, mcpPayload]) => {
        const custom =
          isRecord(customPayload) && Array.isArray(customPayload.data) ? customPayload.data : []
        const mcp =
          isRecord(mcpPayload) && isRecord(mcpPayload.data) && Array.isArray(mcpPayload.data.tools)
            ? mcpPayload.data.tools
            : []
        setWorkspaceTools([
          ...custom.flatMap(
            (entry): Array<{ id: string; label: string; value: Record<string, unknown> }> =>
              isRecord(entry) && typeof entry.id === 'string' && typeof entry.title === 'string'
                ? [
                    {
                      id: `custom\u0000${entry.id}`,
                      label: `Custom · ${entry.title}`,
                      value: {
                        type: 'custom-tool',
                        title: entry.title,
                        customToolId: entry.id,
                        usageControl: 'auto',
                      },
                    },
                  ]
                : []
          ),
          ...mcp.flatMap(
            (entry): Array<{ id: string; label: string; value: Record<string, unknown> }> => {
              if (
                !isRecord(entry) ||
                typeof entry.name !== 'string' ||
                typeof entry.serverId !== 'string'
              )
                return []
              return [
                {
                  id: `mcp\u0000${entry.serverId}\u0000${entry.name}`,
                  label: `MCP · ${typeof entry.serverName === 'string' ? entry.serverName : entry.serverId} · ${entry.name}`,
                  value: {
                    type: 'mcp',
                    title: entry.name,
                    toolId: `mcp-${entry.serverId}-${entry.name}`,
                    usageControl: 'auto',
                    params: {},
                    ...(isRecord(entry.inputSchema) ? { schema: entry.inputSchema } : {}),
                  },
                },
              ]
            }
          ),
        ])
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          onError(caught instanceof Error ? caught.message : 'Unable to load workspace tools')
        }
      })
    return () => controller.abort()
  }, [onError, workflow.workspaceId])
  const commit = (next: Array<Record<string, unknown>>) => {
    if (!isJsonValue(next)) {
      onError('Tool configuration contains an unsupported value')
      return
    }
    onValue(next)
    onError(null)
  }
  const update = (index: number, patch: Record<string, unknown>) =>
    commit(tools.map((tool, itemIndex) => (itemIndex === index ? { ...tool, ...patch } : tool)))
  return (
    <div className='editor-deep-field editor-tool-field'>
      {tools.map((tool, index) => (
        <article key={`${String(tool.toolId ?? tool.customToolId ?? index)}-${index}`}>
          <header>
            <strong>{typeof tool.title === 'string' ? tool.title : `Tool ${index + 1}`}</strong>
            <button
              disabled={disabled}
              onClick={() => commit(tools.filter((_, itemIndex) => itemIndex !== index))}
              type='button'
            >
              Remove
            </button>
          </header>
          {[
            ['type', 'Type'],
            ['title', 'Title'],
            ['toolId', 'Tool ID'],
            ['customToolId', 'Custom tool ID'],
            ['operation', 'Operation'],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                disabled={disabled}
                onChange={(event) => update(index, { [key]: event.target.value })}
                value={typeof tool[key] === 'string' ? tool[key] : ''}
              />
            </label>
          ))}
          <label>
            Usage control
            <select
              disabled={disabled}
              onChange={(event) => update(index, { usageControl: event.target.value })}
              value={typeof tool.usageControl === 'string' ? tool.usageControl : 'auto'}
            >
              <option value='auto'>Auto</option>
              <option value='force'>Force</option>
              <option value='none'>None</option>
            </select>
          </label>
          <label>
            Parameters JSON
            <textarea
              defaultValue={JSON.stringify(isRecord(tool.params) ? tool.params : {}, null, 2)}
              disabled={disabled}
              key={JSON.stringify(tool.params)}
              onBlur={(event) => {
                try {
                  const params = JSON.parse(event.target.value) as unknown
                  if (!isRecord(params) || !isJsonValue(params))
                    throw new Error('Expected an object')
                  update(index, { params })
                } catch {
                  onError('Tool parameters must contain a valid JSON object')
                }
              }}
              rows={4}
            />
          </label>
        </article>
      ))}
      <div className='editor-structured-actions'>
        <select
          aria-label='Add catalog tool'
          disabled={disabled}
          onChange={(event) => setSelectedCapability(event.target.value)}
          value={selectedCapability}
        >
          <option value=''>Select a catalog capability</option>
          {capabilityOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title} · {option.capability}
            </option>
          ))}
        </select>
        <button
          disabled={disabled || !selectedCapability}
          onClick={() => {
            const selected = capabilityOptions.find((option) => option.id === selectedCapability)
            if (!selected) return
            commit([
              ...tools,
              {
                type: selected.type,
                title: selected.title,
                toolId: selected.capability,
                usageControl: 'auto',
                params: {},
              },
            ])
            setSelectedCapability('')
          }}
          type='button'
        >
          Add catalog tool
        </button>
        {workspaceTools.length > 0 ? (
          <>
            <select
              aria-label='Add workspace tool'
              disabled={disabled}
              onChange={(event) => setSelectedWorkspaceTool(event.target.value)}
              value={selectedWorkspaceTool}
            >
              <option value=''>Select a custom or MCP tool</option>
              {workspaceTools.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              disabled={disabled || !selectedWorkspaceTool}
              onClick={() => {
                const selected = workspaceTools.find(
                  (option) => option.id === selectedWorkspaceTool
                )
                if (!selected) return
                commit([...tools, selected.value])
                setSelectedWorkspaceTool('')
              }}
              type='button'
            >
              Add workspace tool
            </button>
          </>
        ) : null}
        <button
          disabled={disabled}
          onClick={() =>
            commit([
              ...tools,
              { type: '', title: '', toolId: '', usageControl: 'auto', params: {} },
            ])
          }
          type='button'
        >
          Add manual tool
        </button>
        <details>
          <summary>Raw JSON</summary>
          <RawJsonEditor
            disabled={disabled}
            label={field.title}
            onError={onError}
            onValue={onValue}
            value={value ?? []}
          />
        </details>
      </div>
    </div>
  )
}

export function EditorDeepField(props: EditorDeepFieldProps) {
  if (props.field.type === 'table') return <TableField {...props} />
  if (props.field.type === 'skill-input') return <SkillField {...props} />
  if (props.field.type === 'input-mapping') return <InputMappingField {...props} />
  if (props.field.type === 'mcp-dynamic-args') return <McpArgsField {...props} />
  if (props.field.type === 'tool-input') return <ToolField {...props} />
  return null
}
