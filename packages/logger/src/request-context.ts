export interface RequestContext {
  requestId: string
  method?: string
  path?: string
}

/**
 * AsyncLocalStorage is only available in Node.js. In Edge/browser contexts
 * we fall back to a no-op implementation so the logger import doesn't break.
 */
interface Storage<T> {
  getStore(): T | undefined
  run<R>(store: T, fn: () => R): R
}

let storage: Storage<RequestContext>

const asyncHooks =
  typeof globalThis.process !== 'undefined' && globalThis.process.versions?.node
    ? globalThis.process.getBuiltinModule?.('node:async_hooks')
    : undefined

if (asyncHooks) {
  // Node 22+ ESM — synchronously resolve the builtin without CommonJS require.
  const { AsyncLocalStorage } = asyncHooks as typeof import('node:async_hooks')
  storage = new AsyncLocalStorage<RequestContext>()
} else {
  // Edge / browser — no-op
  storage = {
    getStore: () => undefined,
    run: <R>(_store: RequestContext, fn: () => R) => fn(),
  }
}

/**
 * Runs a callback within a request context. All loggers called inside
 * the callback (and any async functions it awaits) will automatically
 * include the request context metadata in their output.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn)
}

/**
 * Returns the current request context, or undefined if called outside
 * of a `runWithRequestContext` scope.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}
