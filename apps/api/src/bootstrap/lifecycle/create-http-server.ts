import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { ApiApplication } from '@/bootstrap/application/create-api-application'

const maximumRequestBytes = 2 * 1024 * 1024

function copyHeaders(response: Response, target: ServerResponse): void {
  for (const [name, value] of response.headers.entries()) {
    target.setHeader(name, value)
  }
}

async function readBody(request: IncomingMessage): Promise<string | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maximumRequestBytes) throw new Error('request_body_too_large')
    chunks.push(buffer)
  }
  return chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : undefined
}

async function dispatch(
  application: ApiApplication,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const host = request.headers.host ?? '127.0.0.1'
  const url = new URL(request.url ?? '/', `http://${host}`)
  const body = await readBody(request)
  const webResponse = await application.handle(
    new Request(url, {
      headers: request.headers as HeadersInit,
      method: request.method,
      body,
    })
  )

  response.statusCode = webResponse.status
  copyHeaders(webResponse, response)
  response.end(await webResponse.text())
}

export function createHttpServer(application: ApiApplication): Server {
  return createServer((request, response) => {
    void dispatch(application, request, response).catch((error) => {
      response.statusCode =
        error instanceof Error && error.message === 'request_body_too_large' ? 413 : 500
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          error: response.statusCode === 413 ? 'Request body too large' : 'Internal server error',
        })
      )
    })
  })
}
