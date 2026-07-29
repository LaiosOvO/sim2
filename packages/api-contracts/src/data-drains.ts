import { z } from 'zod'

export const dataDrainIdV1Schema = z.string().min(1)
export const dataDrainRunStatusV1Schema = z.enum(['running', 'success', 'failed'])
export const dataDrainRunTriggerV1Schema = z.enum(['cron', 'manual'])

export const dataDrainRunV1Schema = z.object({
  id: z.string(),
  drainId: z.string(),
  status: dataDrainRunStatusV1Schema,
  trigger: dataDrainRunTriggerV1Schema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  rowsExported: z.number().int(),
  bytesWritten: z.number().int(),
  cursorBefore: z.string().nullable(),
  cursorAfter: z.string().nullable(),
  error: z.string().nullable(),
  locators: z.array(z.string()),
})

export const listDataDrainRunsParamsV1Schema = z.object({
  organizationId: dataDrainIdV1Schema,
  drainId: dataDrainIdV1Schema,
})

export const listDataDrainRunsQueryV1Schema = z.object({
  limit: z
    .preprocess(
      (value) => (typeof value === 'string' ? Number.parseInt(value, 10) : value),
      z.number().int().min(1).max(200)
    )
    .optional()
    .default(25),
})

export const listDataDrainRunsResponseV1Schema = z.object({
  runs: z.array(dataDrainRunV1Schema),
})

export type DataDrainRunV1 = z.infer<typeof dataDrainRunV1Schema>
export type ListDataDrainRunsResponseV1 = z.infer<typeof listDataDrainRunsResponseV1Schema>
