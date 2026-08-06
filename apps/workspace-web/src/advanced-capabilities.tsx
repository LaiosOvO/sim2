import { lazy, Suspense, useState } from 'react'
import { legacyHomeHref } from './runtime-links'

interface AdvancedCapabilitiesProps {
  chatId: string | null
  nextOrigin: string
  onClose: () => void
  workspaceId: string
}

const CAPABILITIES = [
  {
    title: 'Browser and Terminal',
    detail:
      'Desktop actions, live browser surface, terminal input, takeover and handoff run in Vite.',
    status: 'Native',
  },
  {
    title: 'Voice and uploads',
    detail: 'Microphone dictation and chat attachments now run directly in the Vite Home.',
    status: 'Native',
  },
  {
    title: 'Rich tool cards',
    detail: 'Category-aware lifecycle cards and allow/skip approval decisions run in Vite.',
    status: 'Native',
  },
] as const

const DesktopResourcePanel = lazy(() =>
  import('./desktop-resource-panel').then((module) => ({
    default: module.DesktopResourcePanel,
  }))
)

export function AdvancedCapabilities({
  chatId,
  nextOrigin,
  onClose,
  workspaceId,
}: AdvancedCapabilitiesProps) {
  const [desktopOpen, setDesktopOpen] = useState(false)
  const fullHomeHref = legacyHomeHref(nextOrigin, workspaceId, chatId)

  return (
    <aside className='advanced-drawer' aria-label='Advanced Home capabilities'>
      <div className='advanced-drawer-header'>
        <div>
          <strong>Advanced capabilities</strong>
          <p>Loaded only when requested, without expanding the Vite entry bundle.</p>
        </div>
        <button aria-label='Close advanced capabilities' onClick={onClose} type='button'>
          ×
        </button>
      </div>
      <div className='advanced-capability-list'>
        {CAPABILITIES.map((capability) => (
          <div className='advanced-capability' key={capability.title}>
            <div>
              <strong>{capability.title}</strong>
              <span>{capability.status}</span>
            </div>
            <p>{capability.detail}</p>
          </div>
        ))}
      </div>
      <button className='full-home-link' onClick={() => setDesktopOpen(true)} type='button'>
        Open Browser / Terminal
      </button>
      {desktopOpen ? (
        <Suspense fallback={<div className='advanced-loading'>Loading desktop resources…</div>}>
          <DesktopResourcePanel onClose={() => setDesktopOpen(false)} />
        </Suspense>
      ) : null}
      <a className='full-home-link' href={fullHomeHref}>
        Open Next compatibility view
      </a>
      <small>
        The compatibility view remains available until the final production equivalence gate passes.
      </small>
    </aside>
  )
}
