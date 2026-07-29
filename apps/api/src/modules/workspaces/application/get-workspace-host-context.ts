import type { AuthenticatedRequestContext } from '@sim/api-contracts/auth'
import {
  type WorkspaceHostContextV1,
  workspaceHostContextV1Schema,
} from '@sim/api-contracts/workspaces'
import type { RequestAccessResolver } from '@sim/auth/authorization'
import type {
  WorkspaceHostContextReadRepository,
  WorkspaceHostSubscriptionSnapshot,
} from '@/modules/workspaces/ports/workspace-host-context-read-repository'

export type GetWorkspaceHostContextResult =
  | { ok: true; value: WorkspaceHostContextV1 }
  | { ok: false; reason: 'workspace-access-denied' }

export interface GetWorkspaceHostContextUseCase {
  execute(
    context: AuthenticatedRequestContext,
    workspaceId: string
  ): Promise<GetWorkspaceHostContextResult>
}

export interface GetWorkspaceHostContextDependencies {
  access: RequestAccessResolver
  repository: WorkspaceHostContextReadRepository
}

function isPro(plan: string): boolean {
  return plan === 'pro' || plan.startsWith('pro_')
}

function isTeam(plan: string): boolean {
  return plan === 'team' || plan.startsWith('team_')
}

function isEnterprise(plan: string): boolean {
  return plan === 'enterprise'
}

function resolveBillingInterval(
  subscription: WorkspaceHostSubscriptionSnapshot | null
): 'month' | 'year' {
  if (subscription?.billingInterval === 'month' || subscription?.billingInterval === 'year') {
    return subscription.billingInterval
  }
  const metadata = subscription?.metadata
  return typeof metadata === 'object' &&
    metadata !== null &&
    'billingInterval' in metadata &&
    metadata.billingInterval === 'year'
    ? 'year'
    : 'month'
}

function isOrganizationAdmin(role: string | null): boolean {
  return role === 'owner' || role === 'admin'
}

export function createGetWorkspaceHostContextUseCase(
  dependencies: GetWorkspaceHostContextDependencies
): GetWorkspaceHostContextUseCase {
  return {
    async execute(context, workspaceId) {
      if (context.actor.type !== 'user') {
        return { ok: false, reason: 'workspace-access-denied' }
      }
      const permission = await dependencies.access.workspacePermission(
        context.actor.id,
        workspaceId
      )
      if (!permission) return { ok: false, reason: 'workspace-access-denied' }

      const snapshot = await dependencies.repository.readForViewer(workspaceId, context.actor.id)
      if (!snapshot) return { ok: false, reason: 'workspace-access-denied' }

      const plan = snapshot.subscription?.plan ?? 'free'
      const status = snapshot.subscription?.status ?? null
      const hasPaidEntitlement =
        (status === 'active' || status === 'past_due') && !snapshot.billingBlocked
      const hostOrganizationId = snapshot.workspace.organizationId

      return {
        ok: true,
        value: workspaceHostContextV1Schema.parse({
          workspace: {
            id: snapshot.workspace.id,
            name: snapshot.workspace.name,
            workspaceMode: snapshot.workspace.workspaceMode,
            billedAccountUserId: snapshot.workspace.billedAccountUserId,
          },
          hostOrganizationId,
          ownerBilling: {
            plan,
            status,
            isPaid: hasPaidEntitlement && (isPro(plan) || isTeam(plan) || isEnterprise(plan)),
            isPro: hasPaidEntitlement && isPro(plan),
            isTeam: hasPaidEntitlement && isTeam(plan),
            isEnterprise: hasPaidEntitlement && isEnterprise(plan),
            isOrgScoped: hostOrganizationId !== null,
            organizationId: hostOrganizationId,
            billingInterval: resolveBillingInterval(snapshot.subscription),
            billingBlocked: snapshot.billingBlocked,
            billingBlockedReason: snapshot.billingBlocked ? snapshot.billingBlockedReason : null,
          },
          viewer: {
            permission,
            isHostOrganizationMember: snapshot.viewerOrganizationRole !== null,
            isHostOrganizationAdmin: isOrganizationAdmin(snapshot.viewerOrganizationRole),
          },
        }),
      }
    },
  }
}
