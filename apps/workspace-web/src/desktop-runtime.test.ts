/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeDesktopTool, getDesktopCapabilities } from './desktop-runtime'

describe('workspace Vite desktop runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports only enabled desktop capabilities', async () => {
    vi.stubGlobal('window', {
      simDesktop: {
        settings: {
          getPreferences: vi.fn(async () => ({ browserEnabled: true, terminalEnabled: false })),
        },
        browserAgent: {
          executeTool: vi.fn(),
          getKnownSessions: vi.fn(async () => ({ sessions: [{ host: 'example.com' }] })),
        },
        terminal: {
          executeTool: vi.fn(),
          getTabs: vi.fn(async () => ({ tabs: [{ terminalId: 'terminal-1' }] })),
        },
      },
    })

    await expect(getDesktopCapabilities()).resolves.toEqual({
      browserCapable: true,
      desktopCapabilities: {
        browser: true,
        browserSessions: [{ host: 'example.com' }],
      },
    })
  })

  it('executes and confirms a terminal tool exactly once', async () => {
    const executed = new Set<string>()
    const executeTool = vi.fn(async () => ({ ok: true, result: { output: 'done' } }))
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => (executed.has(key) ? '1' : null),
      setItem: (key: string) => executed.add(key),
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', {
      simDesktop: {
        terminal: { executeTool },
      },
    })
    const toolCall = {
      id: 'terminal-call-1',
      name: 'terminal',
      status: 'running' as const,
      clientExecutable: true,
      arguments: {
        operation: 'run',
        args: { command: 'bun test' },
      },
    }

    await expect(executeDesktopTool(toolCall)).resolves.toEqual({ status: 'success' })
    await expect(executeDesktopTool(toolCall)).resolves.toBeNull()
    expect(executeTool).toHaveBeenCalledWith('terminal-call-1', 'run', { command: 'bun test' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps interactive Browser and Terminal calls pending on the desktop bridge', async () => {
    const executed = new Set<string>()
    const browserExecute = vi.fn(async () => ({ ok: true, result: { handedBack: true } }))
    const terminalExecute = vi.fn(async () => ({ ok: true, result: { handedBack: true } }))
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => (executed.has(key) ? '1' : null),
      setItem: (key: string) => executed.add(key),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 }))
    )
    vi.stubGlobal('window', {
      simDesktop: {
        browserAgent: { executeTool: browserExecute },
        terminal: { executeTool: terminalExecute },
      },
    })

    await executeDesktopTool({
      id: 'browser-handoff',
      name: 'browser_request_takeover',
      status: 'running',
      clientExecutable: true,
      arguments: { reason: 'Sign in' },
    })
    await executeDesktopTool({
      id: 'terminal-handoff',
      name: 'terminal',
      status: 'running',
      clientExecutable: true,
      arguments: {
        operation: 'handoff',
        args: { terminalId: 'terminal-1', reason: 'Enter password' },
      },
    })

    expect(browserExecute).toHaveBeenCalledOnce()
    expect(terminalExecute).toHaveBeenCalledWith('terminal-handoff', 'handoff', {
      terminalId: 'terminal-1',
      reason: 'Enter password',
    })
  })
})
