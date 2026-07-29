import type { NativeTenantReadHandler } from '@/modules/tenant-read/application/ports'

const FALLBACK_STAR_COUNT = 28_900
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000

export interface GitHubStarsHandlerOptions {
  fetcher?: typeof fetch
  token?: string
  now?: () => number
  cacheTtlMs?: number
}

interface GitHubStarsCache {
  value: string
  expiresAt: number
}

export function formatStarCount(value: number): string {
  if (value < 1000) return String(value)
  const formatted = (Math.round(value / 100) / 10).toFixed(1)
  return formatted.endsWith('.0') ? `${formatted.slice(0, -2)}k` : `${formatted}k`
}

function invalidQueryResponse(url: URL): Response | undefined {
  const keys = [...new Set(url.searchParams.keys())]
  if (keys.length === 0) return undefined
  const message =
    keys.length === 1
      ? `Unrecognized key: "${keys[0]}"`
      : `Unrecognized keys: ${keys.map((key) => `"${key}"`).join(', ')}`
  return Response.json(
    {
      error: 'Validation error',
      details: [{ code: 'unrecognized_keys', keys, path: [], message }],
    },
    { status: 400 }
  )
}

/**
 * Native standalone-API implementation of the public stars route. The cache
 * is process-local; failures preserve the legacy non-throwing fallback.
 */
export function createGitHubStarsHandler(
  options: GitHubStarsHandlerOptions = {}
): NativeTenantReadHandler {
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? Date.now
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  let cache: GitHubStarsCache | undefined

  return async ({ request }) => {
    const invalidQuery = invalidQueryResponse(new URL(request.url))
    if (invalidQuery) return invalidQuery
    const currentTime = now()
    if (cache && cache.expiresAt > currentTime) {
      return Response.json({ stars: cache.value })
    }

    let value = formatStarCount(FALLBACK_STAR_COUNT)
    try {
      const response = await fetcher('https://api.github.com/repos/simstudioai/sim', {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Sim/1.0',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
      })
      if (response.ok) {
        const data = (await response.json()) as { stargazers_count?: unknown }
        const count =
          data.stargazers_count === null || data.stargazers_count === undefined
            ? Number.NaN
            : Number(data.stargazers_count)
        if (Number.isFinite(count) && count >= 0) value = formatStarCount(count)
      }
    } catch {
      value = formatStarCount(FALLBACK_STAR_COUNT)
    }
    cache = { value, expiresAt: currentTime + cacheTtlMs }
    return Response.json({ stars: value })
  }
}
