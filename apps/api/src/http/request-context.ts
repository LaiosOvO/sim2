import { randomUUID } from 'node:crypto'
import { API_CONTRACTS_VERSION } from '@sim/api-contracts'

export interface ApiRequestContext {
  requestId: string
}

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/

export function createRequestContext(request: Request): ApiRequestContext {
  const candidate =
    request.headers.get('x-request-id') ?? request.headers.get('x-correlation-id') ?? ''
  return {
    requestId: requestIdPattern.test(candidate) ? candidate : randomUUID(),
  }
}

export function withApiHeaders(response: Response, context: ApiRequestContext): Response {
  const headers = new Headers(response.headers)
  headers.set('x-request-id', context.requestId)
  headers.set('x-api-contract-version', String(API_CONTRACTS_VERSION))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
