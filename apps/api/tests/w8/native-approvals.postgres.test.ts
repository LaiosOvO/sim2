import { describe, expect, it } from 'vitest'

const disposableDatabaseEnabled =
  process.env.SIM_TEST_DATABASE_DISPOSABLE === '1' && Boolean(process.env.DATABASE_URL)

if (process.env.SIM_REQUIRE_POSTGRES_TEST === '1' && !disposableDatabaseEnabled) {
  throw new Error('PostgreSQL integration requires DATABASE_URL and SIM_TEST_DATABASE_DISPOSABLE=1')
}

describe.runIf(disposableDatabaseEnabled)('native W8 approval PostgreSQL adapter', () => {
  it('holds tenant, idempotency, immutable decision and late-decision semantics', async () => {
    const [{ db }, schema, { and, eq }, { createDrizzleApprovalRepository }] = await Promise.all([
      import('@sim/db'),
      import('@sim/db/schema'),
      import('drizzle-orm'),
      import('@/modules/approvals/infrastructure/drizzle-approval-repository'),
    ])
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const userId = `w8-user-${suffix}`
    const organizationId = `w8-org-${suffix}`
    const workspaceId = `w8-workspace-${suffix}`
    const workflowId = `w8-workflow-${suffix}`
    const executionId = `w8-execution-${suffix}`
    const contextId = `w8-context-${suffix}`
    const code = `release_${Date.now()}`
    const now = new Date()
    const spec = {
      nodes: [
        { id: 'start', type: 'start' as const },
        {
          id: 'review',
          type: 'approval' as const,
          name: 'Review',
          mode: 'any' as const,
          candidates: [{ kind: 'user' as const, userId }],
          isDecision: true,
        },
        { id: 'end', type: 'end' as const },
      ],
      edges: [
        { from: 'start', to: 'review' },
        { from: 'review', to: 'end', condition: 'approve' as const },
      ],
    }

    try {
      await db.insert(schema.user).values({
        id: userId,
        name: 'W8 reviewer',
        email: `${userId}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      await db.insert(schema.organization).values({
        id: organizationId,
        name: 'W8 organization',
        slug: organizationId,
      })
      await db.insert(schema.workspace).values({
        id: workspaceId,
        name: 'W8 workspace',
        ownerId: userId,
        billedAccountUserId: userId,
        organizationId,
        workspaceMode: 'organization',
      })
      await db.insert(schema.workflow).values({
        id: workflowId,
        userId,
        workspaceId,
        name: 'W8 workflow',
        lastSynced: now,
        createdAt: now,
        updatedAt: now,
      })

      const repository = createDrizzleApprovalRepository()
      const definition = await repository.createDefinition(
        {
          workspaceId,
          code,
          name: 'Release',
          spec,
        },
        userId
      )
      const draft = definition.versions[0]!
      const published = await repository.publishVersion(definition.id, draft.id)
      const startInput = {
        workspaceId,
        workflowId,
        executionId,
        contextId,
        definitionVersionId: published.id,
        title: 'Approve release',
        content: 'Release details',
        businessType: 'workflow',
      }
      const first = await repository.start(startInput, userId)
      const duplicate = await repository.start(startInput, userId)
      expect(duplicate.id).toBe(first.id)
      expect(first.tasks).toHaveLength(1)

      const result = await repository.decide(
        first.id,
        { taskId: first.tasks[0]!.id, action: 'approve' },
        userId
      )
      expect(result).toMatchObject({
        status: 'terminal',
        approvalStatus: 'approved',
        shouldResume: true,
      })
      const claim = await repository.claimResume(first.id)
      expect(claim).toMatchObject({
        executionId,
        contextId,
        recoveredStalledClaim: true,
      })
      await repository.markResumeStarted(first.id, executionId)
      const late = await repository.decide(
        first.id,
        { taskId: first.tasks[0]!.id, action: 'approve' },
        userId
      )
      expect(late).toMatchObject({
        status: 'already_decided',
        approvalStatus: 'approved',
        shouldResume: false,
      })
      const decisions = await db
        .select()
        .from(schema.approvalDecision)
        .where(eq(schema.approvalDecision.approvalId, first.id))
      expect(decisions).toHaveLength(1)
      await expect(
        repository.listApprovals({
          workspaceId: `other-${workspaceId}`,
          view: 'all',
          limit: 50,
          actorId: userId,
        })
      ).resolves.toEqual([])
    } finally {
      const instances = await db
        .select({ id: schema.approvalInstance.id })
        .from(schema.approvalInstance)
        .where(
          and(
            eq(schema.approvalInstance.executionId, executionId),
            eq(schema.approvalInstance.contextId, contextId)
          )
        )
      for (const instance of instances) {
        await db.delete(schema.approvalInstance).where(eq(schema.approvalInstance.id, instance.id))
      }
      const definitions = await db
        .select({ id: schema.approvalDefinition.id })
        .from(schema.approvalDefinition)
        .where(
          and(
            eq(schema.approvalDefinition.workspaceId, workspaceId),
            eq(schema.approvalDefinition.code, code)
          )
        )
      for (const definition of definitions) {
        await db
          .delete(schema.approvalDefinition)
          .where(eq(schema.approvalDefinition.id, definition.id))
      }
      await db.delete(schema.workflow).where(eq(schema.workflow.id, workflowId))
      await db.delete(schema.workspace).where(eq(schema.workspace.id, workspaceId))
      await db.delete(schema.organization).where(eq(schema.organization.id, organizationId))
      await db.delete(schema.user).where(eq(schema.user.id, userId))
    }
  })
})
