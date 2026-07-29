import { z } from 'zod'

const lowerHex = (bytes: number) =>
  z
    .string()
    .length(bytes * 2)
    .regex(/^[0-9a-f]+$/)

/**
 * Serializable trace context shared by browser admission, API middleware and
 * Worker jobs. Unknown fields are intentionally stripped for additive
 * forward-compatibility.
 */
export const traceContextSchema = z.object({
  traceId: lowerHex(16),
  spanId: lowerHex(8),
  traceFlags: z.string().regex(/^[0-9a-f]{2}$/),
  traceState: z.string().max(512).optional(),
  correlationId: z.string().min(1).max(128),
})

export type TraceContext = z.infer<typeof traceContextSchema>

export function parseTraceContext(value: unknown): TraceContext {
  return traceContextSchema.parse(value)
}
