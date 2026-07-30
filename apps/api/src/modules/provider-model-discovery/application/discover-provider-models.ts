import {
  type OpenRouterModelInfoV1,
  type ProviderModelDiscoveryProviderV1,
  type ProviderModelsResponseV1,
  providerModelDiscoveryQueryV1Schema,
  providerModelsResponseV1Schema,
} from '@sim/api-contracts/provider-model-discovery'
import { z } from 'zod'
import type { BaseProviderModelCatalog } from '@/modules/provider-model-discovery/ports/base-provider-model-catalog'
import type {
  ProviderModelCredentialReader,
  WorkspaceCredentialProvider,
} from '@/modules/provider-model-discovery/ports/provider-model-credential-reader'
import type { ProviderModelSource } from '@/modules/provider-model-discovery/ports/provider-model-source'

const openRouterUpstreamSchema = z.object({
  data: z
    .array(
      z
        .object({
          id: z.string(),
          context_length: z.number().optional(),
          supported_parameters: z.array(z.string()).optional(),
          pricing: z
            .object({
              prompt: z.string().optional(),
              completion: z.string().optional(),
            })
            .passthrough()
            .optional(),
        })
        .passthrough()
    )
    .default([]),
})

const openAiModelsUpstreamSchema = z.object({
  data: z.array(z.object({ id: z.string() }).passthrough()).default([]),
})

const ollamaUpstreamSchema = z.object({
  models: z.array(z.object({ name: z.string() }).passthrough()).default([]),
})

const togetherUpstreamSchema = z.array(
  z
    .object({
      id: z.string(),
      type: z.string().optional(),
    })
    .passthrough()
)

const nonChatTogetherTypes = new Set([
  'image',
  'video',
  'audio',
  'transcribe',
  'embedding',
  'moderation',
  'rerank',
])

const workspaceCredentialProviders = new Set<ProviderModelDiscoveryProviderV1>([
  'baseten',
  'fireworks',
  'ollama-cloud',
  'together',
])

export interface ProviderModelDiscoveryRuntimeConfig {
  readonly basetenApiKey?: string
  readonly blacklistedModels?: string
  readonly blacklistedProviders?: string
  readonly fireworksApiKey?: string
  readonly litellmApiKey?: string
  readonly togetherApiKey?: string
  readonly vllmApiKey?: string
}

export type DiscoverProviderModelsResult =
  | {
      readonly body: ProviderModelsResponseV1
      readonly ok: true
      readonly status: 200
    }
  | {
      readonly body: { readonly details: readonly unknown[]; readonly error: 'Validation error' }
      readonly ok: false
      readonly status: 400
    }
  | {
      readonly body: { readonly error: 'Failed to fetch models'; readonly models: readonly [] }
      readonly ok: false
      readonly status: 500
    }

export interface DiscoverProviderModelsUseCase {
  execute(input: {
    readonly provider: ProviderModelDiscoveryProviderV1
    readonly rawWorkspaceId?: string
    readonly resolveSessionActorId: () => Promise<string | undefined>
    readonly signal?: AbortSignal
  }): Promise<DiscoverProviderModelsResult>
}

export interface DiscoverProviderModelsDependencies {
  readonly baseCatalog: BaseProviderModelCatalog
  readonly credentials?: ProviderModelCredentialReader
  readonly runtime: ProviderModelDiscoveryRuntimeConfig
  readonly source: ProviderModelSource
}

interface ModelBlacklist {
  readonly exact: ReadonlySet<string>
  readonly prefixes: readonly string[]
}

function commaList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

function modelBlacklist(value: string | undefined): ModelBlacklist {
  const entries = commaList(value)
  return {
    exact: new Set(entries.filter((entry) => !entry.endsWith('*'))),
    prefixes: entries.filter((entry) => entry.endsWith('*')).map((entry) => entry.slice(0, -1)),
  }
}

function isModelBlocked(model: string, blacklist: ModelBlacklist): boolean {
  const normalized = model.toLowerCase()
  return (
    blacklist.exact.has(normalized) ||
    blacklist.prefixes.some((prefix) => normalized.startsWith(prefix))
  )
}

function filterModels(models: readonly string[], blacklist: ModelBlacklist): string[] {
  return models.filter((model) => !isModelBlocked(model, blacklist))
}

function unique(models: readonly string[]): string[] {
  return [...new Set(models)]
}

function emptyResponse(provider: ProviderModelDiscoveryProviderV1): ProviderModelsResponseV1 {
  return provider === 'openrouter' ? { modelInfo: {}, models: [] } : { models: [] }
}

function environmentKey(
  provider: ProviderModelDiscoveryProviderV1,
  runtime: ProviderModelDiscoveryRuntimeConfig
): string | undefined {
  if (provider === 'baseten') return runtime.basetenApiKey
  if (provider === 'fireworks') return runtime.fireworksApiKey
  if (provider === 'together') return runtime.togetherApiKey
  if (provider === 'litellm') return runtime.litellmApiKey
  if (provider === 'vllm') return runtime.vllmApiKey
  return undefined
}

function projectOpenRouter(raw: unknown, blacklist: ModelBlacklist): ProviderModelsResponseV1 {
  const data = openRouterUpstreamSchema.parse(raw)
  const allModels: string[] = []
  const modelInfo: Record<string, OpenRouterModelInfoV1> = {}

  for (const model of data.data) {
    const id = `openrouter/${model.id}`
    allModels.push(id)
    const supported = model.supported_parameters ?? []
    modelInfo[id] = {
      id,
      contextLength: model.context_length,
      supportsStructuredOutputs: supported.includes('structured_outputs'),
      supportsTools: supported.includes('tools'),
      pricing: model.pricing
        ? {
            input: Number.parseFloat(model.pricing.prompt ?? '0') * 1_000_000,
            output: Number.parseFloat(model.pricing.completion ?? '0') * 1_000_000,
          }
        : undefined,
    }
  }
  return providerModelsResponseV1Schema.parse({
    models: filterModels(unique(allModels), blacklist),
    modelInfo,
  })
}

function projectRemote(
  provider: Exclude<ProviderModelDiscoveryProviderV1, 'base' | 'openrouter'>,
  raw: unknown,
  blacklist: ModelBlacklist
): ProviderModelsResponseV1 {
  if (provider === 'ollama' || provider === 'ollama-cloud') {
    const models = ollamaUpstreamSchema
      .parse(raw)
      .models.map((model) =>
        provider === 'ollama-cloud' ? `ollama-cloud/${model.name}` : model.name
      )
    return providerModelsResponseV1Schema.parse({
      models: filterModels(provider === 'ollama-cloud' ? unique(models) : models, blacklist),
    })
  }
  if (provider === 'together') {
    const models = togetherUpstreamSchema
      .parse(raw)
      .filter((model) => !model.type || !nonChatTogetherTypes.has(model.type))
      .map((model) => `together/${model.id}`)
    return providerModelsResponseV1Schema.parse({
      models: filterModels(unique(models), blacklist),
    })
  }

  const prefix = `${provider}/`
  const models = openAiModelsUpstreamSchema.parse(raw).data.map((model) => `${prefix}${model.id}`)
  const shouldDedupe = provider === 'baseten' || provider === 'fireworks'
  return providerModelsResponseV1Schema.parse({
    models: filterModels(shouldDedupe ? unique(models) : models, blacklist),
  })
}

export function createDiscoverProviderModelsUseCase(
  dependencies: DiscoverProviderModelsDependencies
): DiscoverProviderModelsUseCase {
  const blockedProviders = new Set(commaList(dependencies.runtime.blacklistedProviders))
  const blockedModels = modelBlacklist(dependencies.runtime.blacklistedModels)

  return {
    async execute(input) {
      if (blockedProviders.has(input.provider.toLowerCase())) {
        return { body: emptyResponse(input.provider), ok: true, status: 200 }
      }

      let workspaceId: string | undefined
      if (workspaceCredentialProviders.has(input.provider)) {
        const parsed = providerModelDiscoveryQueryV1Schema.safeParse({
          ...(input.rawWorkspaceId !== undefined ? { workspaceId: input.rawWorkspaceId } : {}),
        })
        if (!parsed.success) {
          return {
            body: { details: parsed.error.issues, error: 'Validation error' },
            ok: false,
            status: 400,
          }
        }
        workspaceId = parsed.data.workspaceId
      }

      if (input.provider === 'base') {
        try {
          const entries = await dependencies.baseCatalog.list()
          const ownersByModel = new Map<string, string>()
          for (const entry of entries) {
            ownersByModel.set(entry.id.toLowerCase(), entry.provider.toLowerCase())
          }
          const models = [...ownersByModel]
            .filter(([, owner]) => !blockedProviders.has(owner))
            .map(([model]) => model)
          return {
            body: providerModelsResponseV1Schema.parse({
              models: filterModels(models, blockedModels),
            }),
            ok: true,
            status: 200,
          }
        } catch {
          return {
            body: { error: 'Failed to fetch models', models: [] },
            ok: false,
            status: 500,
          }
        }
      }

      let apiKey: string | undefined
      if (workspaceId && workspaceCredentialProviders.has(input.provider)) {
        const actorId = await input.resolveSessionActorId()
        if (actorId && dependencies.credentials) {
          apiKey =
            (await dependencies.credentials.readAuthorized({
              actorId,
              provider: input.provider as WorkspaceCredentialProvider,
              workspaceId,
            })) ?? undefined
        }
      }
      apiKey ??= environmentKey(input.provider, dependencies.runtime)

      if (
        ['baseten', 'fireworks', 'ollama-cloud', 'together'].includes(input.provider) &&
        !apiKey
      ) {
        return { body: emptyResponse(input.provider), ok: true, status: 200 }
      }

      const raw = await dependencies.source.read({
        ...(apiKey ? { apiKey } : {}),
        provider: input.provider,
        ...(input.signal ? { signal: input.signal } : {}),
      })
      if (raw === null) return { body: emptyResponse(input.provider), ok: true, status: 200 }

      try {
        const body =
          input.provider === 'openrouter'
            ? projectOpenRouter(raw, blockedModels)
            : projectRemote(input.provider, raw, blockedModels)
        return { body, ok: true, status: 200 }
      } catch {
        return { body: emptyResponse(input.provider), ok: true, status: 200 }
      }
    },
  }
}
