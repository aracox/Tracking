import { useMemo } from 'react'
import type { MotionData } from '../../types'
import type { PlaybackEngine } from '../../lib/playback'
import { SeriesChart, type ChartSeries } from './SeriesChart'

const COLORS = ['#ff6b6b', '#5cdb8b', '#5aa9ff']

function channel(
  arr: Float32Array,
  valid: Uint8Array,
  F: number,
  M: number,
  m: number,
  axis: number,
  mul = 1,
): (number | null)[] {
  const out: (number | null)[] = new Array(F)
  for (let f = 0; f < F; f++) {
    const k = f * M + m
    out[f] = valid[k] ? arr[k * 3 + axis] * mul : null // gaps where untracked
  }
  return out
}

export function Charts({ data, engine, selected }: { data: MotionData; engine: PlaybackEngine; selected: number | null }) {
  const x = useMemo(() => Array.from(data.timestamps), [data])
  const F = data.frameCount
  const M = data.markerCount
  const m = selected ?? 0

  // Built once per session/marker selection; never per animation frame.
  const pos = useMemo<ChartSeries[]>(
    () => ['X', 'Y', 'Z'].map((l, a) => ({ label: l, color: COLORS[a], values: channel(data.positions, data.valid, F, M, m, a) })),
    [data, F, M, m],
  )
  const vel = useMemo<ChartSeries[] | null>(
    () =>
      data.velocities && data.validVel
        ? ['Vx', 'Vy', 'Vz'].map((l, a) => ({ label: l, color: COLORS[a], values: channel(data.velocities!, data.validVel!, F, M, m, a) }))
        : null,
    [data, F, M, m],
  )
  const spd = useMemo<ChartSeries[] | null>(() => {
    if (!data.speed) return null
    const toMs = data.meta.velocityUnit === 'mm/s' ? 0.001 : 1 // display: m/s
    const values: (number | null)[] = new Array(F)
    for (let f = 0; f < F; f++) {
      const v = data.speed![f * M + m]
      values[f] = Number.isFinite(v) ? v * toMs : null
    }
    return [{ label: '|V|', color: '#ffe14d', values }]
  }, [data, F, M, m])

  const name = data.markers[m]
  return (
    <div className="charts">
      <SeriesChart title={`Position · ${name}`} unit={data.meta.positionUnit} x={x} series={pos} engine={engine} />
      {vel ? (
        <SeriesChart title={`Velocity · ${name}`} unit={data.meta.velocityUnit} x={x} series={vel} engine={engine} />
      ) : (
        <div className="chart empty">No velocity file</div>
      )}
      {spd ? (
        <SeriesChart
          title={`Speed · ${name}`}
          unit={data.meta.velocityUnit === 'mm/s' ? 'm/s' : data.meta.velocityUnit}
          x={x}
          series={spd}
          engine={engine}
        />
      ) : (
        <div className="chart empty">No velocity file</div>
      )}
    </div>
  )
}
