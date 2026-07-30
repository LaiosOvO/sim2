/**
 * Output names projected by every custom block. This browser-safe module is the
 * single validation seam shared by contracts, editor UI, persistence, and the
 * heavier block-config implementation.
 */
export const RESERVED_CUSTOM_BLOCK_OUTPUT_NAMES = new Set(['success', 'error', 'cost'])

export function isReservedCustomBlockOutputName(name: string): boolean {
  return RESERVED_CUSTOM_BLOCK_OUTPUT_NAMES.has(name.trim().toLowerCase())
}
