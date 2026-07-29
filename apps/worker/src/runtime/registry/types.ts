import type {
  RuntimeToolErrorCodeV1,
  RuntimeToolExecutionResultV1,
} from '@sim/execution-contracts/runtime-tools'

export interface RuntimeToolDeclaration {
  providerId: string
  toolId: string
  aliases: readonly string[]
}

export interface RuntimeCredentialRequest {
  providerId: string
  workspaceId: string
  credentialRef?: string
}

export interface RuntimeCredential {
  type: 'bearer'
  token: string
}

export interface RuntimeCredentialResolver {
  resolve(request: RuntimeCredentialRequest): Promise<RuntimeCredential>
}

export interface RuntimeToolContext {
  jobId: string
  executionId: string
  workspaceId: string
  workflowId: string
  credentialRef?: string
  credentials: RuntimeCredentialResolver
  signal?: AbortSignal
}

export interface RuntimeToolAdapter {
  id: string
  version: string
  execute(
    params: Readonly<Record<string, unknown>>,
    context: RuntimeToolContext
  ): Promise<Record<string, unknown>>
}

export interface RuntimeProviderModule {
  providerId: string
  buildMarker: string
  tools: readonly RuntimeToolAdapter[]
}

export type RuntimeProviderLoader = () => Promise<RuntimeProviderModule>

export interface RuntimeToolExecutionRequest {
  toolId: string
  params: Readonly<Record<string, unknown>>
  context: Omit<RuntimeToolContext, 'credentials'>
}

export interface RuntimeToolCapability {
  requestedToolId: string
  toolId: string
  providerId: string
}

export interface RuntimeToolRegistry {
  capability(toolId: string): RuntimeToolCapability | undefined
  execute(request: RuntimeToolExecutionRequest): Promise<RuntimeToolExecutionResultV1>
  loadedProviderIds(): readonly string[]
}

export class RuntimeRegistryFailure extends Error {
  readonly code: RuntimeToolErrorCodeV1

  constructor(code: RuntimeToolErrorCodeV1, message: string) {
    super(message)
    this.name = 'RuntimeRegistryFailure'
    this.code = code
  }
}
