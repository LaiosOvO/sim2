export interface AppConfigProfileIdentifiers {
  application: string
  environment: string
  profile: string
}

export interface AppConfigGateRule {
  enabled?: boolean
  orgIds?: string[]
  userIds?: string[]
  adminEnabled?: boolean
}

export interface AppConfigGateContext {
  userId?: string | null
  orgId?: string | null
  isAdmin?: boolean
}

export interface AppConfigProfileReader {
  read<T>(identifiers: AppConfigProfileIdentifiers, parse: (json: unknown) => T): Promise<T | null>
}

export interface AppConfigLogger {
  error(message: string, fields: Readonly<Record<string, unknown>>): void
}

export interface AppConfigTransportResponse {
  configuration?: Uint8Array
  nextToken?: string
  nextPollIntervalSeconds?: number
}

export interface AppConfigTransport {
  startSession(identifiers: AppConfigProfileIdentifiers): Promise<string | undefined>
  getLatest(token: string): Promise<AppConfigTransportResponse>
}

interface CacheEntry<T> {
  value: T | null
  loaded: boolean
  nextToken: string | undefined
  expiresAt: number
  inflight: Promise<T | null> | null
}

export interface CachedAppConfigProfileReaderOptions {
  transport: AppConfigTransport
  logger: AppConfigLogger
  ttlMs?: number
  now?: () => number
}

export interface AwsAppConfigProfileReaderOptions {
  region?: string
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
  }
  logger: AppConfigLogger
  ttlMs?: number
  now?: () => number
}

function normalizeIds(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return undefined
  const ids = Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)))
  return ids.length > 0 ? ids : undefined
}

export function normalizeAppConfigGateRule(value: unknown): AppConfigGateRule | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const rule: AppConfigGateRule = {}
  if (typeof source.enabled === 'boolean') rule.enabled = source.enabled
  if (typeof source.adminEnabled === 'boolean') rule.adminEnabled = source.adminEnabled
  const orgIds = normalizeIds(source.orgIds)
  const userIds = normalizeIds(source.userIds)
  if (orgIds) rule.orgIds = orgIds
  if (userIds) rule.userIds = userIds
  return rule
}

export function parseAppConfigGateDocument(json: unknown): Record<string, AppConfigGateRule> {
  const source = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const rules: Record<string, AppConfigGateRule> = {}
  for (const [name, value] of Object.entries(source)) {
    const rule = normalizeAppConfigGateRule(value)
    if (rule) rules[name] = rule
  }
  return rules
}

export function matchesAppConfigGateRule(
  rule: AppConfigGateRule | undefined,
  context: AppConfigGateContext,
  isAdmin = false
): boolean {
  if (!rule) return false
  if (rule.enabled) return true
  if (context.userId && rule.userIds?.includes(context.userId)) return true
  if (context.orgId && rule.orgIds?.includes(context.orgId)) return true
  return Boolean(rule.adminEnabled && isAdmin)
}

function profileKey(identifiers: AppConfigProfileIdentifiers): string {
  return `${identifiers.application}/${identifiers.environment}/${identifiers.profile}`
}

export function createCachedAppConfigProfileReader(
  options: CachedAppConfigProfileReaderOptions
): AppConfigProfileReader {
  const ttlMs = options.ttlMs ?? 30_000
  const now = options.now ?? Date.now
  const cache = new Map<string, CacheEntry<unknown>>()

  async function poll<T>(
    identifiers: AppConfigProfileIdentifiers,
    parse: (json: unknown) => T,
    entry: CacheEntry<T>
  ): Promise<T | null> {
    let response: AppConfigTransportResponse
    try {
      if (!entry.nextToken) {
        entry.nextToken = await options.transport.startSession(identifiers)
      }
      if (!entry.nextToken) throw new Error('AppConfig did not return a session token')
      response = await options.transport.getLatest(entry.nextToken)
      entry.nextToken = response.nextToken ?? entry.nextToken
    } catch (error) {
      entry.nextToken = undefined
      entry.expiresAt = now() + ttlMs
      entry.loaded = true
      options.logger.error('AppConfig fetch failed; serving last known value', {
        profile: profileKey(identifiers),
        error: error instanceof Error ? error.message : String(error),
      })
      return entry.value
    }

    try {
      if (response.configuration && response.configuration.length > 0) {
        const text = new TextDecoder().decode(response.configuration)
        entry.value = parse(JSON.parse(text))
      }
    } catch (error) {
      options.logger.error('AppConfig response parse failed; serving last known value', {
        profile: profileKey(identifiers),
        error: error instanceof Error ? error.message : String(error),
      })
    }

    entry.loaded = true
    entry.expiresAt = now() + Math.max(ttlMs, (response.nextPollIntervalSeconds ?? 60) * 1000)
    return entry.value
  }

  return {
    async read<T>(
      identifiers: AppConfigProfileIdentifiers,
      parse: (json: unknown) => T
    ): Promise<T | null> {
      const key = profileKey(identifiers)
      const entry = (cache.get(key) as CacheEntry<T> | undefined) ?? {
        value: null,
        loaded: false,
        nextToken: undefined,
        expiresAt: 0,
        inflight: null,
      }
      cache.set(key, entry)

      if (!entry.loaded) {
        entry.inflight ??= poll(identifiers, parse, entry).finally(() => {
          entry.inflight = null
        })
        return entry.inflight
      }

      if (now() >= entry.expiresAt && !entry.inflight) {
        entry.inflight = poll(identifiers, parse, entry).finally(() => {
          entry.inflight = null
        })
      }
      return entry.value
    },
  }
}

export function createAwsAppConfigProfileReader(
  options: AwsAppConfigProfileReaderOptions
): AppConfigProfileReader {
  let clientPromise:
    | Promise<import('@aws-sdk/client-appconfigdata').AppConfigDataClient>
    | undefined
  const client = async () => {
    clientPromise ??= import('@aws-sdk/client-appconfigdata').then(
      ({ AppConfigDataClient }) =>
        new AppConfigDataClient({
          region: options.region,
          credentials: options.credentials,
        })
    )
    return clientPromise
  }
  const transport: AppConfigTransport = {
    async startSession(identifiers) {
      const [{ StartConfigurationSessionCommand }, dataClient] = await Promise.all([
        import('@aws-sdk/client-appconfigdata'),
        client(),
      ])
      const response = await dataClient.send(
        new StartConfigurationSessionCommand({
          ApplicationIdentifier: identifiers.application,
          EnvironmentIdentifier: identifiers.environment,
          ConfigurationProfileIdentifier: identifiers.profile,
        })
      )
      return response.InitialConfigurationToken
    },
    async getLatest(token) {
      const [{ GetLatestConfigurationCommand }, dataClient] = await Promise.all([
        import('@aws-sdk/client-appconfigdata'),
        client(),
      ])
      const response = await dataClient.send(
        new GetLatestConfigurationCommand({ ConfigurationToken: token })
      )
      return {
        configuration: response.Configuration,
        nextToken: response.NextPollConfigurationToken,
        nextPollIntervalSeconds: response.NextPollIntervalInSeconds,
      }
    },
  }
  return createCachedAppConfigProfileReader({
    transport,
    logger: options.logger,
    ...(options.ttlMs === undefined ? {} : { ttlMs: options.ttlMs }),
    ...(options.now === undefined ? {} : { now: options.now }),
  })
}
