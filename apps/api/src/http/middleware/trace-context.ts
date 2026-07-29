import { type TraceContext, traceContextSchema } from '@sim/api-contracts/tracing'

const traceParentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/

export function traceContextFromHeaders(headers: Headers): TraceContext | undefined {
  const traceParent = headers.get('traceparent')
  const correlationId = headers.get('x-correlation-id')
  if (!traceParent || !correlationId) return undefined
  const match = traceParent.match(traceParentPattern)
  if (!match) return undefined

  return traceContextSchema.parse({
    traceId: match[1],
    spanId: match[2],
    traceFlags: match[3],
    traceState: headers.get('tracestate') ?? undefined,
    correlationId,
  })
}
