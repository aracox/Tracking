import type { LayerSettings, OverlayTransform, ViewMode } from '../types'

export interface SavedOverlayState {
  viewMode: ViewMode
  transform: OverlayTransform
  baseScale: number
  videoOffsetSeconds: number
  videoLayer: LayerSettings
  trackingLayer: LayerSettings
}

/** On-disk shape: the reusable settings plus a little metadata for the human (and a
 *  sanity check on load). Display-only — never touches source data. */
interface OverlayFile extends SavedOverlayState {
  session: string
  savedAt: string
}

const isLayer = (v: unknown): v is LayerSettings =>
  typeof v === 'object' && v !== null && typeof (v as LayerSettings).visible === 'boolean' && typeof (v as LayerSettings).opacity === 'number'

const isTransform = (v: unknown): v is OverlayTransform => {
  if (typeof v !== 'object' || v === null) return false
  const t = v as OverlayTransform
  return (
    (t.plane === 'front' || t.plane === 'side' || t.plane === 'top') &&
    typeof t.mirrorX === 'boolean' &&
    typeof t.mirrorY === 'boolean' &&
    typeof t.rotationDeg === 'number' &&
    typeof t.scale === 'number' &&
    typeof t.offsetX === 'number' &&
    typeof t.offsetY === 'number'
  )
}

/** Serializes and triggers a browser download of `<sessionId>_overlay.json`. Nothing
 *  is sent to the server — this is a local file, save it wherever you like. */
export function downloadOverlayState(sessionId: string, state: SavedOverlayState): void {
  const file: OverlayFile = { session: sessionId, savedAt: new Date().toISOString(), ...state }
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sessionId}_overlay.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Parses and validates a loaded overlay JSON file's text. Returns null (rather than
 *  throwing) for anything malformed, so the caller can show a plain "invalid file". */
export function parseOverlayFile(text: string): SavedOverlayState | null {
  try {
    const j = JSON.parse(text) as Partial<OverlayFile>
    if (
      (j.viewMode !== '3d' && j.viewMode !== 'overlay2d') ||
      typeof j.baseScale !== 'number' ||
      typeof j.videoOffsetSeconds !== 'number' ||
      !isTransform(j.transform) ||
      !isLayer(j.videoLayer) ||
      !isLayer(j.trackingLayer)
    ) {
      return null
    }
    const { viewMode, transform, baseScale, videoOffsetSeconds, videoLayer, trackingLayer } = j
    return { viewMode, transform, baseScale, videoOffsetSeconds, videoLayer, trackingLayer }
  } catch {
    return null
  }
}
