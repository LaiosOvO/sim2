export const POLARIS_EXTENSION_API_VERSION = 1 as const

export type ExtensionKind = 'biz' | 'infra'

export interface ExtensionDescriptor {
  apiVersion: typeof POLARIS_EXTENSION_API_VERSION
  id: string
  kind: ExtensionKind
  capabilities: readonly string[]
}

export interface ExtensionHealth {
  status: 'ready' | 'degraded' | 'unavailable'
  checkedAt: string
  reason?: string
}

/**
 * The SDK intentionally contains no provider DTOs or business aggregates.
 * Extensions expose capabilities through ports owned by the calling module.
 */
export interface ExtensionLifecycle {
  descriptor(): ExtensionDescriptor
  health(): Promise<ExtensionHealth>
  start(): Promise<void>
  stop(): Promise<void>
}
