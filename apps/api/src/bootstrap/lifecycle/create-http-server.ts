import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { ApiApplication } from '@/bootstrap/application/create-api-application'

function copyHeaders(response: Response, target: ServerResponse): void {
  for (const [name, value] of response.headers.entries()) {
    target.setHeader(name, value)
  }
}

async function dispatch(
  application: ApiApplication,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const host = request.headers.host ?? '127.0.0.1'
  const url = new URL(request.url ?? '/', `http://${host}`)
  const webResponse = await application.handle(
    new Request(url, {
      headers: request.headers as HeadersInit,
      method: request.method,
    })
  )

  response.statusCode = webResponse.status
  copyHeaders(webResponse, response)
  response.end(await webResponse.text())
}

export function createHttpServer(application: ApiApplication): Server {
  return createServer((request, response) => {
    void dispatch(application, request, response)
  })
}
