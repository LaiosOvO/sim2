import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import type {
  ProviderModelSource,
  RemoteProviderModelSource,
} from '@/modules/provider-model-discovery/ports/provider-model-source'

const logger = createLogger('ProviderModelSource')

const fixedEndpoints: Partial<Record<RemoteProviderModelSource, string>> = {
  baseten: 'https://inference.baseten.co/v1/models',
  fireworks: 'https://api.fireworks.ai/inference/v1/models',
  'ollama-cloud': 'https://ollama.com/api/tags',
  openrouter: 'https://openrouter.ai/api/v1/models',
  together: 'https://api.together.ai/v1/models',
}

const cacheTtlMs: Record<RemoteProviderModelSource, number> = {
  baseten: 0,
  fireworks: 0,
  litellm: 60_000,
  'ollama-cloud': 0,
  ollama: 60_000,
  openrouter: 300_000,
  together: 0,
  vllm: 60_000,
}

export interface HttpProviderModelSourceOptions {
  readonly endpointOverrides?: Partial<Record<RemoteProviderModelSource, string>>
  readonly fetcher?: typeof fetch
  readonly litellmBaseUrl?: string
  readonly maxResponseBytes?: number
  readonly now?: () => number
  readonly ollamaBaseUrl?: string
  readonly timeoutMs?: number
  readonly vllmBaseUrl?: string
}

interface CacheEntry {
  readonly expiresAt: number
  readonly value: unknown
}

function validatedUrl(value: string | undefined, label: string): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  const url = new URL(trimmed)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must use http or https`)
  }
  return url.toString().replace(/\/$/, '')
}

function endpoint(
  provider: RemoteProviderModelSource,
  options: HttpProviderModelSourceOptions
): string | undefined {
  const override = options.endpointOverrides?.[provider]
  if (override) return validatedUrl(override, `${provider} endpoint`)
  if (fixedEndpoints[provider]) return fixedEndpoints[provider]
  if (provider === 'ollama') {
    const base = validatedUrl(options.ollamaBaseUrl ?? 'http://localhost:11434', 'OLLAMA_URL')
    return base ? `${base}/api/tags` : undefined
  }
  if (provider === 'litellm') {
    const base = validatedUrl(options.litellmBaseUrl, 'LITELLM_BASE_URL')
    return base ? `${base}/v1/models` : undefined
  }
  const base = validatedUrl(options.vllmBaseUrl, 'VLLM_BASE_URL')
  return base ? `${base}/v1/models` : undefined
}

async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel()
    throw new Error('Provider model response exceeds configured byte limit')
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Provider model response has no body')
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    size += chunk.value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new Error('Provider model response exceeds configured byte limit')
    }
    text += decoder.decode(chunk.value, { stream: true })
  }
  text += decoder.decode()
  return JSON.parse(text) as unknown
}

export function createHttpProviderModelSource(
  options: HttpProviderModelSourceOptions = {}
): ProviderModelSource {
  const fetcher = options.fetcher ?? fetch
  const requestedTimeout = options.timeoutMs ?? 5_000
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(Math.max(requestedTimeout, 100), 30_000)
    : 5_000
  const requestedMaxBytes = options.maxResponseBytes ?? 2 * 1024 * 1024
  const maxResponseBytes = Math.min(
    Math.max(Number.isFinite(requestedMaxBytes) ? requestedMaxBytes : 2 * 1024 * 1024, 1_024),
    16 * 1024 * 1024
  )
  const now = options.now ?? Date.now
  const cache = new Map<string, CacheEntry>()

  return {
    async read(input) {
      try {
        const url = endpoint(input.provider, options)
        if (!url) return null
        const ttl = cacheTtlMs[input.provider]
        const cached = ttl > 0 ? cache.get(`${input.provider}:${url}`) : undefined
        if (cached && cached.expiresAt > now()) return cached.value

        const timeoutSignal = AbortSignal.timeout(timeoutMs)
        const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal
        const response = await fetcher(url, {
          cache: 'no-store',
          headers: {
            ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
            'Content-Type': 'application/json',
          },
          redirect: 'error',
          signal,
        })
        if (!response.ok) {
          logger.warn('Provider model upstream returned a non-success status', {
            provider: input.provider,
            status: response.status,
          })
          return null
        }
        const value = await boundedJson(response, maxResponseBytes)
        if (ttl > 0) {
          cache.set(`${input.provider}:${url}`, {
            expiresAt: now() + ttl,
            value,
          })
        }
        return value
      } catch (error) {
        logger.warn('Provider model upstream request failed', {
          error: getErrorMessage(error, 'Unknown provider model source failure'),
          provider: input.provider,
        })
        return null
      }
    },
  }
}
