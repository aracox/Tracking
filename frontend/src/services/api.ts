import type { MotionData, SessionMetadata, SessionPayload, SessionSummary, SkeletonConfig } from '../types'
import { displayScale, writeQualisysAsThree } from '../lib/coords'

// Dev: FastAPI on :8000. Production (Vercel): same origin, /api/* is the serverless function.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? (import.meta.env.PROD ? '' : 'http://localhost:8000')

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) {
    let detail = r.statusText
    try {
      detail = (await r.json()).detail ?? detail
    } catch {
      /* ignore */
    }
    throw new Error(`${r.status}: ${detail}`)
  }
  return r.json() as Promise<T>
}

export const fetchSessions = () => getJson<SessionSummary[]>('/api/sessions')
export const fetchSkeleton = () => getJson<SkeletonConfig>('/api/skeleton')

/** URL for a server-discovered session's camera video (local dev only; data/ is not
 *  deployed on Vercel, so server sessions there never report `hasVideo`). */
export const mediaUrl = (filename: string) => `${BASE}/media/${encodeURIComponent(filename)}`

export type LoadStage = 'uploading' | 'parsing' | 'downloading' | 'preparing'

/** Loads a complete session once; playback afterwards is entirely local. */
export async function loadSession(
  id: string,
  onStage: (s: LoadStage) => void,
): Promise<MotionData> {
  onStage('parsing') // server parses Excel (first request) and caches
  const meta = await getJson<SessionMetadata>(`/api/sessions/${encodeURIComponent(id)}`)
  onStage('downloading')
  const payload = await getJson<SessionPayload>(`/api/sessions/${encodeURIComponent(id)}/data`)
  onStage('preparing')
  await new Promise((r) => setTimeout(r, 0)) // let the UI paint the stage
  return toMotionData(meta, payload)
}

/** Stateless path: upload Pos (+ optional Vel) workbooks; server parses and returns the
 *  normalized session in the same response. Nothing is stored server-side. */
export async function uploadSession(
  position: File,
  velocity: File | null,
  onStage: (s: LoadStage) => void,
): Promise<MotionData> {
  onStage('uploading')
  const form = new FormData()
  form.append('position', position)
  if (velocity) form.append('velocity', velocity)
  const r = await fetch(`${BASE}/api/parse`, { method: 'POST', body: form })
  onStage('parsing')
  if (!r.ok) {
    let detail = r.statusText
    try {
      detail = (await r.json()).detail ?? detail
    } catch {
      if (r.status === 413) detail = 'Upload too large'
    }
    throw new Error(`${r.status}: ${detail}`)
  }
  const { meta, data } = (await r.json()) as { meta: SessionMetadata; data: SessionPayload }
  onStage('preparing')
  await new Promise((res) => setTimeout(res, 0))
  return toMotionData(meta, data)
}

export function toMotionData(meta: SessionMetadata, p: SessionPayload): MotionData {
  const F = p.frames.length
  const M = p.markers.length
  const positions = Float32Array.from(p.positions)
  const valid = Uint8Array.from(p.valid)

  // Bounds of valid samples, in display space.
  const scale = displayScale(meta.positionUnit)
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  const tmp = new Float32Array(3)
  for (let i = 0; i < F * M; i++) {
    if (!valid[i]) continue
    writeQualisysAsThree(tmp, 0, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], scale)
    for (let a = 0; a < 3; a++) {
      if (tmp[a] < min[a]) min[a] = tmp[a]
      if (tmp[a] > max[a]) max[a] = tmp[a]
    }
  }
  if (!Number.isFinite(min[0])) {
    min.fill(-1)
    max.fill(1)
  }

  return {
    meta,
    frameCount: F,
    markerCount: M,
    markers: p.markers,
    frames: Int32Array.from(p.frames),
    timestamps: Float64Array.from(p.timestamps),
    positions,
    valid,
    velocities: p.velocities ? Float32Array.from(p.velocities) : null,
    validVel: p.validVelocity ? Uint8Array.from(p.validVelocity) : null,
    speed: p.speed ? Float32Array.from(p.speed) : null,
    bounds: { min, max },
  }
}
