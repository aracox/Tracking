import { describe, expect, it, vi } from 'vitest'
import { downloadOverlayState, parseOverlayFile, type SavedOverlayState } from './overlayFile'
import { DEFAULT_OVERLAY_TRANSFORM } from './overlay'

const sample: SavedOverlayState = {
  viewMode: 'overlay2d',
  transform: { ...DEFAULT_OVERLAY_TRANSFORM, rotationDeg: 12, scale: 250, offsetX: 80, offsetY: -40 },
  baseScale: 250,
  videoOffsetSeconds: 0.37,
  videoLayer: { visible: true, opacity: 0.8 },
  trackingLayer: { visible: false, opacity: 1 },
}

describe('parseOverlayFile', () => {
  it('round-trips what downloadOverlayState writes', () => {
    let written = ''
    const a = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined })
    vi.stubGlobal(
      'Blob',
      class {
        constructor(parts: string[]) {
          written = parts[0]
        }
      },
    )
    vi.stubGlobal('document', { createElement: () => a })

    downloadOverlayState('test1', sample)

    expect(a.download).toBe('test1_overlay.json')
    expect(a.click).toHaveBeenCalledOnce()
    const parsed = parseOverlayFile(written)
    expect(parsed).toEqual(sample)
    const raw = JSON.parse(written)
    expect(raw.session).toBe('test1')
    expect(typeof raw.savedAt).toBe('string')

    vi.unstubAllGlobals()
  })

  it('rejects malformed JSON', () => {
    expect(parseOverlayFile('not json')).toBeNull()
  })

  it('rejects valid JSON missing required fields', () => {
    expect(parseOverlayFile(JSON.stringify({ viewMode: '3d' }))).toBeNull()
  })

  it('rejects an invalid plane or malformed layer', () => {
    const bad = { ...sample, transform: { ...sample.transform, plane: 'diagonal' } }
    expect(parseOverlayFile(JSON.stringify(bad))).toBeNull()
    const badLayer = { ...sample, videoLayer: { visible: true } }
    expect(parseOverlayFile(JSON.stringify(badLayer))).toBeNull()
  })
})
