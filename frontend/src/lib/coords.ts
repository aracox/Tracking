/**
 * The ONLY place where Qualisys source coordinates are mapped to Three.js.
 *
 * Qualisys (QTM default lab frame) is right-handed, Z up. Three.js is Y up.
 * Mapping (proper rotation, keeps handedness):
 *      three.x =  qtm.x
 *      three.y =  qtm.z      (up)
 *      three.z = -qtm.y
 *
 * Source data is never modified; this is applied only when writing render buffers.
 */
export function qualisysToThree(x: number, y: number, z: number, scale = 1): [number, number, number] {
  return [x * scale, z * scale, -y * scale]
}

/** Allocation-free variant for per-frame buffer writes. Same mapping as above. */
export function writeQualisysAsThree(
  out: Float32Array | number[],
  offset: number,
  x: number,
  y: number,
  z: number,
  scale: number,
): void {
  out[offset] = x * scale
  out[offset + 1] = z * scale
  out[offset + 2] = -y * scale
}

/** Visualization-only scale: 1000 mm = 1 Three.js unit (metres). */
export function displayScale(positionUnit: string): number {
  return positionUnit === 'mm' ? 0.001 : 1
}
