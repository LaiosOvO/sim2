import { type FormEvent, useCallback, useMemo, useState } from 'react'
import {
  type ChatMessage,
  type ChatSummary,
  consumeChatResponse,
  type FolderSummary,
  normalizeMessages,
  requestJson,
  type SessionPayload,
  useCachedResource,
  type WorkflowSummary,
  type WorkspaceBootstrapPayload,
  type WorkspaceFileSummary,
} from './api'

function workspaceIdFromLocation(): string | null {
  const match = window.location.pathname.match(/^\/workspace\/([^/]+)\/home\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function selectBootstrap(payload: unknown): WorkspaceBootstrapPayload | null {
  return payload && typeof payload === 'object' ? (payload as WorkspaceBootstrapPayload) : null
}

function Icon({ name }: { name: 'home' | 'workflow' | 'chat' | 'plus' | 'send' }) {
  const paths = {
    home: <path d='M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z' />,
    workflow: <path d='M5 5h6v6H5zM13 13h6v6h-6zM11 8h4a2 2 0 0 1 2 2v3M8 11v4a2 2 0 0 0 2 2h3' />,
    chat: <path d='M4 5h16v11H9l-5 4z' />,
    plus: <path d='M12 5v14M5 12h14' />,
    send: <path d='m4 4 17 8-17 8 4-8zM8 12h13' />,
  }

  return (
    <svg aria-hidden='true' className='icon' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
      {paths[name]}
    </svg>
  )
}

function WorkspaceShell({ workspaceId }: { workspaceId: string }) {
  const encodedWorkspaceId = encodeURIComponent(workspaceId)
  const nextOrigin = `${window.location.protocol}//${window.location.hostname}:3000`
  const bootstrap = useCachedResource<WorkspaceBootstrapPayload | null>(
    `${workspaceId}:bootstrap`,
    `/api/workspace-bootstrap?workspaceId=${encodedWorkspaceId}`,
    null,
    selectBootstrap
  )
  const session: SessionPayload | null = bootstrap.data?.session ?? null
  const workflows: WorkflowSummary[] = bootstrap.data?.workflows ?? []
  const folders: FolderSummary[] = bootstrap.data?.folders ?? []
  const chats: ChatSummary[] = bootstrap.data?.chats ?? []
  const files: WorkspaceFileSummary[] = bootstrap.data?.files ?? []
  const refreshBootstrap = bootstrap.refresh
  const [selectedChatId, setSelectedChatId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('chatId')
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const firstName = session?.user?.name?.split(/\s+/)[0] ?? ''
  const folderNameById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders]
  )

  const selectChat = useCallback(async (chatId: string) => {
    setSelectedChatId(chatId)
    setChatError(null)
    const url = new URL(window.location.href)
    url.searchParams.set('chatId', chatId)
    window.history.replaceState({}, '', url)
    try {
      const payload = await requestJson<unknown>(`/api/mothership/chats/${chatId}`)
      setMessages(normalizeMessages(payload))
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Unable to load chat')
    }
  }, [])

  const newChat = useCallback(() => {
    setSelectedChatId(null)
    setMessages([])
    setChatError(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('chatId')
    window.history.replaceState({}, '', url)
  }, [])

  const sendMessage = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault()
      const content = message.trim()
      if (!content || sending) return
      setMessage('')
      setSending(true)
      setChatError(null)
      setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', content }])

      try {
        let chatId = selectedChatId
        if (!chatId) {
          const created = await requestJson<{ id: string }>('/api/mothership/chats', {
            method: 'POST',
            body: JSON.stringify({ workspaceId }),
          })
          chatId = created.id
          setSelectedChatId(chatId)
          const url = new URL(window.location.href)
          url.searchParams.set('chatId', chatId)
          window.history.replaceState({}, '', url)
        }

        const assistantId = `assistant-${Date.now()}`
        setMessages((current) => [...current, { id: assistantId, role: 'assistant', content: '' }])
        const response = await fetch('/api/mothership/chat', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message: content,
            chatId,
            workspaceId,
            mode: 'agent',
            userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        })
        await consumeChatResponse(response, (text) => {
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId ? { ...item, content: `${item.content}${text}` } : item
            )
          )
        })
        refreshBootstrap()
      } catch (error) {
        setChatError(error instanceof Error ? error.message : 'Unable to send message')
      } finally {
        setSending(false)
      }
    },
    [message, refreshBootstrap, selectedChatId, sending, workspaceId]
  )

  return (
    <div
      className='workspace-shell'
      data-workspace-data-state={
        bootstrap.loading ? 'loading' : bootstrap.error ? 'error' : 'complete'
      }
      data-workspace-ready='true'
      data-workspace-runtime='vite'
    >
      <aside className='sidebar' aria-label='Workspace navigation'>
        <div className='sidebar-header'>
          <a className='brand' href={`/workspace/${workspaceId}/home`}>
            sim
          </a>
          <button className='icon-button' onClick={newChat} title='New chat' type='button'>
            <Icon name='plus' />
          </button>
        </div>

        <nav className='primary-nav'>
          <a aria-current='page' href={`/workspace/${workspaceId}/home`}>
            <Icon name='home' /> Home
          </a>
          <a href={`${nextOrigin}/workspace/${workspaceId}/w`}>
            <Icon name='workflow' /> Workflows
          </a>
        </nav>

        <section className='sidebar-section'>
          <div className='section-heading'>
            <span>Recent chats</span>
            {bootstrap.loading ? <span className='activity-dot' /> : null}
          </div>
          <div className='resource-list'>
            {chats.slice(0, 8).map((chat) => (
              <button
                className={chat.id === selectedChatId ? 'resource active' : 'resource'}
                key={chat.id}
                onClick={() => void selectChat(chat.id)}
                type='button'
              >
                <Icon name='chat' />
                <span>{chat.title || 'New chat'}</span>
              </button>
            ))}
            {!bootstrap.loading && chats.length === 0 ? (
              <p className='empty-state'>No chats yet</p>
            ) : null}
          </div>
        </section>

        <section className='sidebar-section workflows'>
          <div className='section-heading'>
            <span>Workflows</span>
            {bootstrap.loading ? <span className='activity-dot' /> : null}
          </div>
          <div className='resource-list'>
            {workflows.slice(0, 10).map((workflow) => (
              <a
                className='resource'
                href={`${nextOrigin}/workspace/${workspaceId}/w/${workflow.id}`}
                key={workflow.id}
              >
                <Icon name='workflow' />
                <span>
                  {workflow.name}
                  {workflow.folderId && folderNameById.get(workflow.folderId) ? (
                    <small>{folderNameById.get(workflow.folderId)}</small>
                  ) : null}
                </span>
              </a>
            ))}
          </div>
        </section>

        <div className='account'>
          <span className='avatar'>{firstName.slice(0, 1).toUpperCase() || 'S'}</span>
          <span>
            {bootstrap.loading ? 'Loading account…' : session?.user?.name || 'Local workspace'}
          </span>
        </div>
      </aside>

      <main className='workspace-content'>
        <header className='topbar'>
          <div>
            <strong>Workspace</strong>
            <span className='runtime-badge'>Vite</span>
          </div>
          <div className='topbar-meta'>
            <span>{workflows.length} workflows</span>
            <span>{files.length} files</span>
            {bootstrap.loading ? <span>Syncing…</span> : <span>Synced</span>}
          </div>
        </header>

        <div className='home-surface'>
          <div className={messages.length ? 'conversation has-messages' : 'conversation'}>
            {messages.length === 0 ? (
              <div className='welcome'>
                <div className='mark'>S</div>
                <h1>{firstName ? `How can I help, ${firstName}?` : 'How can I help?'}</h1>
                <p>Build workflows, connect tools, analyze files, and automate work.</p>
                <div className='suggestions'>
                  {[
                    'Create a CRM with sample data',
                    'Summarize my workspace files',
                    'Build a lead enrichment workflow',
                    'Connect Slack to Gmail',
                  ].map((suggestion) => (
                    <button key={suggestion} onClick={() => setMessage(suggestion)} type='button'>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className='message-list' aria-live='polite'>
                {messages.map((item) => (
                  <article className={`message ${item.role}`} key={item.id}>
                    <span>{item.role === 'user' ? 'You' : 'Sim'}</span>
                    <p>{item.content || (sending ? 'Thinking…' : '')}</p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <form className='composer' onSubmit={(event) => void sendMessage(event)}>
            <textarea
              aria-label='Message Sim'
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage()
                }
              }}
              placeholder='Ask Sim to build or automate anything…'
              rows={3}
              value={message}
            />
            <div className='composer-footer'>
              <span>
                {chatError || bootstrap.error
                  ? chatError || bootstrap.error
                  : 'Enter to send · Shift+Enter for a new line'}
              </span>
              <button disabled={!message.trim() || sending} title='Send message' type='submit'>
                <Icon name='send' />
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

export function App() {
  const workspaceId = workspaceIdFromLocation()
  if (!workspaceId) {
    return (
      <main className='workspace-error'>
        <div>
          <h1>Workspace route not found</h1>
          <p>Expected /workspace/:workspaceId/home.</p>
        </div>
      </main>
    )
  }

  return <WorkspaceShell workspaceId={workspaceId} />
}
