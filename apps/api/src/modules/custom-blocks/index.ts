export type {
  CustomBlockModule,
  CustomBlockModuleDependencies,
} from '@/modules/custom-blocks/application/create-custom-block-module'
export { createCustomBlockModule } from '@/modules/custom-blocks/application/create-custom-block-module'
export { CustomBlockDomainError } from '@/modules/custom-blocks/errors'
export type { CustomBlockAuditSink } from '@/modules/custom-blocks/ports/custom-block-audit'
export type {
  BlockVisibilityReader,
  CustomBlockEntitlement,
  CustomBlockFeatureGate,
  PlatformAdminReader,
} from '@/modules/custom-blocks/ports/custom-block-policy'
export type {
  CustomBlockManageContext,
  CustomBlockRepository,
} from '@/modules/custom-blocks/ports/custom-block-repository'
