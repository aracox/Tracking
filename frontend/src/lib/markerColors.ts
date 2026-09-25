/** Shared marker colour convention (by name suffix), used by both the 3D scene and
 *  the 2D overlay so a marker reads the same way in either view. */
export const MARKER_HEX = {
  left: '#4da3ff',
  right: '#ff8a4d',
  mid: '#c9d1d9',
  selected: '#ffe14d',
} as const

export type MarkerSide = 'left' | 'right' | 'mid'

export function markerSide(name: string): MarkerSide {
  if (/\sl$/i.test(name)) return 'left'
  if (/\sr$/i.test(name)) return 'right'
  return 'mid'
}

export const markerColorHex = (name: string): string => MARKER_HEX[markerSide(name)]
