import type { PublicTokenCredentialVerifier } from '@sim/auth/request-context'
import { db } from '@sim/db'
import { publicShare, workspace } from '@sim/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

export function createDrizzlePublicTokenVerifier(): PublicTokenCredentialVerifier {
  return {
    async verify(token) {
      try {
        const [record] = await db
          .select({
            shareId: publicShare.id,
            isActive: publicShare.isActive,
            workspaceId: publicShare.workspaceId,
            organizationId: workspace.organizationId,
            resourceType: publicShare.resourceType,
            resourceId: publicShare.resourceId,
          })
          .from(publicShare)
          .innerJoin(workspace, eq(publicShare.workspaceId, workspace.id))
          .where(and(eq(publicShare.token, token), isNull(workspace.archivedAt)))
          .limit(1)

        if (!record) return { verified: false, reason: 'invalid' }
        if (!record.isActive) return { verified: false, reason: 'revoked' }
        return {
          verified: true,
          credential: {
            shareId: record.shareId,
            workspaceId: record.workspaceId,
            organizationId: record.organizationId,
            resourceType: record.resourceType,
            resourceId: record.resourceId,
          },
        }
      } catch {
        return { verified: false, reason: 'unavailable' }
      }
    },
  }
}
