import type { TraceContext } from '@sim/api-contracts/tracing'

export function traceContextHeaders(trace: TraceContext): Record<string, string> {
  const headers: Record<string, string> = {
    traceparent: `00-${trace.traceId}-${trace.spanId}-${trace.traceFlags}`,
    'x-correlation-id': trace.correlationId,
  }
  if (trace.traceState) headers.tracestate = trace.traceState
  return headers
}

export type { TraceContext }
