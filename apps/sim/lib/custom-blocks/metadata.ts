/** Browser-safe custom-block identity and metadata types. */
export const CUSTOM_BLOCK_TYPE_PREFIX = 'custom_block_'

export function isCustomBlockType(type: string | undefined | null): type is string {
  return typeof type === 'string' && type.startsWith(CUSTOM_BLOCK_TYPE_PREFIX)
}

/** A curated output exposed on the block, mapped from a child block output. */
export interface CustomBlockOutput {
  blockId: string
  path: string
  name: string
}

/** A curated consumer input derived from a source workflow's Start block. */
export interface CustomBlockInput {
  id: string
  name: string
  type: string
  placeholder?: string
  description?: string
  required?: boolean
}

/** DB-backed identity and presentation metadata for a published custom block. */
export interface CustomBlockRow {
  type: string
  name: string
  description: string
  workflowId: string
  exposedOutputs?: CustomBlockOutput[]
}
