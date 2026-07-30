import type { ApprovalV1 } from '@sim/api-contracts/approvals'
import { db } from '@sim/db'
import {
  type BusinessDataPolicy,
  type BusinessDataScope,
  businessMenu,
  businessRole,
  businessRoleMenu,
  businessRolePermission,
  businessUserRole,
  member,
  workspace,
} from '@sim/db/schema'
import { resolveEffectiveWorkspacePermission } from '@sim/platform-authz/workspace'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import type { ApprovalAccessPort } from '@/modules/approvals/ports'

interface Binding {
  id: string
  organizationId: string
  workspaceId: string | null
  dataScope: BusinessDataScope
  dataPolicy: BusinessDataPolicy
}

async function bindings(
  actorId: string,
  organizationId: string,
  workspaceId: string
): Promise<Binding[]> {
  const rows = await db
    .select({
      id: businessUserRole.id,
      organizationId: businessUserRole.organizationId,
      workspaceId: businessUserRole.workspaceId,
      dataScope: businessUserRole.dataScope,
      dataPolicy: businessUserRole.dataPolicy,
    })
    .from(businessUserRole)
    .innerJoin(businessRole, eq(businessUserRole.roleId, businessRole.id))
    .where(
      and(
        eq(businessUserRole.userId, actorId),
        eq(businessUserRole.organizationId, organizationId),
        eq(businessRole.organizationId, organizationId),
        or(isNull(businessUserRole.workspaceId), eq(businessUserRole.workspaceId, workspaceId)),
        eq(businessRole.enabled, true)
      )
    )
  return rows.map((row) => ({ ...row, dataPolicy: row.dataPolicy ?? {} }))
}

function conditionMatches(
  condition: NonNullable<BusinessDataPolicy['conditions']>[number],
  attributes: Record<string, string | string[] | null | undefined>
): boolean {
  const actual = attributes[condition.field]
  if (actual == null) return false
  const actualValues = Array.isArray(actual) ? actual : [actual]
  const expectedValues = Array.isArray(condition.value) ? condition.value : [condition.value]
  if (condition.operator === 'eq') {
    return actualValues.length === 1 && actualValues[0] === expectedValues[0]
  }
  if (condition.operator === 'in') {
    return actualValues.some((value) => expectedValues.includes(value))
  }
  return actualValues.some((value) => expectedValues.some((expected) => value.includes(expected)))
}

function bindingAllows(actorId: string, binding: Binding, approval: ApprovalV1): boolean {
  if (binding.workspaceId && binding.workspaceId !== approval.workspaceId) return false
  const policy = binding.dataPolicy
  if (policy.projectIds?.length && !policy.projectIds.includes(approval.businessId ?? '')) {
    return false
  }
  if (policy.moduleCodes?.length && !policy.moduleCodes.includes('approvals')) return false
  if (binding.dataScope === 'all' || binding.dataScope === 'organization') return true
  if (binding.dataScope === 'workspace') return true
  if (binding.dataScope === 'self') return approval.requestedBy === actorId
  if (binding.dataScope === 'assigned') {
    return approval.tasks.some((task) => task.reviewerUserId === actorId)
  }
  // Approval cannot prove PM membership without importing the PM aggregate.
  // A project_member binding therefore fails closed at this port boundary.
  if (binding.dataScope === 'project_member') return false
  const conditions = policy.conditions ?? []
  return (
    conditions.length > 0 &&
    conditions.every((condition) =>
      conditionMatches(condition, {
        businessType: approval.businessType,
        status: approval.status,
      })
    )
  )
}

function visibleFields(matched: Binding[]): Set<string> | null {
  const requested = [
    'content',
    'businessId',
    'reviewerExternalId',
    'decisionActor',
    'decisionComment',
  ]
  const allowed = new Set<string>()
  const denied = new Set<string>()
  let unrestricted = false
  for (const binding of matched) {
    if (!binding.dataPolicy.allowedFields?.length) unrestricted = true
    else for (const field of binding.dataPolicy.allowedFields) allowed.add(field)
    for (const field of binding.dataPolicy.deniedFields ?? []) denied.add(field)
  }
  if (unrestricted && denied.size === 0) return null
  return new Set(
    requested.filter((field) => !denied.has(field) && (unrestricted || allowed.has(field)))
  )
}

export function createDrizzleApprovalAccess(): ApprovalAccessPort {
  return {
    async workspace(actorId, workspaceId) {
      const [record] = await db
        .select({ organizationId: workspace.organizationId })
        .from(workspace)
        .where(eq(workspace.id, workspaceId))
        .limit(1)
      if (!record) return null
      const permission = await resolveEffectiveWorkspacePermission(
        actorId,
        workspaceId,
        record.organizationId
      )
      if (!permission) return null
      const [membership] = record.organizationId
        ? await db
            .select({ role: member.role })
            .from(member)
            .where(
              and(eq(member.organizationId, record.organizationId), eq(member.userId, actorId))
            )
            .limit(1)
        : []
      return {
        organizationId: record.organizationId,
        organizationRole: membership?.role ?? null,
        permission,
      }
    },
    async hasBusinessCapability(input) {
      const allBindings = await db
        .select({ roleId: businessUserRole.roleId })
        .from(businessUserRole)
        .innerJoin(businessRole, eq(businessUserRole.roleId, businessRole.id))
        .where(
          and(
            eq(businessUserRole.userId, input.actorId),
            eq(businessUserRole.organizationId, input.organizationId),
            eq(businessRole.organizationId, input.organizationId),
            or(
              isNull(businessUserRole.workspaceId),
              eq(businessUserRole.workspaceId, input.workspaceId)
            ),
            eq(businessRole.enabled, true)
          )
        )
      const roleIds = [...new Set(allBindings.map((row) => row.roleId))]
      if (roleIds.length === 0) return false
      const [permissions, menus] = await Promise.all([
        db
          .select({ code: businessRolePermission.permissionCode })
          .from(businessRolePermission)
          .where(
            and(
              inArray(businessRolePermission.roleId, roleIds),
              eq(businessRolePermission.permissionCode, input.permissionCode)
            )
          )
          .limit(1),
        db
          .select({ code: businessMenu.code })
          .from(businessRoleMenu)
          .innerJoin(businessMenu, eq(businessRoleMenu.menuId, businessMenu.id))
          .where(
            and(
              inArray(businessRoleMenu.roleId, roleIds),
              eq(businessMenu.code, input.menuCode),
              eq(businessMenu.enabled, true)
            )
          )
          .limit(1),
      ])
      return permissions.length > 0 && menus.length > 0
    },
    async filterVisibleApprovals(input) {
      const effective = await bindings(input.actorId, input.organizationId, input.workspaceId)
      return input.approvals.flatMap((approval) => {
        const matched = effective.filter((binding) =>
          bindingAllows(input.actorId, binding, approval)
        )
        if (matched.length === 0) return []
        const fields = visibleFields(matched)
        if (!fields) return [approval]
        return [
          {
            ...approval,
            content: fields.has('content') ? approval.content : '[受数据权限限制]',
            businessId: fields.has('businessId') ? approval.businessId : null,
            tasks: approval.tasks.map((task) => ({
              ...task,
              reviewerExternalId: fields.has('reviewerExternalId')
                ? task.reviewerExternalId
                : '[restricted]',
              decidedByExternalId: fields.has('decisionActor') ? task.decidedByExternalId : null,
            })),
            decisions: approval.decisions.map((decision) => ({
              ...decision,
              actorExternalId: fields.has('decisionActor') ? decision.actorExternalId : null,
              comment: fields.has('decisionComment') ? decision.comment : null,
            })),
          },
        ]
      })
    },
  }
}
