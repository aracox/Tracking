import type { OverlayPlane, OverlayTransform } from '../types'

export const PLANE_LABELS: Record<OverlayPlane, string> = {
  front: 'Front (X-Z)',
  side: 'Side (Y-Z)',
  top: 'Top (X-Y)',
}

export const DEFAULT_OVERLAY_TRANSFORM: OverlayTransform = {
  plane: 'front',
  mirrorX: false,
  mirrorY: false,
  rotationDeg: 0,
  scale: 100,
  offsetX: 0,
  offsetY: 0,
}

/**
 * Picks two of the three qualisys->three mapped display-space axes (see coords.ts)
 * to flatten a 3D point into 2D. This is a manual, orthographic approximation for
 * eyeballing alignment against the video — NOT a calibrated camera projection. No
 * camera calibration (position/orientation/lens) is available for the source video,
 * so a pixel-accurate projection isn't possible; see README.
 */
export function projectPlane(plane: OverlayPlane, x: number, y: number, z: number): [number, number] {
  switch (plane) {
    case 'front':
      return [x, y] // horizontal = qtm X, vertical = qtm Z (up)
    case 'side':
      return [z, y] // horizontal = qtm Y, vertical = qtm Z (up)
    case 'top':
      return [x, z] // horizontal = qtm X, vertical = qtm Y
  }
}

/** Maps a projected (u, v) display-space point to pixels relative to the video
 *  frame's centre, applying the user's manual mirror/rotate/scale/pan alignment. */
export function applyTransform(u: number, v: number, t: OverlayTransform): [number, number] {
  const uu = t.mirrorX ? -u : u
  const vv = t.mirrorY ? -v : v
  const rad = (t.rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const ru = uu * cos - vv * sin
  const rv = uu * sin + vv * cos
  return [ru * t.scale + t.offsetX, -(rv * t.scale) + t.offsetY] // screen y grows downward
}

/** Solves scale + pan so the given projected points centre and roughly fill the
 *  video rect, keeping the transform's current mirror/rotation. Display-only. */
export function computeAutoFit(
  points: [number, number][],
  transform: Pick<OverlayTransform, 'mirrorX' | 'mirrorY' | 'rotationDeg'>,
  rectW: number,
  rectH: number,
  marginFrac = 0.82,
): { scale: number; offsetX: number; offsetY: number } {
  if (points.length === 0 || rectW <= 0 || rectH <= 0) {
    return { scale: DEFAULT_OVERLAY_TRANSFORM.scale, offsetX: 0, offsetY: 0 }
  }
  const rad = (transform.rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  let minRu = Infinity
  let maxRu = -Infinity
  let minNv = Infinity
  let maxNv = -Infinity
  for (const [u, v] of points) {
    const uu = transform.mirrorX ? -u : u
    const vv = transform.mirrorY ? -v : v
    const ru = uu * cos - vv * sin
    const nv = -(uu * sin + vv * cos)
    if (ru < minRu) minRu = ru
    if (ru > maxRu) maxRu = ru
    if (nv < minNv) minNv = nv
    if (nv > maxNv) maxNv = nv
  }
  const rangeU = Math.max(maxRu - minRu, 1e-6)
  const rangeV = Math.max(maxNv - minNv, 1e-6)
  const scale = Math.min((rectW * marginFrac) / rangeU, (rectH * marginFrac) / rangeV)
  return { scale, offsetX: -((minRu + maxRu) / 2) * scale, offsetY: -((minNv + maxNv) / 2) * scale }
}

/** The rectangle (in container pixels) a video renders into under object-fit: contain. */
export function containRect(
  containerW: number,
  containerH: number,
  mediaW: number,
  mediaH: number,
): { x: number; y: number; w: number; h: number } {
  if (!mediaW || !mediaH) return { x: 0, y: 0, w: containerW, h: containerH }
  const scale = Math.min(containerW / mediaW, containerH / mediaH)
  const w = mediaW * scale
  const h = mediaH * scale
  return { x: (containerW - w) / 2, y: (containerH - h) / 2, w, h }
}
