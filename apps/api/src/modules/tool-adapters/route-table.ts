import type { W4ToolRouteDescriptor } from '@/modules/tool-adapters/contracts'

export type ToolRouteMatch =
  | {
      readonly kind: 'match'
      readonly route: W4ToolRouteDescriptor
    }
  | {
      readonly allow: readonly string[]
      readonly kind: 'method-not-allowed'
    }
  | {
      readonly kind: 'not-found'
    }

/**
 * Creates the only HTTP lookup table the compatibility layer needs.
 */
export function createToolRouteTable(
  manifest: readonly W4ToolRouteDescriptor[]
): (method: string, path: string) => ToolRouteMatch {
  const byPath = new Map<string, W4ToolRouteDescriptor>()
  for (const route of manifest) {
    if (byPath.has(route.pathTemplate)) {
      throw new Error(`Duplicate W4 route path ${route.pathTemplate}`)
    }
    byPath.set(route.pathTemplate, route)
  }

  return (method, path) => {
    const route = byPath.get(path)
    if (!route) {
      return { kind: 'not-found' }
    }
    const normalizedMethod = method.toUpperCase()
    if (!route.methods.includes(normalizedMethod)) {
      return { allow: route.methods, kind: 'method-not-allowed' }
    }
    return { kind: 'match', route }
  }
}
