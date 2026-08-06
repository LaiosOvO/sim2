import { lazy, Suspense } from 'react'

const HomeShell = lazy(() =>
  import('./home-shell').then((module) => ({ default: module.HomeShell }))
)
const EditorShell = lazy(() =>
  import('./editor-shell').then((module) => ({ default: module.EditorShell }))
)

type WorkspaceRoute =
  | { kind: 'home'; workspaceId: string }
  | { kind: 'editor'; workflowId: string; workspaceId: string }
  | { kind: 'unknown' }

function workspaceRouteFromLocation(): WorkspaceRoute {
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'workspace' || !parts[1]) return { kind: 'unknown' }
  const workspaceId = decodeURIComponent(parts[1])
  if (parts[2] === 'home' && parts.length === 3) return { kind: 'home', workspaceId }
  if (parts[2] === 'w' && parts[3] && parts.length === 4) {
    return {
      kind: 'editor',
      workspaceId,
      workflowId: decodeURIComponent(parts[3]),
    }
  }
  return { kind: 'unknown' }
}

export function App() {
  const route = workspaceRouteFromLocation()
  const nextOrigin =
    import.meta.env.VITE_NEXT_BASE_URL && import.meta.env.VITE_NEXT_BASE_URL !== 'same-origin'
      ? import.meta.env.VITE_NEXT_BASE_URL
      : window.location.origin

  if (route.kind === 'unknown') {
    return (
      <main className='workspace-error'>
        <div>
          <h1>Workspace route not found</h1>
          <p>Expected a Workspace Home or Workflow Editor route.</p>
        </div>
      </main>
    )
  }

  return (
    <Suspense fallback={<main className='route-loading'>Loading Workspace…</main>}>
      {route.kind === 'home' ? (
        <HomeShell workspaceId={route.workspaceId} />
      ) : (
        <EditorShell
          nextOrigin={nextOrigin}
          workflowId={route.workflowId}
          workspaceId={route.workspaceId}
        />
      )}
    </Suspense>
  )
}
