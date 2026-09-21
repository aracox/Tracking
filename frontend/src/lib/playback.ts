/**
 * Browser-side playback engine. Time is expressed in the source timestamp domain
 * (seconds). The source frame shown is the sample nearest to the playback time, so
 * a 300 Hz recording plays back correctly on any display refresh rate.
 *
 * The engine is a plain object (not React state) so 3D layers can read `index`
 * every animation frame without re-rendering React.
 */
export const PLAYBACK_SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2, 4] as const

export class PlaybackEngine {
  private ts: Float64Array = new Float64Array(0)
  private listeners = new Set<() => void>()
  private raf = 0
  private lastNow = 0
  time = 0
  index = 0
  playing = false
  speed = 1

  get count(): number {
    return this.ts.length
  }
  get startTime(): number {
    return this.ts.length ? this.ts[0] : 0
  }
  get endTime(): number {
    return this.ts.length ? this.ts[this.ts.length - 1] : 0
  }

  load(timestamps: Float64Array): void {
    this.pause()
    this.ts = timestamps
    this.time = this.startTime
    this.index = 0
    this.emit()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Index of the sample nearest to time t (binary search). */
  indexAtTime(t: number): number {
    const ts = this.ts
    const n = ts.length
    if (n === 0) return 0
    if (t <= ts[0]) return 0
    if (t >= ts[n - 1]) return n - 1
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (ts[mid] <= t) lo = mid
      else hi = mid
    }
    return t - ts[lo] <= ts[hi] - t ? lo : hi
  }

  play(): void {
    if (this.playing || this.count === 0) return
    if (this.index >= this.count - 1) this.seekIndex(0)
    this.playing = true
    this.lastNow = 0
    if (typeof requestAnimationFrame === 'function') this.raf = requestAnimationFrame(this.loop)
    this.emit()
  }

  pause(): void {
    if (!this.playing) return
    this.playing = false
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf)
    this.emit()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  setSpeed(s: number): void {
    this.speed = s
    this.emit()
  }

  seekIndex(i: number): void {
    if (this.count === 0) return
    this.index = Math.min(this.count - 1, Math.max(0, Math.round(i)))
    this.time = this.ts[this.index]
    this.emit()
  }

  seekTime(t: number): void {
    if (this.count === 0) return
    this.time = Math.min(this.endTime, Math.max(this.startTime, t))
    this.index = this.indexAtTime(this.time)
    this.emit()
  }

  step(n: number): void {
    this.pause()
    this.seekIndex(this.index + n)
  }

  /** Jump by wall-clock seconds of recording time (keeps playing state). */
  jump(seconds: number): void {
    this.seekTime(this.time + seconds)
  }

  /** Advance by dt seconds of real time (scaled by speed). Public for tests. */
  tick(dt: number): void {
    if (!this.playing) return
    this.time = Math.min(this.endTime, this.time + dt * this.speed)
    this.index = this.indexAtTime(this.time)
    if (this.time >= this.endTime) {
      this.playing = false
    }
    this.emit()
  }

  private loop = (now: number): void => {
    if (!this.playing) return
    if (this.lastNow) this.tick(Math.min((now - this.lastNow) / 1000, 0.25))
    this.lastNow = now
    if (this.playing) this.raf = requestAnimationFrame(this.loop)
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }
}
