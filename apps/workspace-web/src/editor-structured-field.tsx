import { useState } from 'react'
import type { EditorTemplateJsonValue } from '@sim/tool-catalog'
import { generateId } from '@sim/utils/id'

type ControlKind = 'number' | 'select' | 'text' | 'textarea'

interface ColumnRecipe {
  key: string
  kind?: ControlKind
  label: string
  options?: Array<{ label: string; value: string }>
}

interface StructuredRecipe {
  columns: ColumnRecipe[]
  create: () => Record<string, EditorTemplateJsonValue>
  itemLabel: string
  serialized?: boolean
}

interface EditorStructuredFieldProps {
  disabled: boolean
  fieldType: string
  onError: (message: string | null) => void
  onValue: (value: EditorTemplateJsonValue) => void
  value: unknown
}

const fieldTypes = [
  { label: 'String', value: 'string' },
  { label: 'Number', value: 'number' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Object', value: 'object' },
  { label: 'Array', value: 'array' },
  { label: 'File', value: 'file' },
]

const variableTypes = [
  { label: 'String', value: 'string' },
  { label: 'Plain text', value: 'plain' },
  { label: 'Number', value: 'number' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Object', value: 'object' },
  { label: 'Array', value: 'array' },
  { label: 'JSON', value: 'json' },
]

const comparisonOperators = [
  'eq',
  'ne',
  'contains',
  'ncontains',
  'startsWith',
  'endsWith',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'nin',
  'isEmpty',
  'isNotEmpty',
].map((value) => ({ label: value, value }))

function item(fields: Record<string, EditorTemplateJsonValue>) {
  return { id: generateId(), ...fields }
}

const recipes: Record<string, StructuredRecipe> = {
  'input-format': {
    itemLabel: 'input',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'type', label: 'Type', kind: 'select', options: fieldTypes },
      { key: 'value', label: 'Default value' },
    ],
    create: () => item({ name: '', type: 'string', value: '', collapsed: false }),
  },
  'response-format': {
    itemLabel: 'response field',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'type', label: 'Type', kind: 'select', options: variableTypes },
      { key: 'value', label: 'Value' },
    ],
    create: () => item({ name: '', type: 'string', value: '', collapsed: false }),
  },
  'messages-input': {
    itemLabel: 'message',
    columns: [
      {
        key: 'role',
        label: 'Role',
        kind: 'select',
        options: ['system', 'user', 'assistant'].map((value) => ({ label: value, value })),
      },
      { key: 'content', label: 'Content', kind: 'textarea' },
    ],
    create: () => ({ role: 'user', content: '' }),
  },
  'variables-input': {
    itemLabel: 'assignment',
    columns: [
      { key: 'variableName', label: 'Variable name' },
      { key: 'type', label: 'Type', kind: 'select', options: fieldTypes },
      { key: 'value', label: 'Value', kind: 'textarea' },
    ],
    create: () => item({ variableName: '', type: 'string', value: '', isExisting: false }),
  },
  'filter-builder': {
    itemLabel: 'filter',
    columns: [
      {
        key: 'logicalOperator',
        label: 'Logic',
        kind: 'select',
        options: ['and', 'or'].map((value) => ({ label: value, value })),
      },
      { key: 'column', label: 'Column ID' },
      { key: 'operator', label: 'Operator', kind: 'select', options: comparisonOperators },
      { key: 'value', label: 'Value' },
    ],
    create: () => item({ logicalOperator: 'and', column: '', operator: 'eq', value: '' }),
  },
  'sort-builder': {
    itemLabel: 'sort',
    columns: [
      { key: 'column', label: 'Column ID' },
      {
        key: 'direction',
        label: 'Direction',
        kind: 'select',
        options: [
          { label: 'ascending', value: 'asc' },
          { label: 'descending', value: 'desc' },
        ],
      },
    ],
    create: () => item({ column: '', direction: 'asc', collapsed: false }),
  },
  'condition-input': {
    itemLabel: 'branch',
    serialized: true,
    columns: [
      { key: 'title', label: 'Branch' },
      { key: 'value', label: 'Condition', kind: 'textarea' },
    ],
    create: () =>
      item({
        title: 'else if',
        value: '',
        showTags: false,
        showEnvVars: false,
        searchTerm: '',
        cursorPosition: 0,
        activeSourceBlockId: null,
      }),
  },
  'router-input': {
    itemLabel: 'route',
    serialized: true,
    columns: [
      { key: 'title', label: 'Route name' },
      { key: 'value', label: 'Condition', kind: 'textarea' },
    ],
    create: () =>
      item({
        title: 'route',
        value: '',
        showTags: false,
        showEnvVars: false,
        searchTerm: '',
        cursorPosition: 0,
        activeSourceBlockId: null,
      }),
  },
  'knowledge-tag-filters': {
    itemLabel: 'tag filter',
    serialized: true,
    columns: [
      { key: 'tagName', label: 'Tag name' },
      { key: 'fieldType', label: 'Field type' },
      { key: 'operator', label: 'Operator' },
      { key: 'tagValue', label: 'Value' },
    ],
    create: () => item({ tagName: '', fieldType: 'text', operator: 'eq', tagValue: '' }),
  },
  'document-tag-entry': {
    itemLabel: 'document tag',
    serialized: true,
    columns: [
      { key: 'tagName', label: 'Tag name' },
      { key: 'fieldType', label: 'Field type' },
      { key: 'value', label: 'Value' },
    ],
    create: () => item({ tagName: '', fieldType: 'text', value: '' }),
  },
  'eval-input': {
    itemLabel: 'metric',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description', kind: 'textarea' },
      { key: 'range.min', label: 'Minimum', kind: 'number' },
      { key: 'range.max', label: 'Maximum', kind: 'number' },
    ],
    create: () => item({ name: '', description: '', range: { min: 0, max: 1 } }),
  },
}

export function parseStructuredRows(
  value: unknown
): Array<Record<string, EditorTemplateJsonValue>> {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (entry): entry is Record<string, EditorTemplateJsonValue> =>
      Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
  )
}

export function serializeStructuredRows(
  fieldType: string,
  rows: Array<Record<string, EditorTemplateJsonValue>>
): EditorTemplateJsonValue {
  const normalized = normalizeStructuredRows(fieldType, rows)
  return recipes[fieldType]?.serialized ? JSON.stringify(normalized) : normalized
}

export function initialStructuredRows(
  fieldType: string
): Array<Record<string, EditorTemplateJsonValue>> {
  const recipe = recipes[fieldType]
  if (!recipe) return []
  if (fieldType === 'condition-input') {
    return [
      { ...recipe.create(), title: 'if' },
      { ...recipe.create(), title: 'else' },
    ]
  }
  return [recipe.create()]
}

export function normalizeStructuredRows(
  fieldType: string,
  rows: Array<Record<string, EditorTemplateJsonValue>>
): Array<Record<string, EditorTemplateJsonValue>> {
  if (fieldType === 'router-input' && rows.length === 0) {
    return initialStructuredRows(fieldType)
  }
  if (fieldType !== 'condition-input') return rows
  const completeRows =
    rows.length === 0
      ? initialStructuredRows(fieldType)
      : rows.length === 1
        ? [...rows, { ...recipes[fieldType].create(), title: 'else' }]
        : rows
  return completeRows.map((row, index) => ({
    ...row,
    title: index === 0 ? 'if' : index === completeRows.length - 1 ? 'else' : 'else if',
  }))
}

function nestedValue(row: Record<string, EditorTemplateJsonValue>, key: string): unknown {
  const [first, second] = key.split('.')
  if (!second) return row[first]
  const parent = row[first]
  return parent && typeof parent === 'object' && !Array.isArray(parent) ? parent[second] : undefined
}

function updateNestedValue(
  row: Record<string, EditorTemplateJsonValue>,
  key: string,
  value: EditorTemplateJsonValue
) {
  const [first, second] = key.split('.')
  if (!second) return { ...row, [first]: value }
  const parent = row[first]
  return {
    ...row,
    [first]: {
      ...(parent && typeof parent === 'object' && !Array.isArray(parent) ? parent : {}),
      [second]: value,
    },
  }
}

export function EditorStructuredField({
  disabled,
  fieldType,
  onError,
  onValue,
  value,
}: EditorStructuredFieldProps) {
  const recipe = recipes[fieldType]
  const [rawMode, setRawMode] = useState(false)
  const [rawDraft, setRawDraft] = useState(() =>
    typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2)
  )
  if (!recipe) return null
  const rows = parseStructuredRows(value)
  const commit = (next: Array<Record<string, EditorTemplateJsonValue>>) => {
    const normalized = normalizeStructuredRows(fieldType, next)
    onValue(serializeStructuredRows(fieldType, normalized))
    onError(null)
  }
  const minimumRows = fieldType === 'condition-input' ? 2 : fieldType === 'router-input' ? 1 : 0

  if (rawMode) {
    return (
      <div className='editor-structured-field'>
        <textarea
          disabled={disabled}
          onBlur={() => {
            try {
              const next = JSON.parse(rawDraft) as unknown
              if (!Array.isArray(next)) throw new Error('Expected an array')
              commit(parseStructuredRows(next))
            } catch {
              onError('Structured value must be a valid JSON array')
            }
          }}
          onChange={(event) => setRawDraft(event.target.value)}
          rows={8}
          value={rawDraft}
        />
        <button onClick={() => setRawMode(false)} type='button'>
          Visual mode
        </button>
      </div>
    )
  }

  return (
    <div className='editor-structured-field'>
      {rows.map((row, index) => (
        <article key={typeof row.id === 'string' ? row.id : index}>
          <header>
            <strong>
              {recipe.itemLabel} {index + 1}
            </strong>
            <div>
              <button
                disabled={disabled || index === 0 || fieldType === 'condition-input'}
                onClick={() => {
                  const next = [...rows]
                  ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                  commit(next)
                }}
                type='button'
              >
                ↑
              </button>
              <button
                disabled={disabled || index === rows.length - 1 || fieldType === 'condition-input'}
                onClick={() => {
                  const next = [...rows]
                  ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
                  commit(next)
                }}
                type='button'
              >
                ↓
              </button>
              <button
                disabled={disabled || rows.length <= minimumRows}
                onClick={() => commit(rows.filter((_, itemIndex) => itemIndex !== index))}
                type='button'
              >
                Remove
              </button>
            </div>
          </header>
          {recipe.columns.map((column) => {
            const current = nestedValue(row, column.key)
            const controlId = `structured-${fieldType}-${index}-${column.key.replaceAll('.', '-')}`
            const update = (next: EditorTemplateJsonValue) =>
              commit(
                rows.map((itemRow, itemIndex) =>
                  itemIndex === index ? updateNestedValue(itemRow, column.key, next) : itemRow
                )
              )
            return (
              <label htmlFor={controlId} key={column.key}>
                {column.label}
                {column.kind === 'select' ? (
                  <select
                    disabled={disabled}
                    id={controlId}
                    onChange={(event) => update(event.target.value)}
                    value={String(current ?? '')}
                  >
                    {column.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : column.kind === 'textarea' ? (
                  <textarea
                    disabled={disabled}
                    id={controlId}
                    onChange={(event) => update(event.target.value)}
                    value={String(current ?? '')}
                  />
                ) : (
                  <input
                    disabled={disabled}
                    id={controlId}
                    onChange={(event) =>
                      update(
                        column.kind === 'number' ? event.target.valueAsNumber : event.target.value
                      )
                    }
                    type={column.kind === 'number' ? 'number' : 'text'}
                    value={
                      typeof current === 'number' || typeof current === 'string' ? current : ''
                    }
                  />
                )}
              </label>
            )
          })}
        </article>
      ))}
      <div className='editor-structured-actions'>
        <button
          disabled={disabled}
          onClick={() =>
            commit(
              rows.length === 0 ? initialStructuredRows(fieldType) : [...rows, recipe.create()]
            )
          }
          type='button'
        >
          Add {recipe.itemLabel}
        </button>
        <button
          onClick={() => {
            setRawDraft(JSON.stringify(rows, null, 2))
            setRawMode(true)
          }}
          type='button'
        >
          Raw JSON
        </button>
      </div>
    </div>
  )
}
