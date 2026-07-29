import {
  noInputSchema,
  type PublicStatusResponse,
  publicStatusResponseSchema,
  type StatusType,
} from '@sim/api-contracts/core'

interface IncidentSummary {
  page_url?: string
  ongoing_incidents?: Array<{
    current_worst_impact?: string
  }>
  in_progress_maintenances?: unknown[]
}

export interface StatusModule {
  handle(request: Request): Promise<Response | undefined>
}

export interface StatusModuleOptions {
  fetcher?: typeof fetch
  now?: () => Date
  cacheTtlMs?: number
}

function determineStatus(data: IncidentSummary): {
  status: StatusType
  message: string
} {
  if (data.ongoing_incidents && data.ongoing_incidents.length > 0) {
    const impact = data.ongoing_incidents[0]?.current_worst_impact
    if (impact === 'full_outage') return { status: 'outage', message: 'Service Disruption' }
    return { status: 'degraded', message: 'Experiencing Issues' }
  }
  if (data.in_progress_maintenances && data.in_progress_maintenances.length > 0) {
    return { status: 'maintenance', message: 'Under Maintenance' }
  }
  return { status: 'operational', message: 'All Systems Operational' }
}

export function createStatusModule(options: StatusModuleOptions = {}): StatusModule {
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? (() => new Date())
  const cacheTtlMs = options.cacheTtlMs ?? 2 * 60 * 1000
  let cached: { data: PublicStatusResponse; timestamp: number } | undefined

  return {
    async handle(request) {
      const url = new URL(request.url)
      if (request.method !== 'GET' || url.pathname !== '/api/status') return undefined
      const query = noInputSchema.safeParse(Object.fromEntries(url.searchParams.entries()))
      if (!query.success) {
        return Response.json(
          { error: 'Validation error', details: query.error.issues },
          { status: 400 }
        )
      }

      const current = now()
      if (cached && current.getTime() - cached.timestamp < cacheTtlMs) {
        return Response.json(cached.data, {
          headers: {
            'Cache-Control': 'public, max-age=60, s-maxage=60',
            'X-Cache': 'HIT',
          },
        })
      }

      try {
        const response = await fetcher('https://status.sim.ai/api/v1/summary', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) throw new Error(`incident.io API returned ${response.status}`)
        const data = (await response.json()) as IncidentSummary
        const status = determineStatus(data)
        const body = publicStatusResponseSchema.parse({
          ...status,
          url: data.page_url || 'https://status.sim.ai',
          lastUpdated: current.toISOString(),
        })
        cached = { data: body, timestamp: current.getTime() }
        return Response.json(body, {
          headers: {
            'Cache-Control': 'public, max-age=60, s-maxage=60',
            'X-Cache': 'MISS',
          },
        })
      } catch {
        return Response.json(
          publicStatusResponseSchema.parse({
            status: 'error',
            message: 'Status Unknown',
            url: 'https://status.sim.ai',
            lastUpdated: current.toISOString(),
          }),
          {
            status: 200,
            headers: {
              'Cache-Control': 'public, max-age=30, s-maxage=30',
            },
          }
        )
      }
    },
  }
}
