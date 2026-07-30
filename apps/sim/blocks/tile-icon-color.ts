import { isLightColor } from '@/lib/colors'

const LIGHT_TILE_THRESHOLD = 0.75

/**
 * True when a block tile is light enough that a white foreground icon would
 * wash out. Gradients and unknown values are treated as dark.
 */
export function isLightTileColor(bgColor: string | null | undefined): boolean {
  return Boolean(bgColor) && isLightColor(bgColor as string, LIGHT_TILE_THRESHOLD)
}

/** Returns the foreground class for an icon rendered inside a block tile. */
export function getTileIconColorClass(
  bgColor: string | null | undefined,
  important = false
): string {
  if (isLightTileColor(bgColor)) return important ? '!text-black' : 'text-black'
  return important ? '!text-white' : 'text-white'
}
