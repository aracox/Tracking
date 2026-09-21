import { Fragment } from 'react'
import type { MotionData } from '../../types'
import type { PlaybackEngine } from '../../lib/playback'
import { useEngineState } from '../../hooks/useEngine'
import { fmt } from '../../lib/format'

export function MarkerPanel({ data, engine, selected, onSelect }: { data: MotionData; engine: PlaybackEngine; selected: number | null; onSelect: (i: number | null) => void }) {
  const { index } = useEngineState(engine)
  const M = data.markerCount
  const pu = data.meta.positionUnit
  const vu = data.meta.velocityUnit
  const k = selected === null ? -1 : index * M + selected
  const ok = k >= 0 && !!data.valid[k]
  const velOk = k >= 0 && !!data.validVel?.[k]
  const p = (a: number) => (ok ? fmt(data.positions[k * 3 + a], 1) : '—')
  const v = (a: number) => (velOk ? fmt(data.velocities![k * 3 + a], 1) : '—')
  const sp = velOk ? data.speed![k] : NaN
  const spMs = vu === 'mm/s' ? sp / 1000 : sp

  return (
    <section className="panel">
      <h3>Selected marker</h3>
      <select className="full" value={selected ?? ''} onChange={(e) => onSelect(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">— none —</option>
        {data.markers.map((n, i) => (
          <option key={n} value={i}>{n}</option>
        ))}
      </select>
      {selected !== null && (
        <>
          <div className="marker-name">{data.markers[selected]}</div>
          <div className={`status ${ok ? 'ok' : 'lost'}`}>{ok ? '● Tracked' : '● Tracking lost'}</div>
          <dl className="kv">
            <dt className="group">Position</dt><dd />
            {['X', 'Y', 'Z'].map((l, a) => (<Fragment key={l}><dt>{l}</dt><dd>{p(a)} <u>{pu}</u></dd></Fragment>))}
            <dt className="group">Velocity</dt><dd />
            {['Vx', 'Vy', 'Vz'].map((l, a) => (<Fragment key={l}><dt>{l}</dt><dd>{data.velocities ? v(a) : '—'} <u>{vu}</u></dd></Fragment>))}
            <dt className="group">Speed</dt>
            <dd className="speed">{data.speed ? fmt(spMs, 3) : '—'} <u>{vu === 'mm/s' ? 'm/s' : vu}</u></dd>
          </dl>
        </>
      )}
    </section>
  )
}
