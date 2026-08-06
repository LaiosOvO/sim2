/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { finishBrowserTakeover, finishTerminalHandoff, submitToolPermission } from './tool-actions'

describe('workspace Vite tool actions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('submits an inline permission decision', async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true }))
    vi.stubGlobal('fetch', fetchMock)

    await submitToolPermission(['call-1'], 'allow')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/copilot/tool-permission',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          decisions: [{ toolCallId: 'call-1', decision: 'allow' }],
        }),
      })
    )
  })

  it('hands Browser and Terminal control back through the desktop bridge', () => {
    const panelAction = vi.fn()
    const finishHandoff = vi.fn()
    vi.stubGlobal('window', {
      simDesktop: {
        browserAgent: { panelAction },
        terminal: { finishHandoff },
      },
    })

    finishBrowserTakeover()
    finishTerminalHandoff('terminal-1')

    expect(panelAction).toHaveBeenCalledWith({ action: 'takeover-done' })
    expect(finishHandoff).toHaveBeenCalledWith('terminal-1')
  })
})
