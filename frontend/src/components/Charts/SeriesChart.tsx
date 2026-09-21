import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { PlaybackEngine } from '../../lib/playback'

export interface ChartSeries {
  label: string
  color: string
  values: (number | null)[]
}

interface Props {
  title: string
  unit: string
  x: number[] // seconds
  series: ChartSeries[]
  engine: PlaybackEngine
}

const AXIS = { stroke: '#8b95a3', grid: { stroke: '#232a34', width: 1 }, ticks: { stroke: '#232a34', width: 1 }, font: '10px ui-monospace, monospace' }

/** Static uPlot chart. Built once per (session, marker); during playback only the
 *  cursor <div> moves (imperatively, via the engine subscription). */
export function SeriesChart({ title, unit, x, series, engine }: Props) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current!
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: el.clientHeight,
      legend: { show: false },
      cursor: { drag: { setScale: false, x: false, y: false }, points: { show: false } },
      scales: { x: { time: false } },
      axes: [
        { ...AXIS, size: 22 },
        { ...AXIS, size: 48 },
      ],
      series: [{}, ...series.map((s) => ({ label: s.label, stroke: s.color, width: 1.25, spanGaps: false, points: { show: false } }))],
    }
    const u = new uPlot(opts, [x, ...series.map((s) => s.values)] as uPlot.AlignedData, el)

    const cursor = document.createElement('div')
    cursor.style.cssText = 'position:absolute;top:0;bottom:0;left:0;width:1px;background:#ffe14d;pointer-events:none;will-change:transform'
    u.over.appendChild(cursor)
    const place = () => {
      cursor.style.transform = `translateX(${u.valToPos(engine.time, 'x')}px)`
    }
    place()
    const unsub = engine.subscribe(place)

    const seek = (e: MouseEvent) => {
      const r = u.over.getBoundingClientRect()
      engine.seekTime(u.posToVal(e.clientX - r.left, 'x'))
    }
    let dragging = false
    const down = (e: MouseEvent) => {
      dragging = true
      seek(e)
    }
    const move = (e: MouseEvent) => dragging && seek(e)
    const up = () => (dragging = false)
    u.over.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)

    const ro = new ResizeObserver(() => {
      u.setSize({ width: el.clientWidth, height: el.clientHeight })
      place()
    })
    ro.observe(el)
    return () => {
      unsub()
      ro.disconnect()
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      u.destroy()
    }
  }, [x, series, engine])

  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        <span className="chart-unit">{unit}</span>
        <span className="chart-legend">
          {series.map((s) => (
            <span key={s.label}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </span>
      </div>
      <div className="chart-host" ref={host} />
    </div>
  )
}
