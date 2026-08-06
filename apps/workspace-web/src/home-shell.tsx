import {
  type ChangeEvent,
  type FormEvent,
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type ChatAttachment,
  type ChatMessage,
  type ChatSummary,
  type FolderSummary,
  normalizeMessages,
  requestJson,
  type SessionPayload,
  useCachedResource,
  type WorkflowSummary,
  type WorkspaceBootstrapPayload,
  type WorkspaceFileSummary,
} from './api'
import { type ChatToolCall, consumeChatResponse, upsertToolCall } from './chat-stream'
import type { SpeechSession } from './speech-input'

const AdvancedCapabilities = lazy(() =>
  import('./advanced-capabilities').then((module) => ({
    default: module.AdvancedCapabilities,
  }))
)
const ToolCallList = lazy(() =>
  import('./tool-call-list').then((module) => ({ default: module.ToolCallList }))
)
const AttachmentList = lazy(() =>
  import('./attachment-list').then((module) => ({ default: module.AttachmentList }))
)

function selectBootstrap(payload: unknown): WorkspaceBootstrapPayload | null {
  return payload && typeof payload === 'object' ? (payload as WorkspaceBootstrapPayload) : null
}

function Icon({
  name,
}: {
  name: 'home' | 'workflow' | 'chat' | 'plus' | 'send' | 'attach' | 'microphone'
}) {
  const paths = {
    home: <path d='M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z' />,
    workflow: <path d='M5 5h6v6H5zM13 13h6v6h-6zM11 8h4a2 2 0 0 1 2 2v3M8 11v4a2 2 0 0 0 2 2h3' />,
    chat: <path d='M4 5h16v11H9l-5 4z' />,
    plus: <path d='M12 5v14M5 12h14' />,
    send: <path d='m4 4 17 8-17 8 4-8zM8 12h13' />,
    attach: <path d='m8.5 12.5 6.8-6.8a3 3 0 0 1 4.2 4.2l-8.2 8.2a5 5 0 0 1-7.1-7.1l8-8' />,
    microphone: (
      <path d='M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11v1a7 7 0 0 0 14 0v-1M12 19v3M8 22h8' />
    ),
  }

  return (
    <svg aria-hidden='true' className='icon' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
      {paths[name]}
    </svg>
  )
}

export function HomeShell({ workspaceId }: { workspaceId: string }) {
  const encodedWorkspaceId = encodeURIComponent(workspaceId)
  const nextOrigin =
    import.meta.env.VITE_NEXT_BASE_URL && import.meta.env.VITE_NEXT_BASE_URL !== 'same-origin'
      ? import.meta.env.VITE_NEXT_BASE_URL
      : window.location.origin
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
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([])
  const [listening, setListening] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const speechSessionRef = useRef<SpeechSession | null>(null)

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
    setAttachments([])
    setChatError(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('chatId')
    window.history.replaceState({}, '', url)
  }, [])

  const selectFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      event.target.value = ''
      if (files.length === 0) return

      setChatError(null)
      setUploadingFiles(files.map((file) => file.name))
      try {
        const { uploadAttachments } = await import('./attachment-upload')
        const result = await uploadAttachments(files, workspaceId)
        setAttachments((current) => [...current, ...result.attachments])
        if (result.errors.length > 0) setChatError(result.errors.join(' · '))
      } catch (error) {
        setChatError(error instanceof Error ? error.message : 'Unable to upload attachments')
      } finally {
        setUploadingFiles([])
      }
    },
    [workspaceId]
  )

  const toggleSpeech = useCallback(async () => {
    if (speechSessionRef.current) {
      speechSessionRef.current.stop()
      return
    }

    setChatError(null)
    const prefix = message.trim()
    try {
      const { startSpeechInput } = await import('./speech-input')
      speechSessionRef.current = startSpeechInput({
        locale: navigator.language || 'en-US',
        onTranscript: (transcript) => {
          setMessage(prefix ? `${prefix} ${transcript}` : transcript)
        },
        onError: (error) => setChatError(error),
        onEnd: () => {
          speechSessionRef.current = null
          setListening(false)
        },
      })
      setListening(true)
    } catch (error) {
      speechSessionRef.current = null
      setListening(false)
      setChatError(error instanceof Error ? error.message : 'Unable to start speech recognition')
    }
  }, [message])

  const sendMessage = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault()
      const outgoingAttachments = attachments
      const content =
        message.trim() || (outgoingAttachments.length ? 'Analyze the attached file(s).' : '')
      if (!content || sending || uploadingFiles.length > 0) return
      setMessage('')
      setAttachments([])
      setSending(true)
      setChatError(null)
      setMessages((current) => [
        ...current,
        {
          id: `user-${Date.now()}`,
          role: 'user',
          content,
          ...(outgoingAttachments.length ? { attachments: outgoingAttachments } : {}),
        },
      ])

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
        const { getDesktopCapabilities } = await import('./desktop-runtime')
        const desktopCapabilities = await getDesktopCapabilities()
        const response = await fetch('/api/mothership/chat', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message: content,
            chatId,
            workspaceId,
            mode: 'agent',
            ...(outgoingAttachments.length
              ? {
                  fileAttachments: outgoingAttachments.map((attachment) => ({
                    id: attachment.id,
                    key: attachment.key,
                    filename: attachment.filename,
                    media_type: attachment.mediaType,
                    size: attachment.size,
                    ...(attachment.path ? { path: attachment.path } : {}),
                  })),
                }
              : {}),
            ...desktopCapabilities,
            userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        })
        const updateToolCall = (toolCall: ChatToolCall) => {
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId
                ? { ...item, toolCalls: upsertToolCall(item.toolCalls, toolCall) }
                : item
            )
          )
          if (toolCall.clientExecutable && toolCall.status === 'running' && !toolCall.partial) {
            void import('./desktop-runtime')
              .then((module) => module.executeDesktopTool(toolCall))
              .then((result) => {
                if (!result) return
                updateToolCall({
                  ...toolCall,
                  status: result.status,
                  ...(result.error ? { error: result.error } : {}),
                })
              })
              .catch(() => {})
          }
        }
        await consumeChatResponse(response, {
          onText: (text) => {
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId ? { ...item, content: `${item.content}${text}` } : item
              )
            )
          },
          onToolCall: updateToolCall,
        })
        refreshBootstrap()
      } catch (error) {
        setAttachments((current) => (current.length > 0 ? current : outgoingAttachments))
        setChatError(error instanceof Error ? error.message : 'Unable to send message')
      } finally {
        setSending(false)
      }
    },
    [
      attachments,
      message,
      refreshBootstrap,
      selectedChatId,
      sending,
      uploadingFiles.length,
      workspaceId,
    ]
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
                href={`/workspace/${encodeURIComponent(workspaceId)}/w/${encodeURIComponent(workflow.id)}`}
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
            <button
              aria-expanded={advancedOpen}
              className='advanced-toggle'
              onClick={() => setAdvancedOpen((current) => !current)}
              type='button'
            >
              Advanced
            </button>
          </div>
        </header>

        {advancedOpen ? (
          <Suspense fallback={<div className='advanced-loading'>Loading advanced options…</div>}>
            <AdvancedCapabilities
              chatId={selectedChatId}
              nextOrigin={nextOrigin}
              onClose={() => setAdvancedOpen(false)}
              workspaceId={workspaceId}
            />
          </Suspense>
        ) : null}

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
                    {item.content || (sending && item.role === 'assistant') ? (
                      <p>{item.content || 'Thinking…'}</p>
                    ) : null}
                    {item.attachments?.length ? (
                      <Suspense fallback={<div className='attachment-loading'>Loading files…</div>}>
                        <AttachmentList attachments={item.attachments} />
                      </Suspense>
                    ) : null}
                    {item.toolCalls?.length ? (
                      <Suspense
                        fallback={<div className='tool-call-loading'>Loading activity…</div>}
                      >
                        <ToolCallList
                          onToolCallUpdate={(toolCall) =>
                            setMessages((current) =>
                              current.map((messageItem) => ({
                                ...messageItem,
                                ...(messageItem.toolCalls?.some(
                                  (currentToolCall) => currentToolCall.id === toolCall.id
                                )
                                  ? {
                                      toolCalls: upsertToolCall(messageItem.toolCalls, toolCall),
                                    }
                                  : {}),
                              }))
                            )
                          }
                          toolCalls={item.toolCalls}
                        />
                      </Suspense>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>

          <form className='composer' onSubmit={(event) => void sendMessage(event)}>
            <input
              aria-label='Attach files'
              hidden
              multiple
              onChange={(event) => void selectFiles(event)}
              ref={fileInputRef}
              type='file'
            />
            {attachments.length > 0 || uploadingFiles.length > 0 ? (
              <div className='composer-attachments'>
                {attachments.length > 0 ? (
                  <Suspense fallback={<div className='attachment-loading'>Loading files…</div>}>
                    <AttachmentList
                      attachments={attachments}
                      onRemove={(id) =>
                        setAttachments((current) =>
                          current.filter((attachment) => attachment.id !== id)
                        )
                      }
                    />
                  </Suspense>
                ) : null}
                {uploadingFiles.length > 0 ? (
                  <span className='uploading-files'>
                    Uploading {uploadingFiles.length}{' '}
                    {uploadingFiles.length === 1 ? 'file' : 'files'}…
                  </span>
                ) : null}
              </div>
            ) : null}
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
              <div className='composer-actions'>
                <button
                  className='composer-tool'
                  disabled={sending}
                  onClick={() => fileInputRef.current?.click()}
                  title='Attach files'
                  type='button'
                >
                  <Icon name='attach' />
                </button>
                <button
                  aria-pressed={listening}
                  className={listening ? 'composer-tool listening' : 'composer-tool'}
                  disabled={sending}
                  onClick={() => void toggleSpeech()}
                  title={listening ? 'Stop listening' : 'Use microphone'}
                  type='button'
                >
                  <Icon name='microphone' />
                </button>
                <span>
                  {chatError || bootstrap.error
                    ? chatError || bootstrap.error
                    : 'Enter to send · Shift+Enter for a new line'}
                </span>
              </div>
              <button
                className='composer-send'
                disabled={
                  (!message.trim() && attachments.length === 0) ||
                  sending ||
                  uploadingFiles.length > 0
                }
                title='Send message'
                type='submit'
              >
                <Icon name='send' />
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
