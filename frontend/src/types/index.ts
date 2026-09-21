export interface SessionSummary {
  id: string
  positionFile: string
  velocityFile: string | null
  hasVelocity: boolean
  frameCount: number | null
  markerCount: number | null
  sampleRate: number | null
  error: string | null
}

export interface TrackingLoss {
  marker: string
  invalidSamples: number
  ranges: [number, number][] // original Qualisys frames, inclusive
}

export interface SessionMetadata {
  id: string
  positionFile: string
  velocityFile: string | null
  hasVelocity: boolean
  frameCount: number
  firstFrame: number
  lastFrame: number
  sampleRate: number
  duration: number
  markers: string[]
  positionUnit: string
  velocityUnit: string
  positionChannels: number
  velocityChannels: number
  missingSamples: number
  invalidReasons: Record<string, number>
  trackingLoss: TrackingLoss[]
  warnings: string[]
}

/** Wire format: flat row-major arrays, index = (frame * M + marker) * 3 + axis. */
export interface SessionPayload {
  frames: number[]
  timestamps: number[]
  markers: string[]
  positions: number[]
  valid: number[]
  velocities: number[] | null
  validVelocity: number[] | null
  speed: number[] | null
}

/** In-browser motion data. Positions/velocities are RAW source values (source
 *  units); `valid*` masks decide what may be drawn. */
export interface MotionData {
  meta: SessionMetadata
  frameCount: number
  markerCount: number
  markers: string[]
  frames: Int32Array
  timestamps: Float64Array
  positions: Float32Array
  valid: Uint8Array
  velocities: Float32Array | null
  validVel: Uint8Array | null
  speed: Float32Array | null
  /** Bounds of valid positions in Three.js display space (min xyz, max xyz). */
  bounds: { min: [number, number, number]; max: [number, number, number] }
}

export interface SkeletonConfig {
  connections: [string, string][]
}

export type TrailWindow = number | 'full' // seconds

export interface ViewSettings {
  markers: boolean
  skeleton: boolean
  labels: boolean
  trails: boolean
  trailMode: 'selected' | 'all'
  trailWindow: TrailWindow
  velocity: boolean
  velocityHorizon: number // seconds; display-only
  grid: boolean
  axes: boolean
}
