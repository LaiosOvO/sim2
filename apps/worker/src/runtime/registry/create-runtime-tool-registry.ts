import { EXECUTION_CONTRACTS_VERSION } from '@sim/execution-contracts'
import type {
  RuntimeToolExecutionErrorV1,
  RuntimeToolExecutionResultV1,
} from '@sim/execution-contracts/runtime-tools'
import {
  type RuntimeCredentialResolver,
  type RuntimeProviderLoader,
  type RuntimeProviderModule,
  RuntimeRegistryFailure,
  type RuntimeToolCapability,
  type RuntimeToolDeclaration,
  type RuntimeToolRegistry,
} from './types'

export interface RuntimeToolRegistryOptions {
  declarations: readonly RuntimeToolDeclaration[]
  providerLoaders: Readonly<Partial<Record<string, RuntimeProviderLoader>>>
  credentials: RuntimeCredentialResolver
}

function errorResult(
  code: RuntimeToolExecutionErrorV1['code'],
  message: string,
  requestedToolId: string,
  providerId?: string
): RuntimeToolExecutionResultV1 {
  return {
    contractVersion: EXECUTION_CONTRACTS_VERSION,
    ok: false,
    error: {
      contractVersion: EXECUTION_CONTRACTS_VERSION,
      code,
      message,
      requestedToolId,
      providerId,
    },
  }
}

function indexDeclarations(
  declarations: readonly RuntimeToolDeclaration[]
): ReadonlyMap<string, RuntimeToolDeclaration> {
  const indexed = new Map<string, RuntimeToolDeclaration>()
  for (const declaration of declarations) {
    for (const id of [declaration.toolId, ...declaration.aliases]) {
      if (indexed.has(id)) {
        throw new Error(`Duplicate runtime tool ID or alias: ${id}`)
      }
      indexed.set(id, declaration)
    }
  }
  return indexed
}

function validateProvider(
  declaration: RuntimeToolDeclaration,
  provider: RuntimeProviderModule
): void {
  if (provider.providerId !== declaration.providerId) {
    throw new RuntimeRegistryFailure(
      'RUNTIME_PROVIDER_EXPORT_INVALID',
      `Provider ${declaration.providerId} loaded module ${provider.providerId}`
    )
  }
  const exportedIds = new Set(provider.tools.map((tool) => tool.id))
  if (!exportedIds.has(declaration.toolId)) {
    throw new RuntimeRegistryFailure(
      'RUNTIME_PROVIDER_EXPORT_INVALID',
      `Provider ${provider.providerId} does not export ${declaration.toolId}`
    )
  }
  if (exportedIds.size !== provider.tools.length) {
    throw new RuntimeRegistryFailure(
      'RUNTIME_PROVIDER_EXPORT_INVALID',
      `Provider ${provider.providerId} exports duplicate tool IDs`
    )
  }
}

export function createRuntimeToolRegistry(
  options: RuntimeToolRegistryOptions
): RuntimeToolRegistry {
  const declarations = indexDeclarations(options.declarations)
  const providerPromises = new Map<string, Promise<RuntimeProviderModule>>()

  async function loadProvider(declaration: RuntimeToolDeclaration): Promise<RuntimeProviderModule> {
    const existing = providerPromises.get(declaration.providerId)
    if (existing) return existing

    const loader = options.providerLoaders[declaration.providerId]
    if (!loader) {
      throw new RuntimeRegistryFailure(
        'RUNTIME_PROVIDER_NOT_FOUND',
        `No runtime loader is registered for provider ${declaration.providerId}`
      )
    }

    const loading = loader().then((provider) => {
      validateProvider(declaration, provider)
      return provider
    })
    providerPromises.set(declaration.providerId, loading)
    try {
      return await loading
    } catch (error) {
      providerPromises.delete(declaration.providerId)
      throw error
    }
  }

  function capability(toolId: string): RuntimeToolCapability | undefined {
    const declaration = declarations.get(toolId)
    if (!declaration) return undefined
    return {
      requestedToolId: toolId,
      toolId: declaration.toolId,
      providerId: declaration.providerId,
    }
  }

  return {
    capability,
    async execute(request) {
      const declaration = declarations.get(request.toolId)
      if (!declaration) {
        return errorResult(
          'RUNTIME_TOOL_NOT_FOUND',
          `Runtime tool ${request.toolId} is not registered`,
          request.toolId
        )
      }

      try {
        const provider = await loadProvider(declaration)
        const tool = provider.tools.find((candidate) => candidate.id === declaration.toolId)
        if (!tool) {
          return errorResult(
            'RUNTIME_PROVIDER_EXPORT_INVALID',
            `Provider ${provider.providerId} does not export ${declaration.toolId}`,
            request.toolId,
            declaration.providerId
          )
        }
        const output = await tool.execute(request.params, {
          ...request.context,
          credentials: options.credentials,
        })
        return {
          contractVersion: EXECUTION_CONTRACTS_VERSION,
          ok: true,
          requestedToolId: request.toolId,
          toolId: declaration.toolId,
          providerId: declaration.providerId,
          output,
        }
      } catch (error) {
        if (error instanceof RuntimeRegistryFailure) {
          return errorResult(error.code, error.message, request.toolId, declaration.providerId)
        }
        return errorResult(
          'RUNTIME_PROVIDER_EXECUTION_FAILED',
          error instanceof Error ? error.message : 'Runtime provider execution failed',
          request.toolId,
          declaration.providerId
        )
      }
    },
    loadedProviderIds() {
      return [...providerPromises.keys()].sort()
    },
  }
}
