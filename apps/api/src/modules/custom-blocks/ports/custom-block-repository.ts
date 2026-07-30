import type {
  CustomBlockInputOverrideV1,
  CustomBlockUsageCountsV1,
  CustomBlockV1,
  PublishCustomBlockBodyV1,
  UpdateCustomBlockBodyV1,
} from '@sim/api-contracts/custom-blocks'

export interface CustomBlockManageContext {
  organizationId: string
  sourceWorkspaceId: string | null
  type: string
  name: string
}

export interface PublishCustomBlockRecord extends PublishCustomBlockBodyV1 {
  organizationId: string
  userId: string
  id: string
  type: string
}

export interface CustomBlockRepository {
  findWorkspaceOrganization(workspaceId: string): Promise<string | null | undefined>
  listWithInputs(organizationId: string): Promise<readonly CustomBlockV1[]>
  publish(record: PublishCustomBlockRecord): Promise<CustomBlockV1>
  findManageContext(id: string): Promise<CustomBlockManageContext | null>
  update(id: string, organizationId: string, patch: UpdateCustomBlockBodyV1): Promise<boolean>
  delete(id: string, organizationId: string): Promise<boolean>
  countUsages(organizationId: string, blockType: string): Promise<CustomBlockUsageCountsV1>
}

export type { CustomBlockInputOverrideV1 }
