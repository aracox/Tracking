import { useRef, useState, type ChangeEvent } from 'react'
import type { LayerSettings, OverlayPlane, OverlayTransform } from '../../types'
import { PLANE_LABELS } from '../../lib/overlay'
import { parseOverlayFile, type SavedOverlayState } from '../../lib/overlayFile'
import { fmt } from '../../lib/format'

interface Props {
  transform: OverlayTransform
  onTransform: (patch: Partial<OverlayTransform>) => void
  onAutoFit: () => void
  onReset: () => void
  /** Downloads the current alignment/layers/offset as a JSON file. */
  onSave: () => void
  /** Applies a previously-saved overlay state (already parsed and validated). */
  onLoad: (state: SavedOverlayState) => void
  /** The scale Auto-fit/Reset last settled on; the Scale slider reads/writes
   *  transform.scale as a percentage of this, so its range stays stable as you drag. */
  baseScale: number
  videoLayer: LayerSettings
  trackingLayer: LayerSettings
  onVideoLayer: (patch: Partial<LayerSettings>) => void
  onTrackingLayer: (patch: Partial<LayerSettings>) => void
  videoOffsetSeconds: number
  onVideoOffset: (v: number) => void
  videoDuration: number | null
  mocapDuration: number
}

const PLANES: OverlayPlane[] = ['front', 'side', 'top']

/** Manual alignment + layer controls for the 2D video overlay. No camera calibration
 *  is available for the source video, so alignment is eyeballed (drag to pan, wheel
 *  to zoom on the view itself; fine controls here). Display-only — never touches
 *  source data. */
export function OverlayControls({
  transform,
  onTransform,
  onAutoFit,
  onReset,
  onSave,
  onLoad,
  baseScale,
  videoLayer,
  trackingLayer,
  onVideoLayer,
  onTrackingLayer,
  videoOffsetSeconds,
  onVideoOffset,
  videoDuration,
  mocapDuration,
}: Props) {
  const offsetRange = Math.max(mocapDuration, videoDuration ?? mocapDuration, 1) + 1
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef<number>()
  const handleSave = () => {
    onSave()
    setSaved(true)
    window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setSaved(false), 1500)
  }

  const fileInput = useRef<HTMLInputElement>(null)
  const [loadStatus, setLoadStatus] = useState<'ok' | 'error' | null>(null)
  const loadTimer = useRef<number>()
  const flashLoadStatus = (status: 'ok' | 'error') => {
    setLoadStatus(status)
    window.clearTimeout(loadTimer.current)
    loadTimer.current = window.setTimeout(() => setLoadStatus(null), 1500)
  }
  const handleFileChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-choosing the same file next time
    if (!file) return
    const parsed = parseOverlayFile(await file.text())
    if (parsed) {
      onLoad(parsed)
      flashLoadStatus('ok')
    } else {
      flashLoadStatus('error')
    }
  }
  const loadLabel = loadStatus === 'ok' ? 'Loaded ✓' : loadStatus === 'error' ? 'Invalid file' : 'Load'

  return (
    <section className="panel overlay-controls">
      <h3>Layers</h3>
      <div className="layer-row">
        <label><input type="checkbox" checked={videoLayer.visible} onChange={(e) => onVideoLayer({ visible: e.target.checked })} /> Video</label>
        <input type="range" min={0} max={1} step={0.01} value={videoLayer.opacity} onChange={(e) => onVideoLayer({ opacity: Number(e.target.value) })} />
      </div>
      <div className="layer-row">
        <label><input type="checkbox" checked={trackingLayer.visible} onChange={(e) => onTrackingLayer({ visible: e.target.checked })} /> Tracking</label>
        <input type="range" min={0} max={1} step={0.01} value={trackingLayer.opacity} onChange={(e) => onTrackingLayer({ opacity: Number(e.target.value) })} />
      </div>

      <h3 className="sub">2D overlay</h3>
      <div className="row">
        <span>Plane</span>
        <select value={transform.plane} onChange={(e) => onTransform({ plane: e.target.value as OverlayPlane })}>
          {PLANES.map((p) => (
            <option key={p} value={p}>{PLANE_LABELS[p]}</option>
          ))}
        </select>
      </div>
      <div className="checks two">
        <label><input type="checkbox" checked={transform.mirrorX} onChange={(e) => onTransform({ mirrorX: e.target.checked })} /> Mirror X</label>
        <label><input type="checkbox" checked={transform.mirrorY} onChange={(e) => onTransform({ mirrorY: e.target.checked })} /> Mirror Y</label>
      </div>
      <div className="row">
        <span>Rotation</span>
        <input type="range" min={-180} max={180} step={1} value={transform.rotationDeg} onChange={(e) => onTransform({ rotationDeg: Number(e.target.value) })} />
        <b>{transform.rotationDeg}°</b>
      </div>
      <div className="row">
        <span>Scale</span>
        <input
          type="range"
          min={20}
          max={300}
          step={1}
          value={Math.round((transform.scale / baseScale) * 100)}
          onChange={(e) => onTransform({ scale: baseScale * (Number(e.target.value) / 100) })}
        />
        <b>{Math.round((transform.scale / baseScale) * 100)}%</b>
      </div>
      <div className="row">
        <span>Position</span>
        <span className="position-readout">
          X <b>{Math.round(transform.offsetX)}</b>px&nbsp;&nbsp;Y <b>{Math.round(transform.offsetY)}</b>px
        </span>
      </div>
      <p className="muted hint">Drag the view to pan — position above updates live — scroll to zoom. No camera calibration, so align by eye.</p>
      <div className="btn-row">
        <button onClick={onAutoFit}>Auto-fit</button>
        <button onClick={onReset}>Reset</button>
      </div>
      <div className="btn-row">
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={handleFileChosen} />
        <button
          className={loadStatus === 'error' ? 'load-error' : ''}
          onClick={() => fileInput.current?.click()}
          title="Load a previously-saved <session>_overlay.json"
        >
          {loadLabel}
        </button>
        <button className="save-btn" onClick={handleSave} title="Save alignment, layers and video offset as a .json file">
          {saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      <h3 className="sub">Video sync</h3>
      <div className="row">
        <span>Offset</span>
        <input
          type="range"
          min={-offsetRange}
          max={offsetRange}
          step={0.01}
          value={videoOffsetSeconds}
          onChange={(e) => onVideoOffset(Number(e.target.value))}
        />
        <b>{fmt(videoOffsetSeconds, 2)} s</b>
      </div>
      <p className="muted hint">
        Nudge until the video matches the tracked motion.{' '}
        {videoDuration !== null ? `Video is ${fmt(videoDuration, 2)} s.` : ''}
      </p>
    </section>
  )
}
