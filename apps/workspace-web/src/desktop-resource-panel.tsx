import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface BrowserPageState {
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
  title: string
  url: string
}

interface TerminalTab {
  active?: boolean
  cwd?: string | null
  terminalId: string
  title?: string
}

interface TerminalTabs {
  activeTerminalId?: string | null
  tabs?: TerminalTab[]
}

interface DesktopResourcesApi {
  browserAgent?: {
    onPageState: (callback: (state: BrowserPageState) => void) => () => void
    panelAction: (action: { action: string; url?: string }) => void
    setPanelBounds: (bounds: { height: number; width: number; x: number; y: number } | null) => void
  }
  terminal?: {
    getScrollback: (terminalId: string) => Promise<string>
    getTabs?: () => Promise<TerminalTabs>
    onData?: (callback: (terminalId: string, data: string) => void) => () => void
    onTabs?: (callback: (tabs: TerminalTabs) => void) => () => void
    openTerminal: (cwd?: string) => Promise<TerminalTabs>
    start: (options: { cols: number; rows: number }) => Promise<TerminalTabs>
    switchTerminal: (terminalId: string) => Promise<TerminalTabs>
    write: (terminalId: string, data: string) => void
  }
}

function desktopApi(): DesktopResourcesApi | undefined {
  return (window as Window & { simDesktop?: DesktopResourcesApi }).simDesktop
}

function BrowserPanel() {
  const panelRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState<BrowserPageState | null>(null)
  const [url, setUrl] = useState('')
  const browser = desktopApi()?.browserAgent

  useEffect(() => {
    if (!browser) return
    return browser.onPageState((state) => {
      setPage(state)
      setUrl(state.url)
    })
  }, [browser])

  useLayoutEffect(() => {
    if (!browser || !panelRef.current) return
    const element = panelRef.current
    const reportBounds = () => {
      const rect = element.getBoundingClientRect()
      browser.setPanelBounds({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }
    reportBounds()
    const observer = new ResizeObserver(reportBounds)
    observer.observe(element)
    window.addEventListener('resize', reportBounds)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', reportBounds)
      browser.setPanelBounds(null)
    }
  }, [browser])

  const navigate = (event: FormEvent) => {
    event.preventDefault()
    if (!url.trim()) return
    browser?.panelAction({ action: 'navigate', url: url.trim() })
  }

  if (!browser) return <p className='desktop-unavailable'>Desktop browser is unavailable.</p>
  return (
    <section className='desktop-browser'>
      <form onSubmit={navigate}>
        <button
          disabled={!page?.canGoBack}
          onClick={() => browser.panelAction({ action: 'back' })}
          type='button'
        >
          ←
        </button>
        <button
          disabled={!page?.canGoForward}
          onClick={() => browser.panelAction({ action: 'forward' })}
          type='button'
        >
          →
        </button>
        <button onClick={() => browser.panelAction({ action: 'reload' })} type='button'>
          {page?.loading ? '…' : '↻'}
        </button>
        <input
          aria-label='Browser URL'
          onChange={(event) => setUrl(event.target.value)}
          placeholder='https://example.com'
          value={url}
        />
      </form>
      <div className='desktop-browser-viewport' ref={panelRef}>
        {!page ? <span>Open a browser tool to start a session.</span> : null}
      </div>
    </section>
  )
}

function TerminalPanel() {
  const terminal = desktopApi()?.terminal
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const applyTabs = useCallback((state: TerminalTabs) => {
    const nextActiveId =
      state.activeTerminalId ?? state.tabs?.find((tab) => tab.active)?.terminalId ?? null
    setTabs(state.tabs ?? [])
    setActiveId(nextActiveId)
    activeIdRef.current = nextActiveId
  }, [])

  useEffect(() => {
    if (!terminal) return
    void terminal
      .start({ cols: 100, rows: 30 })
      .then(applyTabs)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : 'Unable to start terminal')
      )
    const unsubscribeTabs = terminal.onTabs?.(applyTabs)
    const unsubscribeData = terminal.onData?.((terminalId, data) => {
      if (terminalId !== activeIdRef.current) return
      setOutput((current) => `${current}${data}`.slice(-30_000))
    })
    return () => {
      unsubscribeTabs?.()
      unsubscribeData?.()
    }
  }, [applyTabs, terminal])

  useEffect(() => {
    if (!terminal || !activeId) {
      setOutput('')
      return
    }
    void terminal
      .getScrollback(activeId)
      .then((value) => setOutput(value.slice(-30_000)))
      .catch(() => {})
  }, [activeId, terminal])

  const send = (event: FormEvent) => {
    event.preventDefault()
    if (!terminal || !activeId || !input) return
    terminal.write(activeId, `${input}\r`)
    setInput('')
  }

  if (!terminal) return <p className='desktop-unavailable'>Desktop terminal is unavailable.</p>
  return (
    <section className='desktop-terminal'>
      <div className='terminal-tabs'>
        {tabs.map((tab) => (
          <button
            aria-pressed={tab.terminalId === activeId}
            key={tab.terminalId}
            onClick={() => void terminal.switchTerminal(tab.terminalId).then(applyTabs)}
            type='button'
          >
            {tab.title || tab.cwd || 'Terminal'}
          </button>
        ))}
        <button onClick={() => void terminal.openTerminal().then(applyTabs)} type='button'>
          +
        </button>
      </div>
      <pre>{output || 'Terminal output will appear here.'}</pre>
      <form onSubmit={send}>
        <input
          aria-label='Terminal input'
          disabled={!activeId}
          onChange={(event) => setInput(event.target.value)}
          placeholder='Type a command or response'
          value={input}
        />
        <button disabled={!activeId || !input} type='submit'>
          Send
        </button>
      </form>
      {error ? <small>{error}</small> : null}
    </section>
  )
}

interface DesktopResourcePanelProps {
  onClose: () => void
}

export function DesktopResourcePanel({ onClose }: DesktopResourcePanelProps) {
  const [tab, setTab] = useState<'browser' | 'terminal'>('browser')
  return (
    <aside className='desktop-resource-panel'>
      <header>
        <div>
          <button aria-pressed={tab === 'browser'} onClick={() => setTab('browser')} type='button'>
            Browser
          </button>
          <button
            aria-pressed={tab === 'terminal'}
            onClick={() => setTab('terminal')}
            type='button'
          >
            Terminal
          </button>
        </div>
        <button aria-label='Close desktop resources' onClick={onClose} type='button'>
          ×
        </button>
      </header>
      {tab === 'browser' ? <BrowserPanel /> : <TerminalPanel />}
    </aside>
  )
}
