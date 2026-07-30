import type { ComponentType, CSSProperties } from 'react'

/** Icon shape shared by the lightweight shell and lazy suggestion catalog. */
export type SuggestedActionIcon = ComponentType<{
  className?: string
  style?: CSSProperties
}>

/** A prompt or integration action rendered on the workspace home screen. */
export type SuggestedAction =
  | {
      kind: 'prompt'
      id: string
      label: string
      prompt: string
      icon: SuggestedActionIcon
      iconStyle?: CSSProperties
    }
  | {
      kind: 'integration'
      id: string
      label: string
      icon: SuggestedActionIcon
      iconStyle?: CSSProperties
      slug: string
    }

/** Minimal OAuth service projection needed to personalize suggestions. */
export interface SuggestedActionService {
  providerId: string
  name: string
  icon: SuggestedActionIcon
}

/** Workspace signals used to weight the lazy suggestion catalog. */
export interface SuggestedActionSignals {
  connectedProviders: ReadonlySet<string>
  hasTables: boolean
  hasKnowledgeBases: boolean
}
