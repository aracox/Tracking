import type { MotionData, SessionSummary } from '../../types'
import { fmt } from '../../lib/format'

export function SessionList({ sessions, active, onOpen }: { sessions: SessionSummary[]; active: string | null; onOpen: (id: string) => void }) {
  return (
    <section className="panel sessions">
      <h3>Available sessions</h3>
      {sessions.length === 0 && <p className="muted">No <code>*_Pos.xlsx</code> files found in <code>data/</code>.</p>}
      <ul>
        {sessions.map((s) => (
          <li key={s.id} className={s.id === active ? 'active' : ''} onClick={() => onOpen(s.id)}>
            <div className="s-name">● {s.id}</div>
            {s.error ? (
              <div className="s-err" title={s.error}>unreadable file</div>
            ) : (
              <div className="s-meta">
                {s.frameCount} frames · {s.markerCount} markers · {s.sampleRate} Hz
                <br />
                {s.hasVelocity ? 'Pos + Vel' : 'Position only'}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SessionInfo({ data }: { data: MotionData }) {
  const m = data.meta
  const lossNames = m.trackingLoss.map((t) => t.marker)
  return (
    <section className="panel">
      <h3>Session info</h3>
      <dl className="kv info">
        <dt>Session</dt><dd>{m.id}</dd>
        <dt>Position file</dt><dd>{m.positionFile}</dd>
        <dt>Velocity file</dt><dd>{m.velocityFile ?? '—'}</dd>
        <dt>Frame count</dt><dd>{m.frameCount}</dd>
        <dt>First / last frame</dt><dd>{m.firstFrame} / {m.lastFrame}</dd>
        <dt>Sampling</dt><dd>{m.sampleRate} Hz</dd>
        <dt>Duration</dt><dd>{fmt(m.duration, 3)} s</dd>
        <dt>Markers</dt><dd>{m.markers.length}</dd>
        <dt>Position channels</dt><dd>{m.positionChannels}</dd>
        <dt>Velocity channels</dt><dd>{m.velocityChannels}</dd>
        <dt>Units</dt><dd>{m.positionUnit} · {m.velocityUnit} <span className="muted">(assumed)</span></dd>
        <dt>Missing samples</dt><dd>{m.missingSamples}</dd>
        <dt>Markers w/ loss</dt><dd>{lossNames.length ? lossNames.join(', ') : 'none'}</dd>
      </dl>
      {m.trackingLoss.map((t) => (
        <p key={t.marker} className="loss">
          <b>{t.marker}</b>: {t.invalidSamples} samples, frames {t.ranges.map((r) => `${r[0]}–${r[1]}`).join(', ')}
        </p>
      ))}
      {m.warnings.map((w) => (
        <p key={w} className="warn">⚠ {w}</p>
      ))}
    </section>
  )
}
