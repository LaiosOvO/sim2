export type ToolPermissionDecision = 'allow' | 'allow_chat' | 'always_allow' | 'skip'

interface DesktopActionApi {
  browserAgent?: {
    panelAction?: (action: { action: 'takeover-done' }) => void
  }
  terminal?: {
    finishHandoff?: (terminalId: string) => void
  }
}

function desktopApi(): DesktopActionApi | undefined {
  return (window as Window & { simDesktop?: DesktopActionApi }).simDesktop
}

export async function submitToolPermission(
  toolCallIds: string[],
  decision: ToolPermissionDecision
): Promise<void> {
  const response = await fetch('/api/copilot/tool-permission', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      decisions: toolCallIds.map((toolCallId) => ({ toolCallId, decision })),
    }),
  })
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `Permission decision failed: ${response.status}`
    throw new Error(message)
  }
}

export function finishBrowserTakeover(): void {
  const browser = desktopApi()?.browserAgent
  if (!browser?.panelAction) throw new Error('Desktop browser takeover is unavailable')
  browser.panelAction({ action: 'takeover-done' })
}

export function finishTerminalHandoff(terminalId: string): void {
  const terminal = desktopApi()?.terminal
  if (!terminal?.finishHandoff) throw new Error('Desktop terminal handoff is unavailable')
  terminal.finishHandoff(terminalId)
}
