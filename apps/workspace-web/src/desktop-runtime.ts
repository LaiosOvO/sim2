import type { ChatToolCall, ChatToolCallStatus } from './chat-stream'

interface DesktopToolResponse {
  ok: boolean
  result?: unknown
  error?: string
  code?: string
}

interface DesktopBrowserApi {
  executeTool(
    toolCallId: string,
    toolName: string,
    argumentsValue: Record<string, unknown>
  ): Promise<DesktopToolResponse>
  getKnownSessions?: () => Promise<{ sessions?: unknown[] }>
  panelAction?: (action: { action: string; tabId?: string; url?: string }) => void
}

interface DesktopTerminalApi {
  executeTool(
    toolCallId: string,
    operation: string,
    argumentsValue: Record<string, unknown>
  ): Promise<DesktopToolResponse>
  getTabs?: () => Promise<{
    tabs?: Array<{
      terminalId?: string
      cwd?: string
      running?: string
      interactive?: boolean
      active?: boolean
    }>
  }>
  finishHandoff?: (terminalId: string) => void
}

interface DesktopApi {
  browserAgent?: DesktopBrowserApi
  terminal?: DesktopTerminalApi
  settings?: {
    getPreferences: () => Promise<{
      browserEnabled?: boolean
      terminalEnabled?: boolean
    }>
  }
}

declare global {
  interface Window {
    simDesktop?: DesktopApi
  }
}

interface DesktopExecutionResult {
  error?: string
  status: ChatToolCallStatus
}

const BROWSER_TOOL_NAMES = new Set([
  'browser_navigate',
  'browser_open_url',
  'browser_go_back',
  'browser_go_forward',
  'browser_open_tab',
  'browser_switch_tab',
  'browser_close_tab',
  'browser_list_tabs',
  'browser_list_sessions',
  'browser_wait_for',
  'browser_snapshot',
  'browser_read_text',
  'browser_screenshot',
  'browser_extract',
  'browser_click',
  'browser_type',
  'browser_press_key',
  'browser_scroll',
  'browser_select_option',
  'browser_hover',
  'browser_request_takeover',
])

const TERMINAL_OPERATIONS = new Set([
  'run',
  'read',
  'input',
  'kill',
  'cwd',
  'list',
  'new',
  'switch',
  'close',
  'panes',
  'handoff',
])

const EXECUTED_STORAGE_PREFIX = 'sim:workspace-vite:desktop-tool:'
const MAX_EVENT_AGE_MS = 120_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExecuted(toolCallId: string): boolean {
  try {
    return sessionStorage.getItem(`${EXECUTED_STORAGE_PREFIX}${toolCallId}`) !== null
  } catch {
    return false
  }
}

function markExecuted(toolCallId: string): void {
  try {
    sessionStorage.setItem(`${EXECUTED_STORAGE_PREFIX}${toolCallId}`, '1')
  } catch {}
}

function isFresh(eventTs?: string): boolean {
  if (!eventTs) return true
  const timestamp = Date.parse(eventTs)
  return Number.isNaN(timestamp) || Date.now() - timestamp <= MAX_EVENT_AGE_MS
}

async function reportCompletion(
  toolCallId: string,
  status: 'success' | 'error' | 'cancelled',
  message: string,
  data?: unknown
): Promise<void> {
  const body = JSON.stringify({
    toolCallId,
    status,
    message,
    ...(data !== undefined ? { data } : {}),
  })
  let response = await fetch('/api/copilot/confirm', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body,
  })
  if (!response.ok) {
    response = await fetch('/api/copilot/confirm', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body,
    })
  }
  if (!response.ok) throw new Error(`Tool completion failed: ${response.status}`)
}

function sanitizedBrowserResult(toolName: string, result: unknown): unknown {
  if (
    toolName !== 'browser_screenshot' ||
    !isRecord(result) ||
    typeof result.dataUrl !== 'string'
  ) {
    return result
  }
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(result.dataUrl)
  const { dataUrl: _dataUrl, ...metadata } = result
  if (!match) return metadata
  return {
    ...metadata,
    content: 'Screenshot of the current browser viewport.',
    attachment: {
      type: 'image',
      source: { type: 'base64', media_type: match[1], data: match[2] },
    },
  }
}

export async function getDesktopCapabilities(): Promise<Record<string, unknown>> {
  const desktop = window.simDesktop
  if (!desktop) return {}
  const preferences: { browserEnabled?: boolean; terminalEnabled?: boolean } =
    (await desktop.settings?.getPreferences().catch(() => undefined)) ?? {}
  const browser = Boolean(desktop.browserAgent) && preferences?.browserEnabled !== false
  const terminal = Boolean(desktop.terminal) && preferences?.terminalEnabled !== false
  const [knownSessions, terminalState] = await Promise.all([
    browser
      ? desktop.browserAgent?.getKnownSessions?.().catch(() => ({ sessions: [] }))
      : undefined,
    terminal ? desktop.terminal?.getTabs?.().catch(() => ({ tabs: [] })) : undefined,
  ])
  const terminals = (terminalState?.tabs ?? []).flatMap((tab) =>
    typeof tab.terminalId === 'string'
      ? [
          {
            id: tab.terminalId,
            ...(tab.cwd ? { cwd: tab.cwd } : {}),
            ...(tab.running ? { running: tab.running } : {}),
            ...(tab.interactive ? { interactive: true } : {}),
            ...(tab.active ? { active: true } : {}),
          },
        ]
      : []
  )
  const browserSessions = knownSessions?.sessions ?? []

  return {
    ...(browser || terminal
      ? {
          desktopCapabilities: {
            ...(browser ? { browser: true } : {}),
            ...(terminal ? { terminal: true } : {}),
            ...(browserSessions.length > 0 ? { browserSessions } : {}),
            ...(terminals.length > 0 ? { terminals } : {}),
          },
        }
      : {}),
    ...(browser ? { browserCapable: true } : {}),
  }
}

export async function executeDesktopTool(
  toolCall: ChatToolCall
): Promise<DesktopExecutionResult | null> {
  const isSupported = BROWSER_TOOL_NAMES.has(toolCall.name) || toolCall.name === 'terminal'
  if (
    !isSupported ||
    !toolCall.clientExecutable ||
    toolCall.status !== 'running' ||
    toolCall.partial ||
    hasExecuted(toolCall.id) ||
    !isFresh(toolCall.eventTs)
  ) {
    return null
  }
  markExecuted(toolCall.id)

  const desktop = window.simDesktop
  const argumentsValue = toolCall.arguments ?? {}
  try {
    let response: DesktopToolResponse
    let result: unknown
    if (BROWSER_TOOL_NAMES.has(toolCall.name)) {
      if (!desktop?.browserAgent) throw new Error('Desktop browser is unavailable')
      response = await desktop.browserAgent.executeTool(toolCall.id, toolCall.name, argumentsValue)
      result = sanitizedBrowserResult(toolCall.name, response.result)
    } else if (toolCall.name === 'terminal') {
      const operation = argumentsValue.operation
      const args = argumentsValue.args
      if (typeof operation !== 'string' || !TERMINAL_OPERATIONS.has(operation)) {
        throw new Error('Terminal tool operation is invalid')
      }
      if (!desktop?.terminal) throw new Error('Desktop terminal is unavailable')
      response = await desktop.terminal.executeTool(
        toolCall.id,
        operation,
        isRecord(args) ? args : {}
      )
      result = response.result
    } else {
      return null
    }

    if (!response.ok) {
      const error = response.error || 'Desktop tool failed'
      const status = response.code === 'REJECTED' ? 'cancelled' : 'error'
      await reportCompletion(toolCall.id, status, error, { error, code: response.code })
      return { status, error }
    }

    await reportCompletion(toolCall.id, 'success', 'Desktop action completed', result)
    return { status: 'success' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Desktop tool failed'
    await reportCompletion(toolCall.id, 'error', message, { error: message }).catch(() => {})
    return { status: 'error', error: message }
  }
}
