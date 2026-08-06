import { useState } from 'react'
import agentToolOptions from '@sim/tool-catalog/generated/agent-tool-options'
import type { ChatToolCall } from './chat-stream'
import type { ToolPermissionDecision } from './tool-actions'

interface ToolCallListProps {
  onToolCallUpdate?: (toolCall: ChatToolCall) => void
  toolCalls: ChatToolCall[]
}

const STATUS_LABELS: Record<ChatToolCall['status'], string> = {
  running: 'Running',
  awaiting_approval: 'Approval required',
  success: 'Completed',
  error: 'Failed',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
  rejected: 'Rejected',
  unknown: 'Updated',
}

function readableToolName(value: string): string {
  return value.replaceAll(/[_-]+/g, ' ').replaceAll(/\b\w/g, (character) => character.toUpperCase())
}

function toolKind(
  name: string
): 'browser' | 'terminal' | 'workflow' | 'file' | 'integration' | 'tool' {
  if (name.startsWith('browser_')) return 'browser'
  if (name === 'terminal' || name.startsWith('terminal_') || name === 'run_code') return 'terminal'
  if (name.includes('workflow') || name === 'deploy') return 'workflow'
  if (name.includes('file') || name === 'edit_content' || name === 'workspace_file') return 'file'
  if (name.includes('_')) return 'integration'
  return 'tool'
}

const KIND_LABELS = {
  browser: 'Browser',
  terminal: 'Terminal',
  workflow: 'Workflow',
  file: 'File',
  integration: 'Integration',
  tool: 'Tool',
} as const

const integrationByCapability = new Map<string, { title: string; type: string }>()
for (const item of agentToolOptions.items) {
  for (const capability of item.capabilities) {
    if (!integrationByCapability.has(capability)) {
      integrationByCapability.set(capability, { title: item.title, type: item.type })
    }
  }
}

function directString(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const entry = value?.[key]
  return typeof entry === 'string' && entry.length > 0 ? entry : undefined
}

export function toolCallPresentation(toolCall: ChatToolCall): {
  kind: ReturnType<typeof toolKind>
  kindLabel: string
  title: string
} {
  const delegatedTool =
    toolCall.name === 'call_integration_tool'
      ? (directString(toolCall.arguments, 'toolId') ?? nestedString(toolCall.arguments, 'toolId'))
      : undefined
  const capability = delegatedTool ?? toolCall.name
  const integration = integrationByCapability.get(capability)
  const kind = integration ? 'integration' : toolKind(toolCall.name)
  const integrationPrefix = integration?.type.replace(/_v\d+$/, '')
  const operationName = integration
    ? capability
        .replace(new RegExp(`^${integrationPrefix?.replaceAll('-', '[_-]')}[_-]`), '')
        .replace(/_v\d+$/, '')
    : toolCall.name
  return {
    kind,
    kindLabel: integration?.title ?? KIND_LABELS[kind],
    title: toolCall.title || readableToolName(operationName),
  }
}

function nestedString(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const args = value?.args
  if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined
  const nested = (args as Record<string, unknown>)[key]
  return typeof nested === 'string' && nested.length > 0 ? nested : undefined
}

interface ToolCallActionProps {
  onToolCallUpdate?: (toolCall: ChatToolCall) => void
  toolCall: ChatToolCall
}

function ToolCallAction({ onToolCallUpdate, toolCall }: ToolCallActionProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const operation =
    toolCall.name === 'terminal' && typeof toolCall.arguments?.operation === 'string'
      ? toolCall.arguments.operation
      : null
  const terminalId = nestedString(toolCall.arguments, 'terminalId')
  const isTakeover = toolCall.name === 'browser_request_takeover' && toolCall.status === 'running'
  const isHandoff = operation === 'handoff' && toolCall.status === 'running'

  const run = async (action: ToolPermissionDecision | 'browser' | 'terminal') => {
    setBusy(true)
    setError(null)
    try {
      const module = await import('./tool-actions')
      if (action === 'browser') {
        module.finishBrowserTakeover()
      } else if (action === 'terminal') {
        module.finishTerminalHandoff(terminalId ?? '')
      } else {
        await module.submitToolPermission([toolCall.id], action)
        onToolCallUpdate?.({
          ...toolCall,
          status: action === 'skip' ? 'skipped' : 'running',
        })
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to complete this action')
    } finally {
      setBusy(false)
    }
  }

  if (toolCall.status === 'awaiting_approval') {
    return (
      <span className='tool-call-actions'>
        <button disabled={busy} onClick={() => void run('allow')} type='button'>
          Allow
        </button>
        <button disabled={busy} onClick={() => void run('allow_chat')} type='button'>
          Allow this chat
        </button>
        <button disabled={busy} onClick={() => void run('always_allow')} type='button'>
          Always allow
        </button>
        <button disabled={busy} onClick={() => void run('skip')} type='button'>
          Skip
        </button>
        {error ? <small>{error}</small> : null}
      </span>
    )
  }
  if (isTakeover) {
    return (
      <button
        className='tool-call-action'
        disabled={busy}
        onClick={() => void run('browser')}
        type='button'
      >
        Done in browser
      </button>
    )
  }
  if (isHandoff) {
    return (
      <button
        className='tool-call-action'
        disabled={busy || !terminalId}
        onClick={() => void run('terminal')}
        type='button'
      >
        Hand back terminal
      </button>
    )
  }
  return <span className='tool-call-status'>{STATUS_LABELS[toolCall.status]}</span>
}

export function ToolCallList({ onToolCallUpdate, toolCalls }: ToolCallListProps) {
  return (
    <div className='tool-call-list' aria-label='Tool activity'>
      {toolCalls.map((toolCall) => {
        const presentation = toolCallPresentation(toolCall)
        return (
          <div className={`tool-call ${toolCall.status} ${presentation.kind}`} key={toolCall.id}>
            <span className='tool-call-indicator' />
            <span className='tool-call-kind'>{presentation.kindLabel}</span>
            <span className='tool-call-copy'>
              <strong>{presentation.title}</strong>
              {toolCall.error ? <small>{toolCall.error}</small> : null}
            </span>
            <ToolCallAction onToolCallUpdate={onToolCallUpdate} toolCall={toolCall} />
          </div>
        )
      })}
    </div>
  )
}
