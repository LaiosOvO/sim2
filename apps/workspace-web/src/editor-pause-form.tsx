import { useEffect, useMemo, useState } from 'react'

export interface PauseInputField {
  description?: string
  label: string
  name: string
  options?: Array<{ label: string; value: string }>
  placeholder?: string
  required: boolean
  rows?: number
  type: string
  value?: unknown
}

interface EditorPauseFormProps {
  contextId: string
  disabled: boolean
  executionId: string
  onError: (message: string | null) => void
  onResumed: (status: string) => void
  workflowId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pauseResponseData(payload: unknown): unknown {
  if (
    !isRecord(payload) ||
    !isRecord(payload.pausePoint) ||
    !isRecord(payload.pausePoint.response)
  ) {
    return null
  }
  return payload.pausePoint.response.data
}

function normalizeOptions(value: unknown): Array<{ label: string; value: string }> | undefined {
  if (!Array.isArray(value)) return undefined
  const options = value.flatMap((entry): Array<{ label: string; value: string }> => {
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      return [{ label: String(entry), value: String(entry) }]
    }
    if (!isRecord(entry)) return []
    const rawValue = entry.value ?? entry.id
    if (
      typeof rawValue !== 'string' &&
      typeof rawValue !== 'number' &&
      typeof rawValue !== 'boolean'
    ) {
      return []
    }
    return [
      {
        value: String(rawValue),
        label: typeof entry.label === 'string' ? entry.label : String(rawValue),
      },
    ]
  })
  return options.length > 0 ? options : undefined
}

export function normalizePauseInputFields(value: unknown): PauseInputField[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): PauseInputField[] => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || !entry.name.trim()) return []
    return [
      {
        name: entry.name.trim(),
        label:
          typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : entry.name,
        type: typeof entry.type === 'string' && entry.type ? entry.type : 'string',
        required: entry.required === true,
        ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
        ...(typeof entry.placeholder === 'string' ? { placeholder: entry.placeholder } : {}),
        ...(typeof entry.rows === 'number' ? { rows: entry.rows } : {}),
        ...(entry.value !== undefined ? { value: entry.value } : {}),
        ...(normalizeOptions(entry.options) ? { options: normalizeOptions(entry.options) } : {}),
      },
    ]
  })
}

function formatInputValue(field: PauseInputField, value: unknown): string {
  if (value === undefined || value === null) return ''
  if (field.type === 'boolean') return value === true ? 'true' : value === false ? 'false' : ''
  if (['array', 'object', 'files'].includes(field.type)) {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  }
  return typeof value === 'string' ? value : String(value)
}

export function preparePauseSubmission(
  fields: PauseInputField[],
  values: Record<string, string>
): { errors: Record<string, string>; submission: Record<string, unknown> } {
  const errors: Record<string, string> = {}
  const submission: Record<string, unknown> = {}
  for (const field of fields) {
    const rawValue = values[field.name] ?? ''
    const hasValue =
      field.type === 'boolean'
        ? rawValue === 'true' || rawValue === 'false'
        : rawValue.trim().length > 0
    if (!hasValue) {
      if (field.required) errors[field.name] = 'This field is required.'
      continue
    }
    if (field.type === 'boolean') {
      submission[field.name] = rawValue === 'true'
      continue
    }
    if (field.type === 'number') {
      const parsed = Number(rawValue)
      if (!Number.isFinite(parsed)) errors[field.name] = 'Enter a valid number.'
      else submission[field.name] = parsed
      continue
    }
    if (['array', 'object', 'files'].includes(field.type)) {
      try {
        const parsed = JSON.parse(rawValue) as unknown
        if (field.type === 'array' && !Array.isArray(parsed)) {
          errors[field.name] = 'Enter a JSON array.'
        } else if (field.type !== 'array' && !isRecord(parsed)) {
          errors[field.name] = 'Enter a JSON object.'
        } else {
          submission[field.name] = parsed
        }
      } catch {
        errors[field.name] = 'Enter valid JSON.'
      }
      continue
    }
    submission[field.name] = rawValue
  }
  return { errors, submission }
}

export function EditorPauseForm({
  contextId,
  disabled,
  executionId,
  onError,
  onResumed,
  workflowId,
}: EditorPauseFormProps) {
  const [responseData, setResponseData] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [rawInput, setRawInput] = useState('{}')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void fetch(
      `/api/resume/${encodeURIComponent(workflowId)}/${encodeURIComponent(executionId)}/${encodeURIComponent(contextId)}`,
      { credentials: 'include', signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load pause details: ${response.status}`)
        return response.json() as Promise<unknown>
      })
      .then((payload) => {
        const data = pauseResponseData(payload)
        setResponseData(data)
        const record = isRecord(data) ? data : null
        const fields = normalizePauseInputFields(record?.inputFormat)
        const priorSubmission = isRecord(record?.submission) ? record.submission : {}
        setValues(
          Object.fromEntries(
            fields.map((field) => [
              field.name,
              formatInputValue(
                field,
                Object.hasOwn(priorSubmission, field.name)
                  ? priorSubmission[field.name]
                  : field.value
              ),
            ])
          )
        )
        setRawInput(typeof data === 'string' ? data : JSON.stringify(data ?? {}, null, 2))
        setFieldErrors({})
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          onError(caught instanceof Error ? caught.message : 'Unable to load pause details')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [contextId, executionId, onError, workflowId])

  const responseRecord = useMemo(
    () => (isRecord(responseData) ? responseData : null),
    [responseData]
  )
  const fields = useMemo(
    () => normalizePauseInputFields(responseRecord?.inputFormat),
    [responseRecord]
  )
  const structured = (responseRecord?.operation ?? 'human') === 'human' && fields.length > 0

  const submit = async () => {
    let input: unknown
    if (structured) {
      const prepared = preparePauseSubmission(fields, values)
      setFieldErrors(prepared.errors)
      if (Object.keys(prepared.errors).length > 0) {
        onError('Fix the highlighted fields before resuming.')
        return
      }
      input = { submission: prepared.submission }
    } else {
      try {
        input = rawInput.trim() ? (JSON.parse(rawInput) as unknown) : undefined
      } catch {
        onError('Resume input must contain valid JSON.')
        return
      }
    }
    setSubmitting(true)
    onError(null)
    try {
      const response = await fetch(
        `/api/resume/${encodeURIComponent(workflowId)}/${encodeURIComponent(executionId)}/${encodeURIComponent(contextId)}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input === undefined ? {} : { input }),
        }
      )
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : `Unable to resume execution: ${response.status}`
        )
      }
      onResumed(typeof payload?.status === 'string' ? payload.status : 'resuming')
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Unable to resume execution')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <small>Loading structured pause details…</small>
  return (
    <div className='editor-pause-form'>
      {structured ? (
        fields.map((field) => (
          <label htmlFor={`pause-${contextId}-${field.name}`} key={field.name}>
            <span>
              {field.label}
              {field.required ? ' *' : ''}
              {field.description ? <small>{field.description}</small> : null}
            </span>
            {field.options ? (
              <select
                disabled={disabled || submitting}
                id={`pause-${contextId}-${field.name}`}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.name]: event.target.value }))
                }
                value={values[field.name] ?? ''}
              >
                <option value=''>Select</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'boolean' ? (
              <select
                disabled={disabled || submitting}
                id={`pause-${contextId}-${field.name}`}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.name]: event.target.value }))
                }
                value={values[field.name] ?? ''}
              >
                <option value=''>Select</option>
                <option value='true'>true</option>
                <option value='false'>false</option>
              </select>
            ) : ['array', 'object', 'files'].includes(field.type) || (field.rows ?? 0) > 1 ? (
              <textarea
                disabled={disabled || submitting}
                id={`pause-${contextId}-${field.name}`}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.name]: event.target.value }))
                }
                placeholder={field.placeholder}
                rows={field.rows ?? 4}
                value={values[field.name] ?? ''}
              />
            ) : (
              <input
                disabled={disabled || submitting}
                id={`pause-${contextId}-${field.name}`}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.name]: event.target.value }))
                }
                placeholder={field.placeholder}
                type={field.type === 'number' ? 'number' : 'text'}
                value={values[field.name] ?? ''}
              />
            )}
            {fieldErrors[field.name] ? <small>{fieldErrors[field.name]}</small> : null}
          </label>
        ))
      ) : (
        <label>
          Resume input JSON
          <textarea
            disabled={disabled || submitting}
            onChange={(event) => setRawInput(event.target.value)}
            rows={6}
            value={rawInput}
          />
        </label>
      )}
      <button disabled={disabled || submitting} onClick={() => void submit()} type='button'>
        {submitting ? 'Resuming…' : 'Resume'}
      </button>
    </div>
  )
}
