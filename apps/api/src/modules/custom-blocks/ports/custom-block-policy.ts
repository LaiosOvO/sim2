export interface CustomBlockFeatureGate {
  isEnabled(input: {
    userId: string
    organizationId: string
    isPlatformAdmin?: boolean
  }): Promise<boolean>
}

export interface CustomBlockEntitlement {
  isEnterprise(organizationId: string): Promise<boolean>
}

export interface PlatformAdminReader {
  isPlatformAdmin(userId: string): Promise<boolean>
}

export interface BlockVisibilityProjection {
  revealed: readonly string[]
  disabled: readonly string[]
  previewTagged: readonly string[]
}

export interface BlockVisibilityReader {
  read(input: {
    userId: string
    organizationId: string | null
    isPlatformAdmin: boolean
  }): Promise<BlockVisibilityProjection>
}
