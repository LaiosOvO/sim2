'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, chipVariants, cn, Expandable, ExpandableContent } from '@sim/emcn'
import { Shuffle, Table } from '@sim/emcn/icons'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'
import { GithubIcon, GmailIcon, SlackIcon } from '@/components/icons'
import type { OAuthServiceMatch } from '@/lib/integrations'
import { captureEvent } from '@/lib/posthog/client'
import { useWorkspaceCredentials } from '@/hooks/queries/credentials'
import { useKnowledgeBasesQuery } from '@/hooks/queries/kb/knowledge'
import { useOAuthConnections } from '@/hooks/queries/oauth/oauth-connections'
import { useTablesList } from '@/hooks/queries/tables'
import type { SuggestedAction, SuggestedActionSignals } from './suggested-actions-types'

const ConnectOAuthModal = dynamic(
  () =>
    import('@/app/workspace/[workspaceId]/components/connect-oauth-modal').then(
      (module) => module.ConnectOAuthModal
    ),
  { ssr: false }
)

const EMPTY_CREDENTIALS: NonNullable<ReturnType<typeof useWorkspaceCredentials>['data']> = []
const EMPTY_SERVICES: NonNullable<ReturnType<typeof useOAuthConnections>['data']> = []

/**
 * Initial actions rendered on first paint, before OAuth/credentials queries
 * resolve. For users with no connections this is also the final result, so the
 * section never flashes. Users with existing connections briefly see this
 * before the personalized recompute replaces it.
 */
const INITIAL_ACTIONS: SuggestedAction[] = [
  {
    kind: 'integration',
    id: 'integrate-slack',
    label: 'Integrate with Slack',
    icon: SlackIcon,
    slug: 'slack',
  },
  {
    kind: 'integration',
    id: 'integrate-gmail',
    label: 'Integrate with Gmail',
    icon: GmailIcon,
    slug: 'gmail',
  },
  {
    kind: 'prompt',
    id: 'table-starter-0',
    label: 'Create a CRM with sample data',
    prompt: 'Create a CRM with sample data.',
    icon: Table,
  },
  {
    kind: 'prompt',
    id: 'github-starter',
    label: 'Link GitHub pull requests to Jira tickets',
    prompt:
      'Build a workflow that monitors GitHub pull requests and automatically transitions linked Jira issues when PRs are opened or merged, keeping your project board accurate without any manual updates.',
    icon: GithubIcon,
  },
]

interface SuggestedActionsProps {
  onSelectPrompt: (prompt: string) => void
}

export function SuggestedActions({ onSelectPrompt }: SuggestedActionsProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const posthog = usePostHog()

  const { data: credentials = EMPTY_CREDENTIALS } = useWorkspaceCredentials({
    workspaceId,
    enabled: Boolean(workspaceId),
  })
  const { data: services = EMPTY_SERVICES } = useOAuthConnections()
  const { data: tables = [] } = useTablesList(workspaceId)
  const { data: knowledgeBases = [] } = useKnowledgeBasesQuery(workspaceId, {
    enabled: Boolean(workspaceId),
  })

  const [expanded, setExpanded] = useState(true)
  /**
   * Collapsible animations are enabled only after the first user toggle, so
   * the initially-open, server-rendered panel appears at full height on first
   * paint instead of replaying the open animation and shifting the input
   * above it.
   */
  const [animationsEnabled, setAnimationsEnabled] = useState(false)
  /** Incremented by the shuffle control to re-roll the weighted sample. */
  const [shuffleNonce, setShuffleNonce] = useState(0)
  const [actions, setActions] = useState<SuggestedAction[]>(INITIAL_ACTIONS)
  /**
   * OAuth connect modal target. Setting this opens the modal; setting it back
   * to `null` (via `onOpenChange(false)`) closes it. Mirrors the local-state
   * pattern used by the integrations detail page.
   */
  const [oauthTarget, setOAuthTarget] = useState<OAuthServiceMatch | null>(null)

  const connectedProviders = useMemo(
    () =>
      new Set(
        credentials
          .filter((c) => c.type === 'oauth' || c.type === 'service_account')
          .map((c) => c.providerId)
          .filter((id): id is string => Boolean(id))
      ),
    [credentials]
  )

  const signals = useMemo<SuggestedActionSignals>(
    () => ({
      connectedProviders,
      hasTables: tables.length > 0,
      hasKnowledgeBases: knowledgeBases.length > 0,
    }),
    [connectedProviders, tables.length, knowledgeBases.length]
  )

  /**
   * Personalized suggestions, re-sampled whenever signals resolve or the user
   * shuffles. Falls back to {@link INITIAL_ACTIONS} until the credential and
   * service queries have loaded (and stays there for users with no
   * connections, unless they shuffle), so first paint never flashes.
   */
  useEffect(() => {
    const personalized = services.length > 0 && connectedProviders.size > 0
    if (!personalized && shuffleNonce === 0) {
      return
    }

    let cancelled = false
    void import('./suggested-actions-catalog').then(({ computeSuggestedActions }) => {
      if (!cancelled) {
        setActions(computeSuggestedActions(services, signals))
      }
    })
    return () => {
      cancelled = true
    }
  }, [connectedProviders, services, signals, shuffleNonce])

  const handleSelect = (action: SuggestedAction, position: number) => {
    captureEvent(posthog, 'suggested_action_clicked', {
      workspace_id: workspaceId,
      kind: action.kind,
      action_id: action.id,
      label: action.label,
      position,
      connected_provider_count: connectedProviders.size,
    })
    if (action.kind === 'prompt') {
      onSelectPrompt(action.prompt)
      return
    }
    void import('./suggested-actions-catalog').then(({ resolveSuggestedActionOAuth }) => {
      const match = resolveSuggestedActionOAuth(action.slug)
      if (match) setOAuthTarget(match)
    })
  }

  const handleShuffle = () => {
    captureEvent(posthog, 'suggested_actions_shuffled', {
      workspace_id: workspaceId,
      connected_provider_count: connectedProviders.size,
    })
    setShuffleNonce((n) => n + 1)
  }

  const handleToggleExpanded = () => {
    captureEvent(posthog, 'suggested_actions_toggled', {
      workspace_id: workspaceId,
      expanded: !expanded,
    })
    setAnimationsEnabled(true)
    setExpanded((prev) => !prev)
  }

  return (
    <div className='mx-auto mt-7 w-full max-w-[48rem]'>
      <div className='flex items-center justify-between'>
        <button
          type='button'
          onClick={handleToggleExpanded}
          aria-expanded={expanded}
          className='flex items-center gap-2'
        >
          <span className='text-[var(--text-muted)] text-small'>Suggested actions</span>
          <ChevronDown
            className={cn(
              'h-[7px] w-[9px] text-[var(--text-icon)] transition-transform duration-150',
              !expanded && '-rotate-90'
            )}
          />
        </button>
        <button
          type='button'
          onClick={handleShuffle}
          aria-label='Shuffle suggested actions'
          aria-hidden={!expanded}
          tabIndex={expanded ? undefined : -1}
          className={cn(
            chipVariants({ flush: true }),
            '-mr-2 gap-1.5 transition-opacity duration-150 ease-out motion-reduce:transition-none',
            expanded ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        >
          <span className='-mt-px text-[var(--text-muted)] text-small'>Shuffle</span>
          <Shuffle className='size-[16px] flex-shrink-0 text-[var(--text-icon)]' />
        </button>
      </div>
      <Expandable expanded={expanded}>
        <ExpandableContent className={cn('mt-2', !animationsEnabled && '!animate-none')}>
          <div className='flex flex-col'>
            {actions.map((action, i) => {
              const Icon = action.icon
              return (
                <button
                  key={action.id}
                  type='button'
                  onClick={() => handleSelect(action, i)}
                  className={cn(
                    'flex items-center gap-2 border-[var(--divider)] px-2 py-2 text-left transition-colors hover-hover:bg-[var(--surface-5)]',
                    i > 0 && 'border-t'
                  )}
                >
                  <Icon
                    className='size-[16px] flex-shrink-0 text-[var(--text-icon)]'
                    style={action.iconStyle}
                  />
                  <span className='flex-1 truncate text-[var(--text-body)] text-sm'>
                    {action.label}
                  </span>
                  <ArrowRight className='size-[16px] shrink-0 text-[var(--text-icon)]' />
                </button>
              )
            })}
          </div>
        </ExpandableContent>
      </Expandable>
      {oauthTarget && workspaceId && (
        <ConnectOAuthModal
          mode='connect'
          origin='integrations'
          open
          onOpenChange={(open) => {
            if (!open) setOAuthTarget(null)
          }}
          workspaceId={workspaceId}
          providerId={oauthTarget.providerId}
          requiredScopes={oauthTarget.requiredScopes}
          serviceName={oauthTarget.serviceName}
          serviceIcon={oauthTarget.serviceIcon}
        />
      )}
    </div>
  )
}
