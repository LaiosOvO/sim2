import { Table } from '@sim/emcn/icons'
import { randomFloat } from '@sim/utils/random'
import { stripVersionSuffix } from '@sim/utils/string'
import {
  getAllBlockMeta,
  INTEGRATIONS,
  resolveOAuthServiceForIntegration,
  resolveOAuthServiceForSlug,
} from '@/lib/integrations'
import { getBareIconStyle } from '@/blocks/icon-color'
import type { ModuleTag } from '@/blocks/types'
import type {
  SuggestedAction,
  SuggestedActionIcon,
  SuggestedActionService,
  SuggestedActionSignals,
} from './suggested-actions-types'

/** Lookup integration slug by OAuth service display name (case-insensitive). */
const SLUG_BY_LOWER_NAME: ReadonlyMap<string, string> = new Map(
  INTEGRATIONS.map((integration) => [integration.name.toLowerCase(), integration.slug])
)

/** Lookup base block type by catalog slug, for the connect-row popularity weight. */
const TYPE_BY_SLUG: ReadonlyMap<string, string> = new Map(
  INTEGRATIONS.map((integration) => [integration.slug, stripVersionSuffix(integration.type)])
)

interface Candidate {
  id: string
  blockType: string
  label: string
  prompt: string
  icon: SuggestedActionIcon
  modules: readonly ModuleTag[]
  featured: boolean
  popular: boolean
  providerId: string | null
}

const TABLE_STARTERS: readonly Candidate[] = [
  { label: 'Create a CRM with sample data', prompt: 'Create a CRM with sample data.' },
  { label: 'Build a project tracker', prompt: 'Build a project tracker table.' },
  { label: 'Create a content calendar', prompt: 'Create a content calendar table.' },
  { label: 'Build an expense tracker', prompt: 'Build an expense tracker table.' },
  { label: 'Create a bug tracker', prompt: 'Create a bug tracker table.' },
].map(({ label, prompt }, index) => ({
  id: `table-starter-${index}`,
  blockType: `table-starter-${index}`,
  label,
  prompt,
  icon: Table,
  modules: ['tables'] as const,
  featured: false,
  popular: true,
  providerId: null,
}))

/**
 * Full template-backed pool. This module is imported only after the lightweight
 * home shell becomes usable or when the user explicitly shuffles suggestions.
 */
const CANDIDATES: readonly Candidate[] = (() => {
  const integrationByType = new Map(
    INTEGRATIONS.flatMap((integration) => [
      [integration.type, integration] as const,
      [stripVersionSuffix(integration.type), integration] as const,
    ])
  )
  const candidates: Candidate[] = [...TABLE_STARTERS]
  for (const [blockType, meta] of Object.entries(getAllBlockMeta())) {
    const integration = integrationByType.get(blockType)
    if (!integration) continue
    const providerId = resolveOAuthServiceForIntegration(integration)?.providerId ?? null
    for (const [index, template] of (meta.templates ?? []).entries()) {
      candidates.push({
        id: `${blockType}-${index}`,
        blockType,
        label: template.title,
        prompt: template.prompt,
        icon: template.icon as SuggestedActionIcon,
        modules: template.modules,
        featured: template.featured ?? false,
        popular: template.category === 'popular',
        providerId,
      })
    }
  }
  return candidates
})()

const TEMPLATE_COUNT_BY_TYPE: ReadonlyMap<string, number> = (() => {
  const counts = new Map<string, number>()
  for (const candidate of CANDIDATES) {
    if (candidate.providerId) {
      counts.set(candidate.blockType, (counts.get(candidate.blockType) ?? 0) + 1)
    }
  }
  return counts
})()

function scoreCandidate(candidate: Candidate, signals: SuggestedActionSignals): number {
  let weight = 1
  if (candidate.featured) weight *= 3
  if (candidate.popular) weight *= 1.5
  if (candidate.providerId) {
    weight *= signals.connectedProviders.has(candidate.providerId) ? 4 : 0.4
  }
  if (candidate.modules.includes('tables') && !signals.hasTables) weight *= 1.5
  if (candidate.modules.includes('knowledge-base') && signals.hasKnowledgeBases) weight *= 0.6
  return weight
}

function weightedSample<T>(pool: readonly T[], count: number, weightOf: (item: T) => number): T[] {
  const remaining = pool.map((item) => ({ item, weight: Math.max(weightOf(item), 0) }))
  const selected: T[] = []
  while (selected.length < count && remaining.length > 0) {
    const total = remaining.reduce((sum, entry) => sum + entry.weight, 0)
    if (total <= 0) break
    let roll = randomFloat() * total
    const index = remaining.findIndex((entry) => {
      roll -= entry.weight
      return roll <= 0
    })
    const [picked] = remaining.splice(index === -1 ? remaining.length - 1 : index, 1)
    selected.push(picked.item)
  }
  return selected
}

function toPromptAction(candidate: Candidate): SuggestedAction {
  return {
    kind: 'prompt',
    id: candidate.id,
    label: candidate.label,
    prompt: candidate.prompt,
    icon: candidate.icon,
    iconStyle: getBareIconStyle(candidate.icon),
  }
}

function toIntegrationAction(service: SuggestedActionService, slug: string): SuggestedAction {
  return {
    kind: 'integration',
    id: `integrate-${service.providerId}`,
    label: `Integrate with ${service.name}`,
    icon: service.icon,
    iconStyle: getBareIconStyle(service.icon),
    slug,
  }
}

/** Builds a fresh, weighted set of four personalized suggested actions. */
export function computeSuggestedActions(
  services: readonly SuggestedActionService[],
  signals: SuggestedActionSignals
): SuggestedAction[] {
  const connectCandidates = services.flatMap((service) => {
    if (signals.connectedProviders.has(service.providerId)) return []
    const slug = SLUG_BY_LOWER_NAME.get(service.name.toLowerCase())
    return slug ? [{ service, slug }] : []
  })
  const connectCount = signals.connectedProviders.size === 0 ? 2 : 1
  const integrations = weightedSample(
    connectCandidates,
    connectCount,
    ({ slug }) => (TEMPLATE_COUNT_BY_TYPE.get(TYPE_BY_SLUG.get(slug) ?? '') ?? 0) + 1
  ).map(({ service, slug }) => toIntegrationAction(service, slug))

  const scored = CANDIDATES.map((candidate) => ({
    candidate,
    weight: scoreCandidate(candidate, signals),
  })).filter((entry) => entry.weight > 0)
  const prompts: SuggestedAction[] = []
  const usedBlockTypes = new Set<string>()
  while (prompts.length < 4 - integrations.length) {
    const available = scored.filter((entry) => !usedBlockTypes.has(entry.candidate.blockType))
    const [pick] = weightedSample(available, 1, (entry) => entry.weight)
    if (!pick) break
    usedBlockTypes.add(pick.candidate.blockType)
    prompts.push(toPromptAction(pick.candidate))
  }

  return [...integrations, ...prompts]
}

/** Resolves an integration action only after it is selected. */
export const resolveSuggestedActionOAuth = resolveOAuthServiceForSlug
