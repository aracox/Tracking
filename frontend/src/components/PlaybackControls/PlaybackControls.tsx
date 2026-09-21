import type { MotionData } from '../../types'
import { PLAYBACK_SPEEDS, type PlaybackEngine } from '../../lib/playback'
import { useEngineState } from '../../hooks/useEngine'
import { Timeline } from '../Timeline/Timeline'
import { fmt } from '../../lib/format'

const JUMP_SECONDS = 0.5

export function PlaybackControls({ data, engine, selected }: { data: MotionData; engine: PlaybackEngine; selected: number | null }) {
  const s = useEngineState(engine)
  const t0 = data.timestamps[0]
  return (
    <div className="playback">
      <div className="transport">
        <button title="First frame (Home)" onClick={() => engine.seekIndex(0)}>|◀</button>
        <button title={`Jump back ${JUMP_SECONDS}s (Shift+←)`} onClick={() => engine.jump(-JUMP_SECONDS)}>◀◀</button>
        <button title="Previous frame (←)" onClick={() => engine.step(-1)}>◁</button>
        <button className="primary" title="Play / Pause (Space)" onClick={() => engine.toggle()}>
          {s.playing ? '❚❚' : '▶'}
        </button>
        <button title="Next frame (→)" onClick={() => engine.step(1)}>▷</button>
        <button title={`Jump forward ${JUMP_SECONDS}s (Shift+→)`} onClick={() => engine.jump(JUMP_SECONDS)}>▶▶</button>
        <button title="Last frame (End)" onClick={() => engine.seekIndex(data.frameCount - 1)}>▶|</button>

        <label className="speed">
          Speed
          <select value={s.speed} onChange={(e) => engine.setSpeed(Number(e.target.value))}>
            {PLAYBACK_SPEEDS.map((v) => (
              <option key={v} value={v}>{v}×</option>
            ))}
          </select>
        </label>

        <div className="readout">
          <span>Index <b>{s.index}</b> / {data.frameCount - 1}</span>
          <span>Qualisys frame <b>{data.frames[s.index]}</b></span>
          <span>Time <b>{fmt(s.time - t0, 3)}</b> / {fmt(data.timestamps[data.frameCount - 1] - t0, 3)} s</span>
        </div>
      </div>
      <Timeline data={data} engine={engine} index={s.index} selected={selected} />
    </div>
  )
}
