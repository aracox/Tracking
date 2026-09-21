import { describe, expect, it } from 'vitest'
import { PlaybackEngine } from './playback'
import { qualisysToThree } from './coords'

const ts = (n: number, t0 = 0.40333, hz = 300) => Float64Array.from({ length: n }, (_, i) => t0 + i / hz)

describe('PlaybackEngine', () => {
  it('maps time to nearest sample using timestamps', () => {
    const e = new PlaybackEngine()
    e.load(ts(1205))
    expect(e.indexAtTime(0)).toBe(0)
    expect(e.indexAtTime(0.40333 + 1.0)).toBe(300)
    expect(e.indexAtTime(0.40333 + 1.0 + 0.0016)).toBe(300)
    expect(e.indexAtTime(1e9)).toBe(1204)
  })

  it('advances by elapsed time and speed, independent of refresh rate', () => {
    const e = new PlaybackEngine()
    e.load(ts(1205))
    e.playing = true
    for (let i = 0; i < 60; i++) e.tick(1 / 60) // 1 s at 60 Hz
    expect(e.index).toBe(300)
    e.seekIndex(0)
    e.playing = true
    e.setSpeed(0.5)
    for (let i = 0; i < 120; i++) e.tick(1 / 120) // 1 s at 120 Hz, half speed
    expect(e.index).toBe(150)
  })

  it('stops at the end and restarts from 0 on play', () => {
    const e = new PlaybackEngine()
    e.load(ts(10))
    e.playing = true
    e.tick(10)
    expect(e.index).toBe(9)
    expect(e.playing).toBe(false)
    e.play()
    expect(e.index).toBe(0)
    e.pause()
  })

  it('steps, clamps and seeks while paused', () => {
    const e = new PlaybackEngine()
    e.load(ts(10))
    e.step(-1)
    expect(e.index).toBe(0)
    e.step(3)
    expect(e.index).toBe(3)
    e.seekIndex(99)
    expect(e.index).toBe(9)
    let calls = 0
    e.subscribe(() => calls++)
    e.seekIndex(2)
    expect(calls).toBe(1)
  })
})

describe('coords', () => {
  it('is a right-handed Z-up -> Y-up rotation', () => {
    expect(qualisysToThree(1, 2, 3)).toEqual([1, 3, -2])
    expect(qualisysToThree(1000, 0, 500, 0.001)).toEqual([1, 0.5, -0])
  })
})
