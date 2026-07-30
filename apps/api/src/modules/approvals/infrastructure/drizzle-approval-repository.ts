import type {
  ApprovalDecisionActionV1,
  ApprovalDefinitionSpecV1,
  ApprovalDefinitionV1,
  ApprovalDefinitionVersionV1,
  ApprovalV1,
  ParsedDecideApprovalBodyV1,
  ParsedStartApprovalBodyV1,
} from '@sim/api-contracts/approvals'
import {
  aggregateApprovalVotes,
  approvalOutcomeForAction,
  findInitialApprovalNode,
  findNextApprovalNode,
  validateApprovalDefinition,
} from '@sim/biz-approval'
import { db } from '@sim/db'
import {
  approvalDecision,
  approvalDefinition,
  approvalDefinitionVersion,
  approvalInstance,
  approvalStepInstance,
  approvalTask,
  businessRole,
  businessUserRole,
  workspace,
} from '@sim/db/schema'
import { generateId } from '@sim/utils/id'
import { and, asc, desc, eq, exists, inArray, isNull, or } from 'drizzle-orm'
import { ApprovalDomainError } from '@/modules/approvals/errors'
import type { ApprovalDecisionResult, ApprovalRepository } from '@/modules/approvals/ports'

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null
}

function versionView(
  row: typeof approvalDefinitionVersion.$inferSelect
): ApprovalDefinitionVersionV1 {
  return {
    id: row.id,
    definitionId: row.definitionId,
    version: row.version,
    status: row.status,
    spec: row.spec as ApprovalDefinitionSpecV1,
    publishedAt: iso(row.publishedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function definitionView(definitionId: string): Promise<ApprovalDefinitionV1> {
  const [definition] = await db
    .select()
    .from(approvalDefinition)
    .where(eq(approvalDefinition.id, definitionId))
    .limit(1)
  if (!definition) {
    throw new ApprovalDomainError('APPROVAL_DEFINITION_NOT_FOUND', 'Approval definition not found')
  }
  const versions = await db
    .select()
    .from(approvalDefinitionVersion)
    .where(eq(approvalDefinitionVersion.definitionId, definition.id))
    .orderBy(desc(approvalDefinitionVersion.version))
  return {
    id: definition.id,
    workspaceId: definition.workspaceId,
    code: definition.code,
    name: definition.name,
    description: definition.description,
    enabled: definition.enabled,
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString(),
    versions: versions.map(versionView),
  }
}

async function approvalView(approvalId: string, actorId?: string): Promise<ApprovalV1 | null> {
  const [row] = await db
    .select()
    .from(approvalInstance)
    .where(eq(approvalInstance.id, approvalId))
    .limit(1)
  if (!row) return null
  const [tasks, decisions] = await Promise.all([
    db
      .select()
      .from(approvalTask)
      .where(eq(approvalTask.approvalId, approvalId))
      .orderBy(asc(approvalTask.createdAt)),
    db
      .select()
      .from(approvalDecision)
      .where(eq(approvalDecision.approvalId, approvalId))
      .orderBy(desc(approvalDecision.createdAt)),
  ])
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    workflowId: row.workflowId,
    definitionVersionId: row.definitionVersionId,
    executionId: row.executionId,
    contextId: row.contextId,
    businessType: row.businessType,
    businessId: row.businessId,
    title: row.title,
    content: row.content,
    mode: row.mode,
    status: row.status,
    resumeStatus: row.resumeStatus,
    resumeExecutionId: row.resumeExecutionId,
    resumeError: row.resumeError,
    state: row.state ?? {},
    versionNo: row.versionNo,
    requestedBy: row.requestedBy,
    decidedAt: iso(row.decidedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tasks: tasks.map((task) => ({
      id: task.id,
      stepInstanceId: task.stepInstanceId,
      channel: task.channel,
      receiveIdType: task.receiveIdType,
      reviewerExternalId: task.reviewerExternalId,
      reviewerUserId: task.reviewerUserId,
      reviewerRoleCode: task.reviewerRoleCode,
      canAct: task.status === 'pending' && Boolean(actorId) && task.reviewerUserId === actorId,
      status: task.status,
      messageId: task.messageId,
      decidedByExternalId: task.decidedByExternalId,
      decidedAt: iso(task.decidedAt),
    })),
    decisions: decisions.map((decision) => ({
      id: decision.id,
      taskId: decision.taskId,
      action: decision.action,
      actorExternalId: decision.actorExternalId,
      comment: decision.comment,
      payload: decision.payload ?? {},
      createdAt: decision.createdAt.toISOString(),
    })),
  }
}

async function reviewerIds(
  workspaceId: string,
  candidates: ApprovalDefinitionSpecV1['nodes'][number] extends never
    ? never
    : Array<{ kind: 'user'; userId: string } | { kind: 'role'; roleCode: string }>,
  overrides?: string[]
): Promise<Array<{ userId: string; roleCode: string | null }>> {
  if (overrides?.length) {
    return [...new Set(overrides)].map((userId) => ({ userId, roleCode: null }))
  }
  const direct = candidates.flatMap((candidate) =>
    candidate.kind === 'user' ? [{ userId: candidate.userId, roleCode: null }] : []
  )
  const roleCodes = candidates.flatMap((candidate) =>
    candidate.kind === 'role' ? [candidate.roleCode] : []
  )
  if (roleCodes.length === 0) return direct
  const [workspaceOwner] = await db
    .select({ organizationId: workspace.organizationId })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1)
  if (!workspaceOwner?.organizationId) return direct
  const roleRows = await db
    .select({ userId: businessUserRole.userId, roleCode: businessRole.code })
    .from(businessUserRole)
    .innerJoin(businessRole, eq(businessUserRole.roleId, businessRole.id))
    .where(
      and(
        inArray(businessRole.code, roleCodes),
        eq(businessRole.organizationId, workspaceOwner.organizationId),
        eq(businessUserRole.organizationId, workspaceOwner.organizationId),
        eq(businessRole.enabled, true),
        or(isNull(businessUserRole.workspaceId), eq(businessUserRole.workspaceId, workspaceId))
      )
    )
  return [
    ...new Map([...direct, ...roleRows].map((reviewer) => [reviewer.userId, reviewer])).values(),
  ]
}

function dueAt(afterMinutes: number | undefined): Date | null {
  return afterMinutes ? new Date(Date.now() + afterMinutes * 60_000) : null
}

function persistedOutcome(
  outcome: 'approve' | 'reject' | 'return'
): 'approved' | 'rejected' | 'returned' {
  if (outcome === 'approve') return 'approved'
  if (outcome === 'reject') return 'rejected'
  return 'returned'
}

export function createDrizzleApprovalRepository(): ApprovalRepository {
  return {
    async listDefinitions(workspaceId) {
      const rows = await db
        .select({ id: approvalDefinition.id })
        .from(approvalDefinition)
        .where(eq(approvalDefinition.workspaceId, workspaceId))
        .orderBy(asc(approvalDefinition.name))
      return Promise.all(rows.map((row) => definitionView(row.id)))
    },
    async getDefinitionWorkspace(definitionId) {
      const [row] = await db
        .select({ workspaceId: approvalDefinition.workspaceId })
        .from(approvalDefinition)
        .where(eq(approvalDefinition.id, definitionId))
        .limit(1)
      return row?.workspaceId ?? null
    },
    async createDefinition(input, actorId) {
      const validation = validateApprovalDefinition(input.spec)
      if (!validation.valid) {
        throw new ApprovalDomainError('APPROVAL_INVALID', validation.errors.join('; '))
      }
      const definitionId = generateId()
      const versionId = generateId()
      try {
        await db.transaction(async (tx) => {
          await tx.insert(approvalDefinition).values({
            id: definitionId,
            workspaceId: input.workspaceId,
            code: input.code,
            name: input.name,
            description: input.description,
            createdBy: actorId,
          })
          await tx.insert(approvalDefinitionVersion).values({
            id: versionId,
            definitionId,
            version: 1,
            status: 'draft',
            spec: input.spec,
            createdBy: actorId,
          })
        })
      } catch (cause) {
        throw new ApprovalDomainError(
          'APPROVAL_CONFLICT',
          cause instanceof Error && cause.message.toLowerCase().includes('unique')
            ? 'Approval definition code already exists'
            : 'Approval definition could not be created'
        )
      }
      return definitionView(definitionId)
    },
    async createVersion(definitionId, spec, actorId) {
      const validation = validateApprovalDefinition(spec)
      if (!validation.valid) {
        throw new ApprovalDomainError('APPROVAL_INVALID', validation.errors.join('; '))
      }
      const id = generateId()
      const created = await db.transaction(async (tx) => {
        const [definition] = await tx
          .select({ id: approvalDefinition.id })
          .from(approvalDefinition)
          .where(eq(approvalDefinition.id, definitionId))
          .for('update')
          .limit(1)
        if (!definition) {
          throw new ApprovalDomainError(
            'APPROVAL_DEFINITION_NOT_FOUND',
            'Approval definition not found'
          )
        }
        const [latest] = await tx
          .select({ version: approvalDefinitionVersion.version })
          .from(approvalDefinitionVersion)
          .where(eq(approvalDefinitionVersion.definitionId, definitionId))
          .orderBy(desc(approvalDefinitionVersion.version))
          .for('update')
          .limit(1)
        const [row] = await tx
          .insert(approvalDefinitionVersion)
          .values({
            id,
            definitionId,
            version: (latest?.version ?? 0) + 1,
            status: 'draft',
            spec,
            createdBy: actorId,
          })
          .returning()
        return row
      })
      if (!created) {
        throw new ApprovalDomainError(
          'APPROVAL_VERSION_NOT_FOUND',
          'Approval version was not created'
        )
      }
      return versionView(created)
    },
    async publishVersion(definitionId, versionId) {
      const published = await db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(approvalDefinitionVersion)
          .where(
            and(
              eq(approvalDefinitionVersion.id, versionId),
              eq(approvalDefinitionVersion.definitionId, definitionId)
            )
          )
          .for('update')
          .limit(1)
        if (!target) {
          throw new ApprovalDomainError(
            'APPROVAL_VERSION_NOT_FOUND',
            'Approval definition version not found'
          )
        }
        if (target.status !== 'draft') {
          throw new ApprovalDomainError(
            'APPROVAL_CONFLICT',
            'Only a draft approval version can be published'
          )
        }
        const validation = validateApprovalDefinition(target.spec as ApprovalDefinitionSpecV1)
        if (!validation.valid) {
          throw new ApprovalDomainError('APPROVAL_INVALID', validation.errors.join('; '))
        }
        await tx
          .update(approvalDefinitionVersion)
          .set({ status: 'retired', updatedAt: new Date() })
          .where(
            and(
              eq(approvalDefinitionVersion.definitionId, definitionId),
              eq(approvalDefinitionVersion.status, 'published')
            )
          )
        const [row] = await tx
          .update(approvalDefinitionVersion)
          .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
          .where(eq(approvalDefinitionVersion.id, versionId))
          .returning()
        return row
      })
      if (!published) {
        throw new ApprovalDomainError(
          'APPROVAL_VERSION_NOT_FOUND',
          'Approval definition version not found'
        )
      }
      return versionView(published)
    },
    async listApprovals(input) {
      const conditions = [eq(approvalInstance.workspaceId, input.workspaceId)]
      if (input.executionId) {
        conditions.push(eq(approvalInstance.executionId, input.executionId))
      }
      if (input.status) conditions.push(eq(approvalInstance.status, input.status))
      if (input.view === 'requested_by_me') {
        conditions.push(eq(approvalInstance.requestedBy, input.actorId))
      }
      if (input.view === 'pending_for_me') {
        conditions.push(
          exists(
            db
              .select({ id: approvalTask.id })
              .from(approvalTask)
              .where(
                and(
                  eq(approvalTask.approvalId, approvalInstance.id),
                  eq(approvalTask.reviewerUserId, input.actorId),
                  eq(approvalTask.status, 'pending')
                )
              )
          )
        )
      }
      const rows = await db
        .select({ id: approvalInstance.id })
        .from(approvalInstance)
        .where(and(...conditions))
        .orderBy(desc(approvalInstance.createdAt))
        .limit(input.limit)
      const hydrated = (
        await Promise.all(rows.map((row) => approvalView(row.id, input.actorId)))
      ).filter((row): row is ApprovalV1 => row !== null)
      return hydrated
    },
    getApproval: approvalView,
    async start(input: ParsedStartApprovalBodyV1, requestedBy: string) {
      const [existing] = await db
        .select({ id: approvalInstance.id })
        .from(approvalInstance)
        .where(
          and(
            eq(approvalInstance.executionId, input.executionId),
            eq(approvalInstance.contextId, input.contextId)
          )
        )
        .limit(1)
      if (existing) return (await approvalView(existing.id))!

      const [version] = await db
        .select({
          version: approvalDefinitionVersion,
          definitionWorkspaceId: approvalDefinition.workspaceId,
          definitionEnabled: approvalDefinition.enabled,
        })
        .from(approvalDefinitionVersion)
        .innerJoin(
          approvalDefinition,
          eq(approvalDefinitionVersion.definitionId, approvalDefinition.id)
        )
        .where(eq(approvalDefinitionVersion.id, input.definitionVersionId))
        .limit(1)
      if (
        !version ||
        version.version.status !== 'published' ||
        !version.definitionEnabled ||
        version.definitionWorkspaceId !== input.workspaceId
      ) {
        throw new ApprovalDomainError(
          'APPROVAL_VERSION_NOT_FOUND',
          'Published approval definition version not found'
        )
      }
      const spec = version.version.spec as ApprovalDefinitionSpecV1
      const node = findInitialApprovalNode(spec)
      const reviewers = await reviewerIds(input.workspaceId, node.candidates, input.reviewerUserIds)
      if (reviewers.length === 0) {
        throw new ApprovalDomainError(
          'APPROVAL_INVALID',
          'Approval step has no resolvable reviewers'
        )
      }
      const approvalId = generateId()
      const stepId = generateId()
      try {
        await db.transaction(async (tx) => {
          await tx.insert(approvalInstance).values({
            id: approvalId,
            workspaceId: input.workspaceId,
            workflowId: input.workflowId,
            definitionVersionId: input.definitionVersionId,
            executionId: input.executionId,
            contextId: input.contextId,
            businessType: input.businessType,
            businessId: input.businessId ?? input.projectId,
            title: input.title,
            content: input.content,
            mode: node.mode,
            state: {
              activeNodeId: node.id,
              ...(input.projectName ? { projectName: input.projectName } : {}),
            },
            requestedBy,
          })
          await tx.insert(approvalStepInstance).values({
            id: stepId,
            approvalId,
            definitionVersionId: input.definitionVersionId,
            nodeId: node.id,
            nodeName: node.name,
            mode: node.mode,
            dueAt: dueAt(node.timeout?.afterMinutes),
          })
          await tx.insert(approvalTask).values(
            reviewers.map((reviewer) => ({
              id: generateId(),
              approvalId,
              stepInstanceId: stepId,
              channel: 'feishu',
              receiveIdType: 'user_id',
              reviewerExternalId: reviewer.userId,
              reviewerUserId: reviewer.userId,
              reviewerRoleCode: reviewer.roleCode,
            }))
          )
        })
      } catch (cause) {
        const [raced] = await db
          .select({ id: approvalInstance.id })
          .from(approvalInstance)
          .where(
            and(
              eq(approvalInstance.executionId, input.executionId),
              eq(approvalInstance.contextId, input.contextId)
            )
          )
          .limit(1)
        if (raced) return (await approvalView(raced.id))!
        throw cause
      }
      const created = await approvalView(approvalId)
      if (!created) {
        throw new ApprovalDomainError('APPROVAL_CONFLICT', 'Approval instance could not be created')
      }
      return created
    },
    async decide(
      approvalId: string,
      input: ParsedDecideApprovalBodyV1,
      actorId: string
    ): Promise<ApprovalDecisionResult> {
      return db.transaction(async (tx) => {
        const [instance] = await tx
          .select()
          .from(approvalInstance)
          .where(eq(approvalInstance.id, approvalId))
          .for('update')
          .limit(1)
        if (!instance) {
          throw new ApprovalDomainError('APPROVAL_NOT_FOUND', 'Approval not found')
        }
        const [task] = await tx
          .select()
          .from(approvalTask)
          .where(and(eq(approvalTask.id, input.taskId), eq(approvalTask.approvalId, approvalId)))
          .for('update')
          .limit(1)
        if (!task) {
          throw new ApprovalDomainError('APPROVAL_TASK_NOT_FOUND', 'Approval task not found')
        }
        if (task.reviewerUserId !== actorId) {
          throw new ApprovalDomainError(
            'APPROVAL_TASK_MISMATCH',
            'Approval task does not belong to the actor'
          )
        }
        if (task.status !== 'pending' || instance.status !== 'pending') {
          return {
            status: 'already_decided',
            approvalStatus: instance.status,
            approvalId,
            shouldResume: instance.status !== 'pending' && instance.resumeStatus !== 'started',
          }
        }
        if (!task.stepInstanceId || !instance.definitionVersionId) {
          throw new ApprovalDomainError(
            'APPROVAL_CONFLICT',
            'Legacy approval task is outside the versioned approval module'
          )
        }

        await tx.insert(approvalDecision).values({
          id: generateId(),
          approvalId,
          taskId: task.id,
          action: input.action as ApprovalDecisionActionV1,
          actorExternalId: actorId,
          comment: input.comment,
          payload: input.targetUserId ? { targetUserId: input.targetUserId } : {},
        })

        if (input.action === 'comment') {
          return {
            status: 'pending',
            approvalStatus: 'pending',
            approvalId,
            shouldResume: false,
          }
        }
        if (input.action === 'transfer' || input.action === 'add_sign') {
          if (!input.targetUserId) {
            throw new ApprovalDomainError(
              'APPROVAL_INVALID',
              `${input.action} requires targetUserId`
            )
          }
          if (input.action === 'transfer') {
            await tx
              .update(approvalTask)
              .set({
                status: 'transferred',
                decidedByExternalId: actorId,
                decidedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(approvalTask.id, task.id))
          }
          await tx.insert(approvalTask).values({
            id: generateId(),
            approvalId,
            stepInstanceId: task.stepInstanceId,
            channel: task.channel,
            receiveIdType: task.receiveIdType,
            reviewerExternalId: input.targetUserId,
            reviewerUserId: input.targetUserId,
          })
          return {
            status: 'pending',
            approvalStatus: 'pending',
            approvalId,
            shouldResume: false,
          }
        }

        const outcomeVote = approvalOutcomeForAction(input.action)
        if (!outcomeVote) {
          throw new ApprovalDomainError('APPROVAL_INVALID', 'Unsupported approval decision')
        }
        await tx
          .update(approvalTask)
          .set({
            status: outcomeVote === 'approve' ? 'approved' : 'rejected',
            decidedByExternalId: actorId,
            decidedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(approvalTask.id, task.id))
        const stepTasks = await tx
          .select({ id: approvalTask.id })
          .from(approvalTask)
          .where(eq(approvalTask.stepInstanceId, task.stepInstanceId))
        const stepTaskIds = stepTasks.map((row) => row.id)
        const priorVotes =
          stepTaskIds.length === 0
            ? []
            : await tx
                .select({ action: approvalDecision.action })
                .from(approvalDecision)
                .where(
                  and(
                    inArray(approvalDecision.taskId, stepTaskIds),
                    inArray(approvalDecision.action, ['approve', 'reject', 'return'])
                  )
                )
        const votes = priorVotes.flatMap((row) => {
          const vote = approvalOutcomeForAction(row.action)
          return vote ? [vote] : []
        })
        const [step] = await tx
          .select()
          .from(approvalStepInstance)
          .where(eq(approvalStepInstance.id, task.stepInstanceId))
          .for('update')
          .limit(1)
        if (!step) {
          throw new ApprovalDomainError('APPROVAL_CONFLICT', 'Approval step not found')
        }
        const aggregate = aggregateApprovalVotes(step.mode, votes, stepTasks.length)
        if (aggregate === 'pending') {
          return {
            status: 'pending',
            approvalStatus: 'pending',
            approvalId,
            shouldResume: false,
          }
        }
        const persisted = persistedOutcome(aggregate)
        await tx
          .update(approvalStepInstance)
          .set({ status: persisted, completedAt: new Date(), updatedAt: new Date() })
          .where(eq(approvalStepInstance.id, step.id))
        const [version] = await tx
          .select({ spec: approvalDefinitionVersion.spec })
          .from(approvalDefinitionVersion)
          .where(eq(approvalDefinitionVersion.id, instance.definitionVersionId))
          .limit(1)
        if (!version) {
          throw new ApprovalDomainError(
            'APPROVAL_VERSION_NOT_FOUND',
            'Approval definition version not found'
          )
        }
        const next = findNextApprovalNode(
          version.spec as ApprovalDefinitionSpecV1,
          step.nodeId,
          aggregate
        )
        if (next.type === 'end') {
          await tx
            .update(approvalTask)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(and(eq(approvalTask.approvalId, approvalId), eq(approvalTask.status, 'pending')))
          await tx
            .update(approvalInstance)
            .set({
              status: persisted,
              resumeStatus: 'starting',
              decidedAt: new Date(),
              versionNo: instance.versionNo + 1,
              state: { ...instance.state, activeNodeId: next.id },
              updatedAt: new Date(),
            })
            .where(eq(approvalInstance.id, approvalId))
          return {
            status: 'terminal',
            approvalStatus: persisted,
            approvalId,
            shouldResume: true,
          }
        }
        if (next.type !== 'approval') {
          throw new ApprovalDomainError(
            'APPROVAL_INVALID',
            'Approval transition must lead to approval or end'
          )
        }
        const reviewers = await reviewerIds(instance.workspaceId, next.candidates)
        if (reviewers.length === 0) {
          throw new ApprovalDomainError(
            'APPROVAL_INVALID',
            'Next approval step has no resolvable reviewers'
          )
        }
        const nextStepId = generateId()
        await tx.insert(approvalStepInstance).values({
          id: nextStepId,
          approvalId,
          definitionVersionId: instance.definitionVersionId,
          nodeId: next.id,
          nodeName: next.name,
          mode: next.mode,
          dueAt: dueAt(next.timeout?.afterMinutes),
        })
        await tx.insert(approvalTask).values(
          reviewers.map((reviewer) => ({
            id: generateId(),
            approvalId,
            stepInstanceId: nextStepId,
            channel: 'feishu',
            receiveIdType: 'user_id',
            reviewerExternalId: reviewer.userId,
            reviewerUserId: reviewer.userId,
            reviewerRoleCode: reviewer.roleCode,
          }))
        )
        await tx
          .update(approvalInstance)
          .set({
            mode: next.mode,
            versionNo: instance.versionNo + 1,
            state: { ...instance.state, activeNodeId: next.id },
            updatedAt: new Date(),
          })
          .where(eq(approvalInstance.id, approvalId))
        return {
          status: 'pending',
          approvalStatus: 'pending',
          approvalId,
          shouldResume: false,
        }
      })
    },
    async claimResume(approvalId) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(approvalInstance)
          .where(eq(approvalInstance.id, approvalId))
          .for('update')
          .limit(1)
        if (!row) {
          throw new ApprovalDomainError('APPROVAL_NOT_FOUND', 'Approval not found')
        }
        if (row.status === 'pending') {
          throw new ApprovalDomainError(
            'APPROVAL_CONFLICT',
            'Pending approval cannot resume execution'
          )
        }
        const recoveredStalledClaim = row.resumeStatus === 'starting'
        await tx
          .update(approvalInstance)
          .set({ resumeStatus: 'starting', resumeError: null, updatedAt: new Date() })
          .where(eq(approvalInstance.id, approvalId))
        return {
          approvalId,
          workflowId: row.workflowId,
          executionId: row.executionId,
          contextId: row.contextId,
          approvalStatus: row.status,
          recoveredStalledClaim,
        }
      })
    },
    async markResumeStarted(approvalId, resumeExecutionId) {
      await db
        .update(approvalInstance)
        .set({
          resumeStatus: 'started',
          resumeExecutionId,
          resumeError: null,
          updatedAt: new Date(),
        })
        .where(eq(approvalInstance.id, approvalId))
    },
    async markResumeFailed(approvalId, resumeError) {
      await db
        .update(approvalInstance)
        .set({ resumeStatus: 'failed', resumeError, updatedAt: new Date() })
        .where(eq(approvalInstance.id, approvalId))
    },
  }
}
