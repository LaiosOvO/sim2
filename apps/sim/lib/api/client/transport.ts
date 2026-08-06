export type ApiRequestFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

let installedTransport: ApiRequestFetch | undefined

/**
 * Installs a server transport without making browser callers depend on Node modules.
 * The server implementation uses AsyncLocalStorage, so concurrent requests remain isolated.
 */
export function installApiRequestTransport(transport: ApiRequestFetch): void {
  installedTransport = transport
}

export function apiRequestFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  return (installedTransport ?? globalThis.fetch)(input, init)
}
