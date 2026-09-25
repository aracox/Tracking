import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { LayerSettings, MotionData, OverlayTransform, ViewSettings } from '../../types'
import type { PlaybackEngine } from '../../lib/playback'
import { displayScale, writeQualisysAsThree } from '../../lib/coords'
import { markerColorHex, MARKER_HEX } from '../../lib/markerColors'
import { applyTransform, computeAutoFit, containRect, projectPlane } from '../../lib/overlay'
import './Overlay2D.css'

export interface Overlay2DApi {
  /** Recomputes scale/pan (keeping mirror/rotation) so the whole session's tracked
   *  points fit the video frame. Display-only. */
  autoFit(): void
}

interface Props {
  data: MotionData
  engine: PlaybackEngine
  settings: ViewSettings
  selected: number | null
  skeletonPairs: [number, number][]
  videoUrl: string
  videoOffsetSeconds: number
  transform: OverlayTransform
  videoLayer: LayerSettings
  trackingLayer: LayerSettings
  onVideoDuration: (seconds: number) => void
  onAutoFitResult: (patch: { scale: number; offsetX: number; offsetY: number }) => void
  /** Pan (drag) / zoom (wheel) live-adjust the transform for manual alignment. */
  onNudge: (dx: number, dy: number, scaleFactor: number) => void
}

const MARKER_RADIUS = 4.5
const DRIFT_CORRECT_PLAYING = 0.15 // seconds
const DRIFT_CORRECT_PAUSED = 0.02

/**
 * Flat 2D view: the camera video with the tracked markers/skeleton projected and
 * manually aligned on top (see lib/overlay.ts — no camera calibration is available,
 * so this is an eyeballed approximation, not a calibrated projection). Replaces the
 * free-orbit 3D scene while active, per the "lock to 2D during overlay" design.
 */
export const Overlay2D = forwardRef<Overlay2DApi, Props>(function Overlay2D(
  {
    data,
    engine,
    settings,
    selected,
    skeletonPairs,
    videoUrl,
    videoOffsetSeconds,
    transform,
    videoLayer,
    trackingLayer,
    onVideoDuration,
    onAutoFitResult,
    onNudge,
  },
  ref,
) {
  const container = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const size = useRef({ w: 0, h: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const scale = displayScale(data.meta.positionUnit)
  const M = data.markerCount

  // Keep canvas backing store matching container size (device-pixel sharp).
  useEffect(() => {
    const el = container.current!
    const cv = canvas.current!
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      size.current = { w: el.clientWidth, h: el.clientHeight }
      cv.width = Math.max(1, Math.round(el.clientWidth * dpr))
      cv.height = Math.max(1, Math.round(el.clientHeight * dpr))
      draw(engine.index)
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // Video <-> engine time sync. `engine.time` already equals the Qualisys "Time"
  // column value (seconds since the QTM capture started) — for this camera export
  // that lines up with the video's own 0-based timeline (video duration ~= the
  // mocap's last Time value, even though the exported table starts partway through
  // at frame 122), so no `- t0` here. `videoOffsetSeconds` is left as a manual
  // fine-tune for sessions where that assumption doesn't hold exactly.
  //
  // Native playback drifts from the rAF-driven engine, so we nudge
  // playbackRate/currentTime rather than setting currentTime every tick.
  useEffect(() => {
    const v = video.current!
    const sync = () => {
      const duration = Number.isFinite(v.duration) ? v.duration : Infinity
      const wanted = Math.min(Math.max(engine.time + videoOffsetSeconds, 0), duration)
      const drift = Math.abs(v.currentTime - wanted)
      // A sparsely-keyframed video can take a while to decode into a seek target;
      // re-issuing currentTime before that finishes (v.seeking) just restarts the
      // decode and the video never settles on a frame. Let each seek complete first.
      if (v.seeking) return
      if (engine.playing) {
        v.playbackRate = Math.min(Math.max(engine.speed, 0.0625), 16)
        if (v.paused) v.play().catch(() => undefined)
        if (drift > DRIFT_CORRECT_PLAYING) v.currentTime = wanted
      } else {
        if (!v.paused) v.pause()
        if (drift > DRIFT_CORRECT_PAUSED) v.currentTime = wanted
      }
    }
    sync()
    return engine.subscribe(sync)
  }, [engine, videoOffsetSeconds])

  // Redraw the tracking canvas whenever the engine advances/seeks.
  useEffect(() => {
    const unsub = engine.subscribe(() => draw(engine.index))
    draw(engine.index)
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, settings, selected, skeletonPairs, transform, trackingLayer.visible])

  function autoFit(): void {
    const el = container.current
    const v = video.current
    if (!el) return
    const rect = containRect(el.clientWidth, el.clientHeight, v?.videoWidth ?? 0, v?.videoHeight ?? 0)
    // Fit to the whole session's tracked extent (not just the current frame) so the
    // alignment stays valid as playback moves.
    const points: [number, number][] = []
    const pt = new Float32Array(3)
    for (let i = 0; i < data.frameCount * M; i++) {
      if (!data.valid[i]) continue
      writeQualisysAsThree(pt, 0, data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2], scale)
      points.push(projectPlane(transform.plane, pt[0], pt[1], pt[2]))
    }
    onAutoFitResult(computeAutoFit(points, transform, rect.w, rect.h))
  }

  useImperativeHandle(ref, () => ({ autoFit }))

  function draw(f: number): void {
    const cv = canvas.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const { w, h } = size.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (!trackingLayer.visible) return

    const v = video.current
    const rect = containRect(w, h, v?.videoWidth ?? 0, v?.videoHeight ?? 0)
    ctx.save()
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2)

    const pt = new Float32Array(3)
    const project = (k: number): [number, number] => {
      writeQualisysAsThree(pt, 0, data.positions[k * 3], data.positions[k * 3 + 1], data.positions[k * 3 + 2], scale)
      const [u, vv] = projectPlane(transform.plane, pt[0], pt[1], pt[2])
      return applyTransform(u, vv, transform)
    }

    if (settings.trails) {
      const w2 = settings.trailWindow
      const start = w2 === 'full' ? 0 : Math.max(0, f - Math.round((w2 as number) * data.meta.sampleRate))
      const markers = settings.trailMode === 'all' ? data.markers.map((_, i) => i) : selected !== null ? [selected] : []
      for (const m of markers) {
        ctx.strokeStyle = settings.trailMode === 'all' ? 'rgba(154,209,255,0.5)' : MARKER_HEX.selected
        ctx.lineWidth = 1
        ctx.beginPath()
        let open = false
        for (let i = Math.max(1, start + 1); i <= f; i++) {
          const k0 = (i - 1) * M + m
          const k1 = i * M + m
          if (!data.valid[k0] || !data.valid[k1]) {
            open = false
            continue
          }
          const [x0, y0] = project(k0)
          const [x1, y1] = project(k1)
          if (!open) {
            ctx.moveTo(x0, y0)
            open = true
          }
          ctx.lineTo(x1, y1)
        }
        ctx.stroke()
      }
    }

    if (settings.skeleton) {
      ctx.strokeStyle = 'rgba(143,180,217,0.85)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (const [i, j] of skeletonPairs) {
        const ki = f * M + i
        const kj = f * M + j
        if (!data.valid[ki] || !data.valid[kj]) continue
        const [x0, y0] = project(ki)
        const [x1, y1] = project(kj)
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
      }
      ctx.stroke()
    }

    if (settings.velocity && data.velocities && data.validVel) {
      ctx.strokeStyle = '#3ddc97'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let m = 0; m < M; m++) {
        const k = f * M + m
        if (!data.valid[k] || !data.validVel[k]) continue
        const [x0, y0] = project(k)
        const h = settings.velocityHorizon
        const ex = data.positions[k * 3] + data.velocities[k * 3] * h
        const ey = data.positions[k * 3 + 1] + data.velocities[k * 3 + 1] * h
        const ez = data.positions[k * 3 + 2] + data.velocities[k * 3 + 2] * h
        writeQualisysAsThree(pt, 0, ex, ey, ez, scale)
        const [u, vv] = projectPlane(transform.plane, pt[0], pt[1], pt[2])
        const [x1, y1] = applyTransform(u, vv, transform)
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
      }
      ctx.stroke()
    }

    if (settings.markers) {
      for (let m = 0; m < M; m++) {
        const k = f * M + m
        if (!data.valid[k]) continue
        const [x, y] = project(k)
        const isSel = m === selected
        ctx.beginPath()
        ctx.arc(x, y, isSel ? MARKER_RADIUS * 1.5 : MARKER_RADIUS, 0, Math.PI * 2)
        ctx.fillStyle = isSel ? MARKER_HEX.selected : markerColorHex(data.markers[m])
        ctx.fill()
        if (settings.labels) {
          ctx.font = '10px ui-monospace, monospace'
          ctx.fillStyle = '#cfd8e3'
          ctx.textBaseline = 'bottom'
          ctx.shadowColor = '#000'
          ctx.shadowBlur = 3
          ctx.fillText(data.markers[m], x + 6, y - 4)
          ctx.shadowBlur = 0
        }
      }
    }
    ctx.restore()
  }

  return (
    <div
      className="overlay2d"
      ref={container}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const dx = e.clientX - drag.current.x
        const dy = e.clientY - drag.current.y
        drag.current = { x: e.clientX, y: e.clientY }
        onNudge(dx, dy, 1)
      }}
      onPointerUp={() => (drag.current = null)}
      onWheel={(e) => {
        e.preventDefault()
        onNudge(0, 0, Math.exp(-e.deltaY * 0.001))
      }}
    >
      <video
        ref={video}
        className="overlay2d-video"
        src={videoUrl}
        muted
        playsInline
        style={{ opacity: videoLayer.opacity, visibility: videoLayer.visible ? 'visible' : 'hidden' }}
        onLoadedMetadata={(e) => {
          onVideoDuration(e.currentTarget.duration)
          autoFit() // sensible first-run alignment; the user fine-tunes from here
        }}
      />
      <canvas
        ref={canvas}
        className="overlay2d-canvas"
        style={{ opacity: trackingLayer.opacity, visibility: trackingLayer.visible ? 'visible' : 'hidden' }}
      />
    </div>
  )
})
