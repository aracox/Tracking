import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { PlaybackEngine } from '../../lib/playback'

/** Runs `update(index)` inside the render loop only when the engine index changed
 *  or `deps` changed (settings/selection). Imperative: no React state per frame. */
export function useIndexedFrame(
  engine: PlaybackEngine,
  update: (index: number) => void,
  deps: unknown[],
): void {
  const last = useRef(-1)
  const fn = useRef(update)
  fn.current = update
  useEffect(() => {
    last.current = -1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useFrame(() => {
    const i = engine.index
    if (i === last.current) return
    last.current = i
    fn.current(i)
  })
}
