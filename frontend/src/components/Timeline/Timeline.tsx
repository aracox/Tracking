import type { MotionData } from '../../types'
import type { PlaybackEngine } from '../../lib/playback'

/** Scrubber. Works while paused or playing; dragging seeks the engine, which
 *  updates 3D layers immediately (they read the engine each rendered frame). */
export function Timeline({ data, engine, index, selected }: { data: MotionData; engine: PlaybackEngine; index: number; selected: number | null }) {
  const F = data.frameCount
  // Untracked stretches of the selected marker, shown as a strip under the slider.
  const gaps: [number, number][] = []
  if (selected !== null) {
    let start = -1
    for (let f = 0; f <= F; f++) {
      const bad = f < F && !data.valid[f * data.markerCount + selected]
      if (bad && start < 0) start = f
      if (!bad && start >= 0) {
        gaps.push([start, f - 1])
        start = -1
      }
    }
  }
  const pct = (i: number) => `${(i / Math.max(1, F - 1)) * 100}%`
  return (
    <div className="timeline">
      <input
        type="range"
        min={0}
        max={F - 1}
        step={1}
        value={index}
        onChange={(e) => engine.seekIndex(Number(e.target.value))}
        aria-label="Timeline"
      />
      <div className="gaps" title="Untracked samples of the selected marker">
        {gaps.map(([a, b]) => (
          <i key={a} style={{ left: pct(a), width: `calc(${pct(b - a + 1)})` }} />
        ))}
      </div>
    </div>
  )
}
