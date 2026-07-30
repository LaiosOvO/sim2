export { createToolRouteCompatibilityHandler } from '@/modules/tool-adapters/compatibility-handler'
export type {
  ProviderToolRouteAdapter,
  ProviderToolRouteAdapterRegistry,
  ToolAdapterInvocation,
  ToolAdapterPrincipal,
  ToolAdapterResult,
  ToolRouteAccess,
  ToolRouteAccessDecision,
  ToolRouteRollout,
  W4ToolRouteDescriptor,
} from '@/modules/tool-adapters/contracts'
export { W4_TOOL_ROUTE_MANIFEST } from '@/modules/tool-adapters/generated/w4-tool-route-manifest'
export {
  HttpLegacyToolRouteAdapter,
  type HttpLegacyToolRouteAdapterOptions,
} from '@/modules/tool-adapters/http-legacy-tool-route-adapter'
export {
  validateW4Manifest,
  W4_EXPECTED_BATCH_COUNTS,
} from '@/modules/tool-adapters/manifest-validation'
