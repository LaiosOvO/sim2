import type {
  CustomBlockInputOverrideV1,
  CustomBlockInputV1,
  CustomBlockOutputV1,
  CustomBlockV1,
} from '@sim/api-contracts/custom-blocks'
import { db } from '@sim/db'
import {
  customBlock,
  workflow,
  workflowBlocks,
  workflowDeploymentVersion,
  workspace,
} from '@sim/db/schema'
import { and, eq, exists, isNull, sql } from 'drizzle-orm'
import { projectCustomBlockInputs } from '@/modules/custom-blocks/application/project-custom-block-inputs'
import { CustomBlockDomainError } from '@/modules/custom-blocks/errors'
import type {
  CustomBlockRepository,
  PublishCustomBlockRecord,
} from '@/modules/custom-blocks/ports/custom-block-repository'

function applyOverrides(
  fields: readonly CustomBlockInputV1[],
  overrides: readonly CustomBlockInputOverrideV1[] | null
): CustomBlockInputV1[] {
  if (!overrides?.length) return [...fields]
  const byId = new Map(overrides.map((override) => [override.id, override]))
  return fields.map((field) => {
    const override = byId.get(field.id ?? field.name)
    return override
      ? {
          ...field,
          ...(override.placeholder ? { placeholder: override.placeholder } : {}),
          ...(override.required ? { required: true } : {}),
        }
      : field
  })
}

function wireBlock(row: {
  block: typeof customBlock.$inferSelect
  workflowName: string
  workspaceId: string | null
  workspaceName: string | null
  deploymentState: unknown
}): CustomBlockV1 {
  return {
    id: row.block.id,
    organizationId: row.block.organizationId,
    workflowId: row.block.workflowId,
    workflowName: row.workflowName,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    type: row.block.type,
    name: row.block.name,
    description: row.block.description,
    iconUrl: row.block.iconUrl,
    enabled: row.block.enabled,
    inputFields: applyOverrides(
      projectCustomBlockInputs(row.deploymentState),
      row.block.inputs as CustomBlockInputOverrideV1[] | null
    ),
    exposedOutputs: (row.block.outputs ?? []) as CustomBlockOutputV1[],
  }
}

async function loadPublishedBlock(
  database: typeof db,
  id: string,
  organizationId: string
): Promise<CustomBlockV1> {
  const [row] = await database
    .select({
      block: customBlock,
      workflowName: workflow.name,
      workspaceId: workflow.workspaceId,
      workspaceName: workspace.name,
      deploymentState: workflowDeploymentVersion.state,
    })
    .from(customBlock)
    .innerJoin(workflow, eq(workflow.id, customBlock.workflowId))
    .innerJoin(workspace, eq(workspace.id, workflow.workspaceId))
    .leftJoin(
      workflowDeploymentVersion,
      and(
        eq(workflowDeploymentVersion.workflowId, workflow.id),
        eq(workflowDeploymentVersion.isActive, true)
      )
    )
    .where(
      and(
        eq(customBlock.id, id),
        eq(customBlock.organizationId, organizationId),
        eq(workspace.organizationId, customBlock.organizationId)
      )
    )
    .limit(1)
  if (!row) throw new CustomBlockDomainError('Workflow not found')
  return wireBlock(row)
}

async function publish(
  database: typeof db,
  record: PublishCustomBlockRecord
): Promise<CustomBlockV1> {
  const [source] = await database
    .select({
      id: workflow.id,
      name: workflow.name,
      workspaceId: workflow.workspaceId,
      isDeployed: workflow.isDeployed,
      organizationId: workspace.organizationId,
    })
    .from(workflow)
    .leftJoin(workspace, eq(workspace.id, workflow.workspaceId))
    .where(eq(workflow.id, record.workflowId))
    .limit(1)
  if (!source) throw new CustomBlockDomainError('Workflow not found')
  if (!source.isDeployed) {
    throw new CustomBlockDomainError('Workflow must be deployed before publishing as a block')
  }
  if (source.workspaceId !== record.workspaceId) {
    throw new CustomBlockDomainError('You can only publish a workflow from its own workspace')
  }
  if (!source.organizationId || source.organizationId !== record.organizationId) {
    throw new CustomBlockDomainError('Workflow does not belong to this organization')
  }

  const [existing] = await database
    .select({ id: customBlock.id })
    .from(customBlock)
    .where(eq(customBlock.workflowId, record.workflowId))
    .limit(1)
  if (existing) {
    throw new CustomBlockDomainError('This workflow is already published as a block')
  }

  const now = new Date()
  await database.insert(customBlock).values({
    id: record.id,
    organizationId: record.organizationId,
    workflowId: record.workflowId,
    type: record.type,
    name: record.name,
    description: record.description ?? '',
    iconUrl: record.iconUrl ?? null,
    inputs: record.inputs ?? [],
    outputs: record.exposedOutputs ?? [],
    enabled: true,
    createdBy: record.userId,
    createdAt: now,
    updatedAt: now,
  })
  return loadPublishedBlock(database, record.id, record.organizationId)
}

/**
 * Production PostgreSQL adapter. Deployment-input projection stays local and
 * reads the active immutable snapshot, so the independent API never imports the
 * block registry, workflow serializer, or Executor.
 */
export function createDrizzleCustomBlockRepository(
  options: { database?: typeof db } = {}
): CustomBlockRepository {
  const database = options.database ?? db
  return {
    async findWorkspaceOrganization(workspaceId) {
      const [row] = await database
        .select({ organizationId: workspace.organizationId })
        .from(workspace)
        .where(and(eq(workspace.id, workspaceId), isNull(workspace.archivedAt)))
        .limit(1)
      return row?.organizationId
    },
    async listWithInputs(organizationId) {
      const rows = await database
        .select({
          block: customBlock,
          workflowName: workflow.name,
          workspaceId: workflow.workspaceId,
          workspaceName: workspace.name,
          deploymentState: workflowDeploymentVersion.state,
        })
        .from(customBlock)
        .innerJoin(workflow, eq(workflow.id, customBlock.workflowId))
        .innerJoin(workspace, eq(workspace.id, workflow.workspaceId))
        .leftJoin(
          workflowDeploymentVersion,
          and(
            eq(workflowDeploymentVersion.workflowId, workflow.id),
            eq(workflowDeploymentVersion.isActive, true)
          )
        )
        .where(
          and(
            eq(customBlock.organizationId, organizationId),
            eq(workspace.organizationId, customBlock.organizationId)
          )
        )
      return rows.map(wireBlock)
    },
    publish: (record) => publish(database, record),
    async findManageContext(id) {
      const [row] = await database
        .select({
          organizationId: customBlock.organizationId,
          sourceWorkspaceId: workflow.workspaceId,
          type: customBlock.type,
          name: customBlock.name,
        })
        .from(customBlock)
        .innerJoin(workflow, eq(workflow.id, customBlock.workflowId))
        .innerJoin(workspace, eq(workspace.id, workflow.workspaceId))
        .where(
          and(eq(customBlock.id, id), eq(workspace.organizationId, customBlock.organizationId))
        )
        .limit(1)
      return row ?? null
    },
    async update(id, organizationId, patch) {
      const validBinding = database
        .select({ id: workflow.id })
        .from(workflow)
        .innerJoin(workspace, eq(workspace.id, workflow.workspaceId))
        .where(
          and(eq(workflow.id, customBlock.workflowId), eq(workspace.organizationId, organizationId))
        )
      const updated = await database
        .update(customBlock)
        .set({
          updatedAt: new Date(),
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.iconUrl !== undefined ? { iconUrl: patch.iconUrl } : {}),
          ...(patch.inputs !== undefined ? { inputs: patch.inputs } : {}),
          ...(patch.exposedOutputs !== undefined ? { outputs: patch.exposedOutputs } : {}),
        })
        .where(
          and(
            eq(customBlock.id, id),
            eq(customBlock.organizationId, organizationId),
            exists(validBinding)
          )
        )
        .returning({ id: customBlock.id })
      return updated.length === 1
    },
    async delete(id, organizationId) {
      const validBinding = database
        .select({ id: workflow.id })
        .from(workflow)
        .innerJoin(workspace, eq(workspace.id, workflow.workspaceId))
        .where(
          and(eq(workflow.id, customBlock.workflowId), eq(workspace.organizationId, organizationId))
        )
      const deleted = await database
        .delete(customBlock)
        .where(
          and(
            eq(customBlock.id, id),
            eq(customBlock.organizationId, organizationId),
            exists(validBinding)
          )
        )
        .returning({ id: customBlock.id })
      return deleted.length === 1
    },
    async countUsages(organizationId, blockType) {
      const organizationWorkflow = and(
        eq(workspace.organizationId, organizationId),
        isNull(workflow.archivedAt)
      )
      const likePattern = `%${blockType.replace(/[\\%_]/g, '\\$&')}%`
      const [liveRows, deployedRows] = await Promise.all([
        database
          .selectDistinct({ workflowId: workflow.id })
          .from(workflowBlocks)
          .innerJoin(workflow, eq(workflow.id, workflowBlocks.workflowId))
          .innerJoin(workspace, eq(workspace.id, workflow.workspaceId))
          .where(and(eq(workflowBlocks.type, blockType), organizationWorkflow)),
        database
          .select({ workflowId: workflow.id })
          .from(workflowDeploymentVersion)
          .innerJoin(workflow, eq(workflow.id, workflowDeploymentVersion.workflowId))
          .innerJoin(workspace, eq(workspace.id, workflow.workspaceId))
          .where(
            and(
              eq(workflowDeploymentVersion.isActive, true),
              eq(workflow.isDeployed, true),
              organizationWorkflow,
              sql`${workflowDeploymentVersion.state}::text LIKE ${likePattern} ESCAPE '\\'`,
              sql`EXISTS (
                SELECT 1 FROM jsonb_each((${workflowDeploymentVersion.state})::jsonb -> 'blocks') AS b
                WHERE b.value ->> 'type' = ${blockType}
              )`
            )
          ),
      ])
      const using = new Set(liveRows.map((row) => row.workflowId))
      for (const row of deployedRows) using.add(row.workflowId)
      return { usageCount: using.size, deployedUsageCount: deployedRows.length }
    },
  }
}
