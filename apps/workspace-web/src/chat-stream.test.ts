/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { type ChatToolCall, consumeChatResponse, normalizePersistedToolCalls } from './chat-stream'

function streamResponse(lines: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line))
        controller.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  )
}

describe('workspace Vite chat stream', () => {
  it('collects canonical text and tool lifecycle events across split chunks', async () => {
    const text: string[] = []
    const tools: ChatToolCall[] = []
    const response = streamResponse([
      'data: {"v":1,"type":"text","payload":{"channel":"assistant","text":"Hel',
      'lo"}}\n\n',
      'data: {"v":1,"type":"tool","payload":{"phase":"call","toolCallId":"tool-1","toolName":"search_web","executor":"sim","mode":"sync"}}\n\n',
      'data: {"v":1,"type":"tool","payload":{"phase":"result","toolCallId":"tool-1","toolName":"search_web","executor":"sim","mode":"sync","success":true}}\n\n',
    ])

    await consumeChatResponse(response, {
      onText: (value) => text.push(value),
      onToolCall: (value) => tools.push(value),
    })

    expect(text).toEqual(['Hello'])
    expect(tools).toEqual([
      { id: 'tool-1', name: 'search_web', status: 'running' },
      { id: 'tool-1', name: 'search_web', status: 'success' },
    ])
  })

  it('normalizes canonical and legacy persisted tool calls without exposing output', () => {
    const calls = normalizePersistedToolCalls({
      contentBlocks: [
        {
          type: 'tool',
          toolCall: {
            id: 'canonical',
            name: 'run_workflow',
            state: 'success',
            result: { success: true, output: { secret: 'not rendered' } },
            display: { title: 'Run workflow' },
          },
        },
      ],
      toolCalls: [
        {
          id: 'legacy',
          name: 'search',
          status: 'failed',
          error: 'Search failed',
        },
      ],
    })

    expect(calls).toEqual([
      {
        id: 'canonical',
        name: 'run_workflow',
        status: 'success',
        title: 'Run workflow',
      },
      {
        id: 'legacy',
        name: 'search',
        status: 'error',
        error: 'Search failed',
      },
    ])
  })

  it('retains client execution metadata without rendering tool output', async () => {
    const tools: ChatToolCall[] = []
    const response = streamResponse([
      'data: {"v":1,"ts":"2026-07-31T00:00:00.000Z","type":"tool","payload":{"phase":"call","toolCallId":"terminal-1","toolName":"terminal","status":"generating","executor":"client","mode":"async","ui":{"clientExecutable":true}}}\n\n',
      'data: {"v":1,"ts":"2026-07-31T00:00:00.000Z","type":"tool","payload":{"phase":"call","toolCallId":"terminal-1","toolName":"terminal","arguments":{"operation":"run","args":{"command":"bun test"}},"executor":"client","mode":"async","ui":{"clientExecutable":true}}}\n\n',
    ])

    await consumeChatResponse(response, {
      onText: () => {},
      onToolCall: (value) => tools.push(value),
    })

    expect(tools).toEqual([
      {
        id: 'terminal-1',
        name: 'terminal',
        status: 'running',
        clientExecutable: true,
        eventTs: '2026-07-31T00:00:00.000Z',
        partial: true,
      },
      {
        id: 'terminal-1',
        name: 'terminal',
        status: 'running',
        arguments: { operation: 'run', args: { command: 'bun test' } },
        clientExecutable: true,
        eventTs: '2026-07-31T00:00:00.000Z',
      },
    ])
  })
})
