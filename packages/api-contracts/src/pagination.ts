import { z } from 'zod'

export const cursorSchema = z.string().min(1).max(2048)

export const pageRequestSchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
})

export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    nextCursor: cursorSchema.nullable(),
  })
}

export type PageRequest = z.infer<typeof pageRequestSchema>
