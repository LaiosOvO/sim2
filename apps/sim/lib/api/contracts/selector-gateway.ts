import { z } from 'zod'
import { defineRouteContract } from '@/lib/api/contracts/types'

const selectorContextSchema = z
  .object({
    workspaceId: z.string().min(1),
    workflowId: z.string().min(1).optional(),
    oauthCredential: z.string().min(1).optional(),
    serviceId: z.string().min(1).optional(),
    domain: z.string().min(1).optional(),
    teamId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    knowledgeBaseId: z.string().min(1).optional(),
    planId: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    fileId: z.string().min(1).optional(),
    siteId: z.string().min(1).optional(),
    collectionId: z.string().min(1).optional(),
    spreadsheetId: z.string().min(1).optional(),
    driveId: z.string().min(1).optional(),
    excludeWorkflowId: z.string().min(1).optional(),
    baseId: z.string().min(1).optional(),
    datasetId: z.string().min(1).optional(),
    serviceDeskId: z.string().min(1).optional(),
    impersonateUserEmail: z.string().min(1).optional(),
    boardId: z.string().min(1).optional(),
    spaceId: z.string().min(1).optional(),
    listSpaceId: z.string().min(1).optional(),
    folderId: z.string().min(1).optional(),
    awsAccessKeyId: z.string().min(1).optional(),
    awsSecretAccessKey: z.string().min(1).optional(),
    awsRegion: z.string().min(1).optional(),
    logGroupName: z.string().min(1).optional(),
    mcpServerId: z.string().min(1).optional(),
    tableId: z.string().min(1).optional(),
  })
  .strict()

export const selectorGatewayContract = defineRouteContract({
  method: 'POST',
  path: '/api/selectors/query',
  body: z
    .object({
      selectorKey: z.string().min(1).max(100),
      context: selectorContextSchema,
      search: z.string().max(200).optional(),
      detailId: z.string().max(2_000).optional(),
    })
    .strict(),
  response: {
    mode: 'json',
    schema: z.object({
      items: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
        })
      ),
    }),
  },
})
