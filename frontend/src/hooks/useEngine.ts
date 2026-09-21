import { useEffect, useState } from 'react'
import type { PlaybackEngine } from '../lib/playback'

export interface EngineSnapshot {
  index: number
  time: number
  playing: boolean
  speed: number
}

const snap = (e: PlaybackEngine): EngineSnapshot => ({
  index: e.index,
  time: e.time,
  playing: e.playing,
  speed: e.speed,
})

/** React view of the engine for readouts/sliders. Throttled while playing so the
 *  React tree updates at most ~`hz` times per second; 3D layers do NOT use this. */
export function useEngineState(engine: PlaybackEngine, hz = 30): EngineSnapshot {
  const [s, setS] = useState(() => snap(engine))
  useEffect(() => {
    let last = 0
    let timer: number | undefined
    const flush = () => {
      timer = undefined
      last = performance.now()
      setS(snap(engine))
    }
    const unsub = engine.subscribe(() => {
      const wait = 1000 / hz - (performance.now() - last)
      if (!engine.playing || wait <= 0) {
        if (timer !== undefined) clearTimeout(timer)
        flush()
      } else if (timer === undefined) {
        timer = window.setTimeout(flush, wait)
      }
    })
    flush()
    return () => {
      unsub()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [engine, hz])
  return s
}
