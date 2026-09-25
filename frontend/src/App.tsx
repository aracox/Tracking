import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchDefaultOverlay, fetchSessions, fetchSkeleton } from './services/api'
import { useSession, type SessionSource } from './hooks/useSession'
import { useVideoUrl } from './hooks/useVideoUrl'
import { useHotkeys } from './hooks/useHotkeys'
import { PlaybackEngine } from './lib/playback'
import { resolveSkeletonPairs } from './lib/skeletonPairs'
import { DEFAULT_OVERLAY_TRANSFORM } from './lib/overlay'
import { downloadOverlayState, type SavedOverlayState } from './lib/overlayFile'
import type { LayerSettings, OverlayTransform, SessionSummary, SkeletonConfig, TrailWindow, ViewMode, ViewSettings } from './types'
import { Scene3D, type SceneApi } from './components/Scene3D/Scene3D'
import { Overlay2D, type Overlay2DApi } from './components/Overlay2D/Overlay2D'
import { OverlayControls } from './components/Overlay2D/OverlayControls'
import { PlaybackControls } from './components/PlaybackControls/PlaybackControls'
import { MarkerPanel } from './components/MarkerPanel/MarkerPanel'
import { Charts } from './components/Charts/Charts'
import { SessionInfo, SessionList, UploadPanel } from './components/SessionPanel/SessionPanel'

const DEFAULT_LAYER: LayerSettings = { visible: true, opacity: 1 }

const DEFAULTS: ViewSettings = {
  markers: true,
  skeleton: true,
  labels: false,
  trails: true,
  trailMode: 'selected',
  trailWindow: 1,
  velocity: false,
  velocityHorizon: 0.25,
  grid: true,
  axes: true,
}

const STAGE_TEXT = {
  uploading: 'Uploading files…',
  parsing: 'Parsing Position and Velocity data…',
  downloading: 'Downloading normalized session…',
  preparing: 'Preparing visualization…',
} as const

const TRAIL_OPTIONS: { label: string; value: TrailWindow }[] = [
  { label: '0.25 s', value: 0.25 },
  { label: '0.5 s', value: 0.5 },
  { label: '1 s', value: 1 },
  { label: '2 s', value: 2 },
  { label: 'Full', value: 'full' },
]

export default function App() {
  const engine = useMemo(() => new PlaybackEngine(), [])
  const sceneApi = useRef<SceneApi>(null)
  const overlayApi = useRef<Overlay2DApi>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [skeleton, setSkeleton] = useState<SkeletonConfig>({ connections: [] })
  const [source, setSource] = useState<SessionSource | null>(null)
  const [selected, setSelected] = useState<number | null>(0)
  const [settings, setSettings] = useState<ViewSettings>(DEFAULTS)

  const [viewMode, setViewMode] = useState<ViewMode>('3d')
  const [overlayTransform, setOverlayTransform] = useState<OverlayTransform>(DEFAULT_OVERLAY_TRANSFORM)
  // Anchor for the Scale slider's percentage readout — the scale Auto-fit/Reset last
  // settled on. Wheel-zoom still edits transform.scale directly; the slider just
  // shows/sets it relative to this anchor so its range doesn't jump around.
  const [baseScale, setBaseScale] = useState(DEFAULT_OVERLAY_TRANSFORM.scale)
  const [videoOffsetSeconds, setVideoOffsetSeconds] = useState(0)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)
  const [videoLayer, setVideoLayer] = useState<LayerSettings>(DEFAULT_LAYER)
  const [trackingLayer, setTrackingLayer] = useState<LayerSettings>(DEFAULT_LAYER)

  const state = useSession(source)
  const serverId = source?.kind === 'server' ? source.id : null
  const openServer = (id: string) => setSource({ kind: 'server', id })
  const data = state.status === 'ready' ? state.data : null
  const videoUrl = useVideoUrl(source, data)
  const skeletonPairs = useMemo(() => (data ? resolveSkeletonPairs(data.markers, skeleton) : []), [data, skeleton])

  const refresh = () =>
    fetchSessions()
      .then((s) => {
        setSessions(s)
        setListError(null)
        setSource((cur) => cur ?? (s.find((x) => !x.error) ? { kind: 'server', id: s.find((x) => !x.error)!.id } : null))
      })
      .catch((e) => setListError(String(e.message ?? e)))

  useEffect(() => {
    refresh()
    fetchSkeleton().then(setSkeleton).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (data) {
      engine.load(data.timestamps)
      setSelected((s) => (s !== null && s < data.markerCount ? s : 0))
      // Overlay alignment is per-video; a new session starts from a clean slate.
      // (Use Load in the 2D overlay panel to restore a previously-saved .json.)
      setViewMode('3d')
      setOverlayTransform(DEFAULT_OVERLAY_TRANSFORM)
      setBaseScale(DEFAULT_OVERLAY_TRANSFORM.scale)
      setVideoOffsetSeconds(0)
      setVideoDuration(null)
      setVideoLayer(DEFAULT_LAYER)
      setTrackingLayer(DEFAULT_LAYER)

      // If data/<id>_overlay.json exists (the same file Save produces, dropped in by
      // convention), apply it as the starting alignment so it's already correct by
      // the time the user switches to 2D overlay - no manual Load needed.
      let cancelled = false
      fetchDefaultOverlay(data.meta.id).then((saved) => {
        if (cancelled || !saved) return
        setOverlayTransform(saved.transform)
        setBaseScale(saved.baseScale)
        setVideoOffsetSeconds(saved.videoOffsetSeconds)
        setVideoLayer(saved.videoLayer)
        setTrackingLayer(saved.trackingLayer)
      })
      return () => {
        cancelled = true
      }
    }
  }, [data, engine])

  const set = <K extends keyof ViewSettings>(k: K, v: ViewSettings[K]) => setSettings((s) => ({ ...s, [k]: v }))
  const toggle = (k: 'markers' | 'skeleton' | 'labels' | 'trails' | 'velocity' | 'grid' | 'axes') =>
    setSettings((s) => ({ ...s, [k]: !s[k] }))

  useHotkeys({
    Space: () => engine.toggle(),
    ArrowLeft: () => engine.step(-1),
    ArrowRight: () => engine.step(1),
    'Shift+ArrowLeft': () => engine.jump(-0.5),
    'Shift+ArrowRight': () => engine.jump(0.5),
    Home: () => engine.seekIndex(0),
    End: () => engine.seekIndex(engine.count - 1),
    r: () => sceneApi.current?.reset(),
    f: () => sceneApi.current?.fit(),
    t: () => toggle('trails'),
    v: () => toggle('velocity'),
    s: () => toggle('skeleton'),
  })

  const checks: [keyof ViewSettings, string][] = [
    ['markers', 'Markers'],
    ['skeleton', 'Skeleton'],
    ['labels', 'Marker labels'],
    ['trails', 'Trails'],
    ['velocity', 'Velocity vectors'],
    ['grid', 'Grid'],
    ['axes', 'XYZ axes'],
  ]

  return (
    <div className="app">
      <header>
        <img className="logo" src="/cutip-logo.png" alt="CUTIP" />
        <h1>CUTIP research project</h1>
        <label>
          Session
          <select value={serverId ?? ''} onChange={(e) => openServer(e.target.value)}>
            {serverId === null && <option value="">{source?.kind === 'upload' ? `Uploaded: ${source.position.name}` : '—'}</option>}
            {sessions.map((s) => (
              <option key={s.id} value={s.id} disabled={!!s.error}>{s.id}</option>
            ))}
          </select>
        </label>
        <button onClick={refresh} title="Rescan data/ folder">↻ Rescan</button>
        <span className="spacer" />
        {videoUrl && (
          <div className="view-mode">
            <button className={viewMode === '3d' ? 'active' : ''} onClick={() => setViewMode('3d')}>3D</button>
            <button className={viewMode === 'overlay2d' ? 'active' : ''} onClick={() => setViewMode('overlay2d')}>2D overlay</button>
          </div>
        )}
        {viewMode === '3d' ? (
          <div className="camera-btns">
            <button onClick={() => sceneApi.current?.reset()} title="Reset camera (R)">Reset camera</button>
            <button onClick={() => sceneApi.current?.fit()} title="Fit to data (F)">Fit</button>
          </div>
        ) : (
          <div className="camera-btns">
            <button onClick={() => overlayApi.current?.autoFit()} title="Auto-fit tracking to video">Auto-fit</button>
          </div>
        )}
      </header>

      <div className="main">
        <aside className="left">
          <SessionList sessions={sessions} active={serverId} onOpen={openServer} />
          <UploadPanel
            active={source?.kind === 'upload' ? source.position.name : null}
            onOpen={(position, velocity, video) => setSource({ kind: 'upload', position, velocity, video })}
          />
          {data && (
            <section className="panel markers">
              <h3>Markers</h3>
              <ul>
                {data.markers.map((n, i) => {
                  const lost = data.meta.trackingLoss.some((t) => t.marker === n)
                  return (
                    <li key={n} className={i === selected ? 'active' : ''} onClick={() => setSelected(i)}>
                      {n}{lost && <span className="dot-warn" title="Has tracking loss">●</span>}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </aside>

        <div className="center">
          {listError && <div className="overlay error">Cannot reach backend: {listError}<br />Start it with <code>scripts/run_dev.sh</code></div>}
          {!listError && sessions.length === 0 && !source && <div className="overlay">No sessions on the server. Use <b>Open files</b> (left) to load a <code>*_Pos.xlsx</code> and optionally its <code>*_Vel.xlsx</code>.</div>}
          {state.status === 'loading' && (
            <div className="overlay">
              <div className="spinner" />
              <div>Loading session <b>{state.id}</b>…</div>
              <div className="muted">{STAGE_TEXT[state.stage]}</div>
            </div>
          )}
          {state.status === 'error' && <div className="overlay error">Failed to load <b>{state.id}</b>: {state.message}</div>}
          {data && viewMode === '3d' && (
            <Scene3D
              ref={sceneApi}
              key={data.meta.id}
              data={data}
              engine={engine}
              settings={settings}
              selected={selected}
              onSelect={setSelected}
              skeleton={skeleton}
            />
          )}
          {data && viewMode === 'overlay2d' && videoUrl && (
            <Overlay2D
              ref={overlayApi}
              key={data.meta.id}
              data={data}
              engine={engine}
              settings={settings}
              selected={selected}
              skeletonPairs={skeletonPairs}
              videoUrl={videoUrl}
              videoOffsetSeconds={videoOffsetSeconds}
              transform={overlayTransform}
              videoLayer={videoLayer}
              trackingLayer={trackingLayer}
              onVideoDuration={setVideoDuration}
              onAutoFitResult={(patch) => {
                setOverlayTransform((t) => ({ ...t, ...patch }))
                setBaseScale(patch.scale)
              }}
              onNudge={(dx, dy, scaleFactor) =>
                setOverlayTransform((t) => ({
                  ...t,
                  offsetX: t.offsetX + dx,
                  offsetY: t.offsetY + dy,
                  scale: Math.min(Math.max(t.scale * scaleFactor, 2), 20000),
                }))
              }
            />
          )}
        </div>

        <aside className="right">
          {data && <MarkerPanel data={data} engine={engine} selected={selected} onSelect={setSelected} />}
          {data && videoUrl && viewMode === 'overlay2d' && (
            <OverlayControls
              transform={overlayTransform}
              onTransform={(patch) => setOverlayTransform((t) => ({ ...t, ...patch }))}
              onAutoFit={() => overlayApi.current?.autoFit()}
              onReset={() => {
                setOverlayTransform(DEFAULT_OVERLAY_TRANSFORM)
                setBaseScale(DEFAULT_OVERLAY_TRANSFORM.scale)
              }}
              onSave={() =>
                downloadOverlayState(data.meta.id, {
                  viewMode,
                  transform: overlayTransform,
                  baseScale,
                  videoOffsetSeconds,
                  videoLayer,
                  trackingLayer,
                })
              }
              onLoad={(saved: SavedOverlayState) => {
                const hasVideo = data.meta.hasVideo || (source?.kind === 'upload' && !!source.video)
                setViewMode(saved.viewMode === 'overlay2d' && hasVideo ? 'overlay2d' : '3d')
                setOverlayTransform(saved.transform)
                setBaseScale(saved.baseScale)
                setVideoOffsetSeconds(saved.videoOffsetSeconds)
                setVideoLayer(saved.videoLayer)
                setTrackingLayer(saved.trackingLayer)
              }}
              baseScale={baseScale}
              videoLayer={videoLayer}
              trackingLayer={trackingLayer}
              onVideoLayer={(patch) => setVideoLayer((l) => ({ ...l, ...patch }))}
              onTrackingLayer={(patch) => setTrackingLayer((l) => ({ ...l, ...patch }))}
              videoOffsetSeconds={videoOffsetSeconds}
              onVideoOffset={setVideoOffsetSeconds}
              videoDuration={videoDuration}
              mocapDuration={data.meta.duration}
            />
          )}
          <section className="panel">
            <h3>Display</h3>
            <div className="checks">
              {checks.map(([k, label]) => (
                <label key={k}>
                  <input type="checkbox" checked={settings[k] as boolean} onChange={() => toggle(k as never)} /> {label}
                </label>
              ))}
            </div>
            <div className="row">
              <span>Trail mode</span>
              <label><input type="radio" name="tm" checked={settings.trailMode === 'selected'} onChange={() => set('trailMode', 'selected')} /> Selected</label>
              <label><input type="radio" name="tm" checked={settings.trailMode === 'all'} onChange={() => set('trailMode', 'all')} /> All</label>
            </div>
            <div className="row">
              <span>Trail length</span>
              <select value={String(settings.trailWindow)} onChange={(e) => set('trailWindow', e.target.value === 'full' ? 'full' : Number(e.target.value))}>
                {TRAIL_OPTIONS.map((o) => (<option key={o.label} value={String(o.value)}>{o.label}</option>))}
              </select>
            </div>
            <div className="row">
              <span>Vector horizon</span>
              <input type="range" min={0.01} max={0.5} step={0.01} value={settings.velocityHorizon} onChange={(e) => set('velocityHorizon', Number(e.target.value))} />
              <b>{settings.velocityHorizon.toFixed(2)} s</b>
            </div>
          </section>
          {data && <SessionInfo data={data} />}
          <p className="keys muted">Space play · ←/→ step · Shift+←/→ jump · Home/End · R reset · F fit · T trail · V vectors · S skeleton</p>
        </aside>
      </div>

      {data && (
        <>
          <PlaybackControls data={data} engine={engine} selected={selected} />
          <Charts data={data} engine={engine} selected={selected} />
        </>
      )}
    </div>
  )
}
