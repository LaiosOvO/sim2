import type { CustomBlockInputV1 } from '@sim/api-contracts/custom-blocks'

export const CUSTOM_BLOCK_INPUT_TRIGGER_TYPES = new Set([
  'starter',
  'start',
  'start_trigger',
  'api_trigger',
  'input_trigger',
])

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Projects the input interface from an immutable deployment snapshot without
 * importing workflow UI types, the block registry, serializer, or Executor.
 */
export function projectCustomBlockInputs(state: unknown): CustomBlockInputV1[] {
  const root = objectRecord(state)
  const blocks = objectRecord(root?.blocks)
  if (!blocks) return []
  const trigger = Object.values(blocks).find((value) => {
    const block = objectRecord(value)
    return typeof block?.type === 'string' && CUSTOM_BLOCK_INPUT_TRIGGER_TYPES.has(block.type)
  })
  const block = objectRecord(trigger)
  const subBlocks = objectRecord(block?.subBlocks)
  const inputFormat = objectRecord(subBlocks?.inputFormat)
  const config = objectRecord(block?.config)
  const params = objectRecord(config?.params)
  const raw = Array.isArray(inputFormat?.value)
    ? inputFormat.value
    : Array.isArray(params?.inputFormat)
      ? params.inputFormat
      : []

  return raw.flatMap((value) => {
    const field = objectRecord(value)
    if (typeof field?.name !== 'string' || field.name.trim() === '') return []
    return [
      {
        ...(typeof field.id === 'string' && field.id ? { id: field.id } : {}),
        name: field.name,
        type: typeof field.type === 'string' && field.type ? field.type : 'string',
        ...(typeof field.description === 'string' && field.description
          ? { description: field.description }
          : {}),
      },
    ]
  })
}
