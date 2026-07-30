import type { ApprovalApiEventV1, ApprovalAuditLogV1 } from '@sim/api-contracts/approvals'
import { db } from '@sim/db'
import {
  approvalDefinition,
  approvalDefinitionVersion,
  auditLog,
  user,
  workflow,
} from '@sim/db/schema'
import { generateShortId } from '@sim/utils/id'
import { desc, eq, inArray } from 'drizzle-orm'
import type { ApprovalAuditPort, ApprovalRepository } from '@/modules/approvals/ports'

const actionNames: Record<string, string> = {
  APPROVAL_APPROVE: 'approval.approved',
  APPROVAL_REJECT: 'approval.rejected',
  APPROVAL_RETURN: 'approval.returned',
  APPROVAL_TRANSFER: 'approval.transferred',
  APPROVAL_ADD_SIGN: 'approval.add_sign',
  APPROVAL_COMMENT: 'approval.comment',
  APPROVAL_INSTANCE_STARTED: 'approval.started',
  APPROVAL_RESUME_RETRIED: 'approval.resume_retried',
  APPROVAL_DEFINITION_CREATED: 'approval.definition_created',
  APPROVAL_DEFINITION_VERSION_CREATED: 'approval.definition_version_created',
  APPROVAL_DEFINITION_VERSION_PUBLISHED: 'approval.definition_version_published',
}

function category(action: string): ApprovalApiEventV1['category'] {
  if (action === 'approval.card_sent') return 'card_sent'
  if (action === 'approval.approved') return 'approved'
  if (action === 'approval.rejected') return 'rejected'
  if (action === 'approval.returned') return 'returned'
  return 'write'
}

function searchMatches(values: Array<string | null | undefined>, search?: string): boolean {
  const normalized = search?.trim().toLowerCase()
  return !normalized || values.some((value) => value?.toLowerCase().includes(normalized))
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key]
  return typeof field === 'string' && field.trim() ? field : null
}

export function createDrizzleApprovalAudit(repository: ApprovalRepository): ApprovalAuditPort {
  return {
    async record(input) {
      const forwarded = input.request.headers.get('x-forwarded-for')
      await db.insert(auditLog).values({
        id: generateShortId(),
        workspaceId: input.workspaceId,
        actorId: input.actor.type === 'user' ? input.actor.id : null,
        actorName: input.actor.name,
        actorEmail: input.actor.email,
        action: actionNames[input.action] ?? input.action.toLowerCase(),
        resourceType: 'approval',
        resourceId: input.resourceId,
        resourceName: input.resourceName,
        description: input.action,
        metadata: {
          organizationId: input.organizationId,
          requestId: input.requestId,
          ...(input.metadata ?? {}),
        },
        ipAddress:
          forwarded?.split(',')[0]?.trim() ?? input.request.headers.get('x-real-ip') ?? 'unknown',
        userAgent: input.request.headers.get('user-agent'),
      })
    },
    async list(input) {
      const approvals = await repository.listApprovals({
        workspaceId: input.workspaceId,
        status: input.status,
        view: 'all',
        limit: Math.min(200, Math.max(input.limit, 100)),
        actorId: input.actorId,
      })
      const workflowIds = [...new Set(approvals.map((approval) => approval.workflowId))]
      const versionIds = [
        ...new Set(
          approvals.flatMap((approval) =>
            approval.definitionVersionId ? [approval.definitionVersionId] : []
          )
        ),
      ]
      const actorIds = [
        ...new Set(
          approvals.flatMap((approval) => [
            ...(approval.requestedBy ? [approval.requestedBy] : []),
            ...approval.tasks.flatMap((task) => (task.reviewerUserId ? [task.reviewerUserId] : [])),
            ...approval.decisions.flatMap((decision) =>
              decision.actorExternalId ? [decision.actorExternalId] : []
            ),
          ])
        ),
      ]
      const [workflowRows, versionRows, actorRows] = await Promise.all([
        workflowIds.length
          ? db
              .select({ id: workflow.id, name: workflow.name })
              .from(workflow)
              .where(inArray(workflow.id, workflowIds))
          : [],
        versionIds.length
          ? db
              .select({
                id: approvalDefinitionVersion.id,
                version: approvalDefinitionVersion.version,
                definitionName: approvalDefinition.name,
              })
              .from(approvalDefinitionVersion)
              .innerJoin(
                approvalDefinition,
                eq(approvalDefinitionVersion.definitionId, approvalDefinition.id)
              )
              .where(inArray(approvalDefinitionVersion.id, versionIds))
          : [],
        actorIds.length
          ? db
              .select({ id: user.id, name: user.name, email: user.email })
              .from(user)
              .where(inArray(user.id, actorIds))
          : [],
      ])
      const workflowsById = new Map(workflowRows.map((row) => [row.id, row.name]))
      const versionsById = new Map(versionRows.map((row) => [row.id, row]))
      const actorsById = new Map(actorRows.map((row) => [row.id, row]))
      const logs = approvals
        .flatMap((approval): ApprovalAuditLogV1[] => {
          const projectId = approval.businessId
          const projectName = stringField(approval.state, 'projectName')
          const workflowName = workflowsById.get(approval.workflowId) ?? null
          const version = approval.definitionVersionId
            ? versionsById.get(approval.definitionVersionId)
            : undefined
          if (input.workflowId && approval.workflowId !== input.workflowId) return []
          if (input.projectId && projectId !== input.projectId) return []
          if (
            !searchMatches(
              [
                approval.title,
                approval.content,
                approval.id,
                approval.executionId,
                workflowName,
                projectId,
                projectName,
                version?.definitionName,
              ],
              input.search
            )
          ) {
            return []
          }
          return [
            {
              ...approval,
              workflowName,
              projectId,
              projectName,
              approvalFlowName: version?.definitionName ?? null,
              approvalFlowVersion: version?.version ?? null,
              requestedByUser: approval.requestedBy
                ? (actorsById.get(approval.requestedBy) ?? null)
                : null,
              actorDirectory: actorRows.filter((actor) =>
                [
                  approval.requestedBy,
                  ...approval.tasks.map((task) => task.reviewerUserId),
                  ...approval.decisions.map((decision) => decision.actorExternalId),
                ].includes(actor.id)
              ),
            },
          ]
        })
        .slice(0, input.limit)

      const rawEvents = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.workspaceId, input.workspaceId))
        .orderBy(desc(auditLog.createdAt))
        .limit(400)
      const apiEvents = rawEvents
        .flatMap((event): ApprovalApiEventV1[] => {
          const eventCategory = category(event.action)
          if (input.eventCategory && input.eventCategory !== eventCategory) return []
          const metadata =
            event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
              ? (event.metadata as Record<string, unknown>)
              : {}
          if (
            !searchMatches(
              [
                event.action,
                event.actorName,
                event.actorEmail,
                event.resourceId,
                event.resourceName,
                event.description,
                stringField(metadata, 'executionId'),
                stringField(metadata, 'projectId'),
              ],
              input.search
            )
          ) {
            return []
          }
          return [
            {
              id: event.id,
              category: eventCategory,
              action: event.action,
              actorId: event.actorId,
              actorName: event.actorName,
              actorEmail: event.actorEmail,
              resourceId: event.resourceId,
              resourceName: event.resourceName,
              description: event.description,
              metadata,
              createdAt: event.createdAt.toISOString(),
            },
          ]
        })
        .slice(0, input.limit)
      return { logs, apiEvents }
    },
  }
}
