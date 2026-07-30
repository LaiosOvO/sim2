export type W4ToolRouteDescriptor = {
  readonly auth: string
  readonly batch: string
  readonly dependencies: readonly string[]
  readonly donorParity: string
  readonly inventoryId: string
  readonly legacyHandlerSource: string
  readonly methods: readonly string[]
  readonly pathTemplate: string
  readonly provider: string
  readonly requiredTests: readonly string[]
  readonly rolloutKey: string
  readonly runtimeToolIds: readonly string[]
}

export type ToolAdapterPrincipal = {
  readonly actorId?: string
  readonly kind: 'internal' | 'user'
  readonly workspaceId?: string
}

export type ToolRouteAccessDecision =
  | {
      readonly allowed: true
      readonly principal: ToolAdapterPrincipal
      readonly upstreamAuthHeaders?: Readonly<Record<string, string>>
    }
  | {
      readonly allowed: false
      readonly response: Response
    }

export type ToolAdapterInvocation = {
  readonly body: Uint8Array | null
  readonly headers: Readonly<Record<string, string>>
  readonly method: string
  readonly path: string
  readonly principal: ToolAdapterPrincipal
  readonly query: string
  readonly route: W4ToolRouteDescriptor
  readonly upstreamAuthHeaders: Readonly<Record<string, string>>
}

export type ToolAdapterResult = {
  readonly body?: BodyInit | null
  readonly headers?: Readonly<Record<string, string>>
  readonly status: number
}

export interface ToolRouteAccess {
  authorize(request: Request, route: W4ToolRouteDescriptor): Promise<ToolRouteAccessDecision>
}

export interface ToolRouteRollout {
  isNativeEnabled(route: W4ToolRouteDescriptor): Promise<boolean>
}

export interface ProviderToolRouteAdapter {
  invoke(invocation: ToolAdapterInvocation): Promise<ToolAdapterResult>
}

export interface ProviderToolRouteAdapterRegistry {
  resolve(provider: string): ProviderToolRouteAdapter | undefined
}
