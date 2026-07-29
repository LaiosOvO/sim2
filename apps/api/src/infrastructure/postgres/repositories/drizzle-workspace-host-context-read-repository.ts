import { db } from '@sim/db'
import { member, subscription, userStats, workspace } from '@sim/db/schema'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type {
  WorkspaceHostContextReadRepository,
  WorkspaceHostSubscriptionSnapshot,
} from '@/modules/workspaces/ports/workspace-host-context-read-repository'

const entitledStatuses = ['active', 'past_due'] as const

function isPro(plan: string): boolean {
  return plan === 'pro' || plan.startsWith('pro_')
}

function isTeam(plan: string): boolean {
  return plan === 'team' || plan.startsWith('team_')
}

function pickPersonalSubscription(
  subscriptions: readonly WorkspaceHostSubscriptionSnapshot[]
): WorkspaceHostSubscriptionSnapshot | null {
  return (
    subscriptions.find((record) => record.plan === 'enterprise') ??
    subscriptions.find((record) => isTeam(record.plan)) ??
    subscriptions.find((record) => isPro(record.plan)) ??
    null
  )
}

async function readSubscription(
  organizationId: string | null,
  billedAccountUserId: string
): Promise<WorkspaceHostSubscriptionSnapshot | null> {
  const referenceId = organizationId ?? billedAccountUserId
  const query = db
    .select({
      plan: subscription.plan,
      status: subscription.status,
      billingInterval: subscription.billingInterval,
      metadata: subscription.metadata,
    })
    .from(subscription)
    .where(
      and(eq(subscription.referenceId, referenceId), inArray(subscription.status, entitledStatuses))
    )

  if (organizationId) {
    const [record] = await query
      .orderBy(desc(subscription.periodStart), desc(subscription.id))
      .limit(1)
    return record ?? null
  }
  return pickPersonalSubscription(await query)
}

async function readBillingBlock(
  organizationId: string | null,
  billedAccountUserId: string
): Promise<{
  billingBlocked: boolean
  billingBlockedReason: 'payment_failed' | 'dispute' | null
}> {
  let payerUserId = billedAccountUserId
  if (organizationId) {
    const [owner] = await db
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.role, 'owner')))
      .limit(1)
    if (!owner) return { billingBlocked: false, billingBlockedReason: null }
    payerUserId = owner.userId
  }

  const [stats] = await db
    .select({
      billingBlocked: userStats.billingBlocked,
      billingBlockedReason: userStats.billingBlockedReason,
    })
    .from(userStats)
    .where(eq(userStats.userId, payerUserId))
    .limit(1)
  const billingBlocked = Boolean(stats?.billingBlocked)
  return {
    billingBlocked,
    billingBlockedReason: billingBlocked ? (stats?.billingBlockedReason ?? null) : null,
  }
}

export function createDrizzleWorkspaceHostContextReadRepository(): WorkspaceHostContextReadRepository {
  return {
    async readForViewer(workspaceId, viewerId) {
      const [record] = await db
        .select({
          id: workspace.id,
          name: workspace.name,
          workspaceMode: workspace.workspaceMode,
          billedAccountUserId: workspace.billedAccountUserId,
          organizationId: workspace.organizationId,
        })
        .from(workspace)
        .where(and(eq(workspace.id, workspaceId), isNull(workspace.archivedAt)))
        .limit(1)
      if (!record) return null

      const [membership, payerSubscription, billingBlock] = await Promise.all([
        record.organizationId
          ? db
              .select({ role: member.role })
              .from(member)
              .where(
                and(eq(member.organizationId, record.organizationId), eq(member.userId, viewerId))
              )
              .limit(1)
              .then((rows) => rows[0]?.role ?? null)
          : Promise.resolve(null),
        readSubscription(record.organizationId, record.billedAccountUserId),
        readBillingBlock(record.organizationId, record.billedAccountUserId),
      ])

      return {
        workspace: record,
        viewerOrganizationRole: membership,
        subscription: payerSubscription,
        ...billingBlock,
      }
    },
  }
}
