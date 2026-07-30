import { db } from '@sim/db'
import { member, permissions } from '@sim/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { isOrgAdminRole, type PermissionType } from './predicates'

export * from './predicates'

/**
 * Resolves the effective workspace permission under the governance inheritance
 * model: the owners/admins of the organization that owns the workspace are
 * derived workspace admins. Returns the higher of any explicit grant and the
 * org-admin derivation.
 *
 * The workspace owner is intentionally NOT a special case: every owner already
 * holds an explicit `admin` row in `permissions` (added at creation, verified
 * across all production workspaces), so the lookup below already grants them
 * admin. `workspace.ownerId` is a lifecycle anchor, not a permission input.
 *
 * Single source of truth for workspace-permission resolution, shared by the Next
 * app (`getEffectiveWorkspacePermission`) and the realtime server (via the
 * `/workflow` entry). Lives in a package because `apps/realtime` needs it and
 * packages may not import app code.
 */
export async function resolveEffectiveWorkspacePermission(
  userId: string,
  workspaceId: string,
  workspaceOrganizationId: string | null
): Promise<PermissionType | null> {
  const [permissionRow] = await db
    .select({ permissionType: permissions.permissionType })
    .from(permissions)
    .where(
      and(
        eq(permissions.userId, userId),
        eq(permissions.entityType, 'workspace'),
        eq(permissions.entityId, workspaceId)
      )
    )
    .limit(1)

  const explicit = (permissionRow?.permissionType as PermissionType | undefined) ?? null

  if (workspaceOrganizationId && explicit !== 'admin') {
    const [memberRow] = await db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, workspaceOrganizationId)))
      .limit(1)
    if (isOrgAdminRole(memberRow?.role)) {
      return 'admin'
    }
  }

  return explicit
}

export interface WorkspacePermissionSubject {
  id: string
  organizationId: string | null
}

/**
 * Resolves which workspace subjects are accessible to a viewer in a fixed
 * number of queries. Explicit grants of any level and organization owner/admin
 * inheritance both confer access.
 */
export async function resolveAccessibleWorkspaceIds(
  userId: string,
  subjects: readonly WorkspacePermissionSubject[]
): Promise<ReadonlySet<string>> {
  const byId = new Map(subjects.map((subject) => [subject.id, subject]))
  if (byId.size === 0) return new Set()

  const workspaceIds = [...byId.keys()]
  const organizationIds = [
    ...new Set(
      [...byId.values()]
        .map((subject) => subject.organizationId)
        .filter((organizationId): organizationId is string => organizationId !== null)
    ),
  ]

  const [permissionRows, membershipRows] = await Promise.all([
    db
      .select({ workspaceId: permissions.entityId })
      .from(permissions)
      .where(
        and(
          eq(permissions.userId, userId),
          eq(permissions.entityType, 'workspace'),
          inArray(permissions.entityId, workspaceIds)
        )
      ),
    organizationIds.length > 0
      ? db
          .select({ organizationId: member.organizationId, role: member.role })
          .from(member)
          .where(and(eq(member.userId, userId), inArray(member.organizationId, organizationIds)))
      : Promise.resolve([]),
  ])

  const adminOrganizationIds = new Set(
    membershipRows
      .filter((membership) => isOrgAdminRole(membership.role))
      .map((membership) => membership.organizationId)
  )
  const accessible = new Set(permissionRows.map((permission) => permission.workspaceId))
  for (const subject of byId.values()) {
    if (subject.organizationId && adminOrganizationIds.has(subject.organizationId)) {
      accessible.add(subject.id)
    }
  }
  return accessible
}
