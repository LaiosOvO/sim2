import { z } from 'zod'

const nullableText = z.string().nullable()
const isoTimestamp = z.string().datetime()

export const workspaceBootstrapQueryV1Schema = z.object({
  workspaceId: z.string().min(1),
})

export const workspaceBootstrapResponseV1Schema = z.object({
  session: z.object({
    user: z.object({
      id: z.string().min(1),
      name: nullableText.optional(),
      email: z.string().email().nullable().optional(),
    }),
  }),
  workflows: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      description: nullableText,
      folderId: nullableText,
      updatedAt: isoTimestamp,
      isDeployed: z.boolean(),
    })
  ),
  folders: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      parentId: nullableText,
    })
  ),
  chats: z.array(
    z.object({
      id: z.string().uuid(),
      title: nullableText,
      updatedAt: isoTimestamp,
      pinned: z.boolean(),
      activeStreamId: nullableText,
    })
  ),
  files: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      path: z.string(),
      type: z.string(),
      size: z.number().int().nonnegative(),
      updatedAt: isoTimestamp,
    })
  ),
})

export type WorkspaceBootstrapQueryV1 = z.infer<typeof workspaceBootstrapQueryV1Schema>
export type WorkspaceBootstrapResponseV1 = z.infer<typeof workspaceBootstrapResponseV1Schema>
