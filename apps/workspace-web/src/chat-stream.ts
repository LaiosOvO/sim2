export type ChatToolCallStatus =
  | 'running'
  | 'awaiting_approval'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'skipped'
  | 'rejected'
  | 'unknown'

export interface ChatToolCall {
  id: string
  name: string
  title?: string
  status: ChatToolCallStatus
  error?: string
  arguments?: Record<string, unknown>
  clientExecutable?: boolean
  eventTs?: string
  partial?: boolean
}

export interface ChatStreamHandlers {
  onText: (text: string) => void
  onToolCall?: (toolCall: ChatToolCall) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizeToolStatus(value: unknown, fallback: ChatToolCallStatus): ChatToolCallStatus {
  switch (value) {
    case 'pending':
    case 'generating':
    case 'executing':
    case 'running':
      return 'running'
    case 'awaiting_approval':
      return 'awaiting_approval'
    case 'completed':
    case 'success':
      return 'success'
    case 'failed':
    case 'error':
    case 'interrupted':
      return 'error'
    case 'cancelled':
    case 'aborted':
      return 'cancelled'
    case 'skipped':
      return 'skipped'
    case 'rejected':
      return 'rejected'
    default:
      return fallback
  }
}

function toolTitle(value: Record<string, unknown>): string | undefined {
  const display = isRecord(value.display) ? value.display : null
  const ui = isRecord(value.ui) ? value.ui : null
  return (
    optionalString(value.displayTitle) ??
    optionalString(display?.title) ??
    optionalString(display?.text) ??
    optionalString(ui?.title)
  )
}

function normalizeToolCall(
  value: unknown,
  fallbackStatus: ChatToolCallStatus
): ChatToolCall | null {
  if (!isRecord(value)) return null
  const id = optionalString(value.toolCallId) ?? optionalString(value.id)
  const name = optionalString(value.toolName) ?? optionalString(value.name)
  if (!id || !name) return null

  const ui = isRecord(value.ui) ? value.ui : null
  if (ui?.hidden === true || ui?.internal === true) return null

  const result = isRecord(value.result) ? value.result : null
  const success =
    typeof value.success === 'boolean'
      ? value.success
      : typeof result?.success === 'boolean'
        ? result.success
        : undefined
  const resultStatus =
    success === undefined ? fallbackStatus : success ? ('success' as const) : ('error' as const)
  const status = normalizeToolStatus(value.status ?? value.state, resultStatus)
  const error =
    optionalString(value.error) ??
    optionalString(result?.error) ??
    (status === 'error' ? 'Tool execution failed' : undefined)
  const title = toolTitle(value)
  const argumentsValue = isRecord(value.arguments)
    ? value.arguments
    : isRecord(value.params)
      ? value.params
      : undefined

  return {
    id,
    name,
    status,
    ...(title ? { title } : {}),
    ...(error ? { error } : {}),
    ...(argumentsValue ? { arguments: argumentsValue } : {}),
    ...(ui?.clientExecutable === true ? { clientExecutable: true } : {}),
    ...(value.partial === true || value.status === 'generating' ? { partial: true } : {}),
  }
}

function toolCallFromStreamEvent(value: unknown): ChatToolCall | null {
  if (!isRecord(value) || value.type !== 'tool' || !isRecord(value.payload)) return null
  const payload = value.payload
  if (payload.phase === 'args_delta') return null
  const fallbackStatus = payload.phase === 'result' ? 'unknown' : 'running'
  const toolCall = normalizeToolCall(payload, fallbackStatus)
  if (!toolCall) return null
  return typeof value.ts === 'string' ? { ...toolCall, eventTs: value.ts } : toolCall
}

function textFromStreamEvent(value: unknown): string {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return ''

  if (value.type === 'text' && isRecord(value.payload)) {
    if (value.payload.channel === 'thinking') return ''
    return optionalString(value.payload.text) ?? ''
  }

  for (const key of ['delta', 'textDelta', 'text', 'content']) {
    const text = optionalString(value[key])
    if (text) return text
  }

  return isRecord(value.payload) ? textFromStreamEvent(value.payload) : ''
}

export function normalizePersistedToolCalls(message: Record<string, unknown>): ChatToolCall[] {
  const calls = new Map<string, ChatToolCall>()
  const contentBlocks = Array.isArray(message.contentBlocks) ? message.contentBlocks : []
  const legacyToolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : []

  for (const block of contentBlocks) {
    if (!isRecord(block) || (block.type !== 'tool' && block.type !== 'tool_call')) continue
    const toolCall = normalizeToolCall(block.toolCall ?? block, 'unknown')
    if (toolCall) calls.set(toolCall.id, toolCall)
  }

  for (const value of legacyToolCalls) {
    const toolCall = normalizeToolCall(value, 'unknown')
    if (toolCall) calls.set(toolCall.id, toolCall)
  }

  return [...calls.values()]
}

export function upsertToolCall(
  current: ChatToolCall[] | undefined,
  incoming: ChatToolCall
): ChatToolCall[] {
  const calls = current ?? []
  const existingIndex = calls.findIndex((toolCall) => toolCall.id === incoming.id)
  if (existingIndex < 0) return [...calls, incoming]

  return calls.map((toolCall, index) =>
    index === existingIndex ? { ...toolCall, ...incoming } : toolCall
  )
}

export async function consumeChatResponse(
  response: Response,
  handlers: ChatStreamHandlers
): Promise<void> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(
      isRecord(payload) && 'error' in payload
        ? String(payload.error)
        : `${response.status} ${response.statusText}`
    )
  }

  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const dispatchLine = (line: string) => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    try {
      const event: unknown = JSON.parse(data)
      const text = textFromStreamEvent(event)
      if (text) handlers.onText(text)
      const toolCall = toolCallFromStreamEvent(event)
      if (toolCall) handlers.onToolCall?.(toolCall)
    } catch {}
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) dispatchLine(line)
  }

  buffer += decoder.decode()
  if (buffer.trim()) dispatchLine(buffer.trim())
}
