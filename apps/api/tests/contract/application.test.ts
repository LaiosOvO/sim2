import { apiErrorEnvelopeSchema } from '@sim/api-contracts'
import { describe, expect, it } from 'vitest'
import { createApiApplication } from '@/bootstrap/application/create-api-application'
import { traceContextFromHeaders } from '@/http/middleware/trace-context'

describe('API application interface', () => {
  it('returns a stable not-found envelope for an unregistered route', async () => {
    const application = createApiApplication({ serviceName: 'test-api' })
    const response = await application.handle(new Request('http://localhost/unregistered'))

    expect(response.status).toBe(404)
    const body = apiErrorEnvelopeSchema.parse(await response.json())
    expect(body.error).toMatchObject({
      code: 'not_found',
      status: 404,
      details: { service: 'test-api' },
    })
  })

  it('decodes the browser trace wire format', () => {
    const trace = traceContextFromHeaders(
      new Headers({
        traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
        tracestate: 'vendor=value',
        'x-correlation-id': 'request-1',
      })
    )

    expect(trace).toMatchObject({
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      correlationId: 'request-1',
    })
  })
})
