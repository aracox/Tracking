import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { MotionData, ViewSettings } from '../../types'
import type { PlaybackEngine } from '../../lib/playback'
import { displayScale, qualisysToThree, writeQualisysAsThree } from '../../lib/coords'
import { MARKER_HEX, markerSide } from '../../lib/markerColors'
import { useIndexedFrame } from './useIndexedFrame'

export interface LayerProps {
  data: MotionData
  engine: PlaybackEngine
  settings: ViewSettings
  selected: number | null
}

const COLOR_LEFT = new THREE.Color(MARKER_HEX.left)
const COLOR_RIGHT = new THREE.Color(MARKER_HEX.right)
const COLOR_MID = new THREE.Color(MARKER_HEX.mid)
const COLOR_SELECTED = new THREE.Color(MARKER_HEX.selected)

function markerColor(name: string): THREE.Color {
  const side = markerSide(name)
  return side === 'left' ? COLOR_LEFT : side === 'right' ? COLOR_RIGHT : COLOR_MID
}

const MARKER_RADIUS = 0.011 // display units (metres)

/* ------------------------------------------------------------------ markers */
export function Markers({
  data,
  engine,
  settings,
  selected,
  onSelect,
}: LayerProps & { onSelect: (i: number | null) => void }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const scale = displayScale(data.meta.positionUnit)
  const M = data.markerCount
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const tmp = useMemo(() => new Float32Array(3), [])

  useEffect(() => {
    // Instances move every frame; keep raycasting/culling valid.
    mesh.current.frustumCulled = false
    mesh.current.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
  }, [])

  useEffect(() => {
    for (let m = 0; m < M; m++) {
      mesh.current.setColorAt(m, m === selected ? COLOR_SELECTED : markerColor(data.markers[m]))
    }
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
  }, [data, M, selected])

  useIndexedFrame(
    engine,
    (f) => {
      for (let m = 0; m < M; m++) {
        const k = f * M + m
        if (!settings.markers || !data.valid[k]) {
          m4.makeScale(0, 0, 0) // invalid sample: never drawn (not at the origin either)
        } else {
          writeQualisysAsThree(tmp, 0, data.positions[k * 3], data.positions[k * 3 + 1], data.positions[k * 3 + 2], scale)
          const s = m === selected ? 1.5 : 1
          m4.makeScale(s, s, s).setPosition(tmp[0], tmp[1], tmp[2])
        }
        mesh.current.setMatrixAt(m, m4)
      }
      mesh.current.instanceMatrix.needsUpdate = true
    },
    [data, settings.markers, selected],
  )

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, M]}
      onClick={(e) => {
        e.stopPropagation()
        if (e.instanceId !== undefined) onSelect(e.instanceId)
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <sphereGeometry args={[MARKER_RADIUS, 16, 12]} />
      <meshStandardMaterial roughness={0.45} metalness={0.05} />
    </instancedMesh>
  )
}

/* --------------------------------------------------------- generic line set */
function useLineGeometry(maxSegments: number) {
  return useMemo(() => {
    const g = new THREE.BufferGeometry()
    const attr = new THREE.BufferAttribute(new Float32Array(maxSegments * 6), 3)
    attr.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', attr)
    return { g, attr }
  }, [maxSegments])
}

/* ----------------------------------------------------------------- skeleton */
export function Skeleton({
  data,
  engine,
  settings,
  selected,
  pairs,
}: LayerProps & { pairs: [number, number][] }) {
  const scale = displayScale(data.meta.positionUnit)
  const M = data.markerCount
  const { g, attr } = useLineGeometry(Math.max(1, pairs.length))
  const line = useRef<THREE.LineSegments>(null!)

  useIndexedFrame(
    engine,
    (f) => {
      const a = attr.array as Float32Array
      let n = 0
      for (const [i, j] of pairs) {
        const ki = f * M + i
        const kj = f * M + j
        // If either end is untracked the segment is omitted (not drawn to the origin).
        if (!data.valid[ki] || !data.valid[kj]) continue
        writeQualisysAsThree(a, n * 6, data.positions[ki * 3], data.positions[ki * 3 + 1], data.positions[ki * 3 + 2], scale)
        writeQualisysAsThree(a, n * 6 + 3, data.positions[kj * 3], data.positions[kj * 3 + 1], data.positions[kj * 3 + 2], scale)
        n++
      }
      attr.needsUpdate = true
      g.setDrawRange(0, n * 2)
    },
    [data, pairs, settings.skeleton, selected],
  )

  return (
    <lineSegments ref={line} geometry={g} frustumCulled={false} visible={settings.skeleton}>
      <lineBasicMaterial color="#8fb4d9" transparent opacity={0.75} />
    </lineSegments>
  )
}

/* -------------------------------------------------------- velocity vectors */
export function VelocityVectors({ data, engine, settings, selected }: LayerProps) {
  const scale = displayScale(data.meta.positionUnit)
  const M = data.markerCount
  const { g, attr } = useLineGeometry(M)

  useIndexedFrame(
    engine,
    (f) => {
      const a = attr.array as Float32Array
      let n = 0
      if (data.velocities && data.validVel) {
        for (let m = 0; m < M; m++) {
          const k = f * M + m
          if (!data.valid[k] || !data.validVel[k]) continue
          const px = data.positions[k * 3]
          const py = data.positions[k * 3 + 1]
          const pz = data.positions[k * 3 + 2]
          const h = settings.velocityHorizon // s: endpoint = p + v * horizon (display only)
          writeQualisysAsThree(a, n * 6, px, py, pz, scale)
          writeQualisysAsThree(
            a,
            n * 6 + 3,
            px + data.velocities[k * 3] * h,
            py + data.velocities[k * 3 + 1] * h,
            pz + data.velocities[k * 3 + 2] * h,
            scale,
          )
          n++
        }
      }
      attr.needsUpdate = true
      g.setDrawRange(0, n * 2)
    },
    [data, settings.velocityHorizon, settings.velocity, selected],
  )

  return (
    <lineSegments geometry={g} frustumCulled={false} visible={settings.velocity && !!data.velocities}>
      <lineBasicMaterial color="#3ddc97" />
    </lineSegments>
  )
}

/* ------------------------------------------------------------------- trails */
export function Trails({ data, engine, settings, selected }: LayerProps) {
  const scale = displayScale(data.meta.positionUnit)
  const M = data.markerCount
  const F = data.frameCount
  const rate = data.meta.sampleRate
  const { g, attr } = useLineGeometry(Math.max(1, M * (F - 1)))

  useIndexedFrame(
    engine,
    (f) => {
      const a = attr.array as Float32Array
      const w = settings.trailWindow
      const start = w === 'full' ? 0 : Math.max(0, f - Math.round(w * rate))
      const list = settings.trailMode === 'all' ? Array.from({ length: M }, (_, i) => i) : selected !== null ? [selected] : []
      let n = 0
      for (const m of list) {
        for (let i = Math.max(1, start + 1); i <= f; i++) {
          const k0 = (i - 1) * M + m
          const k1 = i * M + m
          // Never connect across an invalid sample: the trajectory breaks there.
          if (!data.valid[k0] || !data.valid[k1]) continue
          writeQualisysAsThree(a, n * 6, data.positions[k0 * 3], data.positions[k0 * 3 + 1], data.positions[k0 * 3 + 2], scale)
          writeQualisysAsThree(a, n * 6 + 3, data.positions[k1 * 3], data.positions[k1 * 3 + 1], data.positions[k1 * 3 + 2], scale)
          n++
        }
      }
      attr.needsUpdate = true
      g.setDrawRange(0, n * 2)
    },
    [data, settings.trails, settings.trailMode, settings.trailWindow, selected],
  )

  return (
    <lineSegments geometry={g} frustumCulled={false} visible={settings.trails}>
      <lineBasicMaterial color={settings.trailMode === 'all' ? '#9ad1ff' : '#ffe14d'} transparent opacity={settings.trailMode === 'all' ? 0.6 : 1} />
    </lineSegments>
  )
}

/* ------------------------------------------------------------------- labels */
/** DOM labels positioned imperatively each frame (no React updates). */
export function Labels({
  data,
  engine,
  settings,
  container,
}: LayerProps & { container: HTMLDivElement | null }) {
  const { camera, size } = useThree()
  const scale = displayScale(data.meta.positionUnit)
  const M = data.markerCount
  const els = useRef<HTMLSpanElement[]>([])
  const v = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    if (!container) return
    container.replaceChildren()
    els.current = data.markers.map((name) => {
      const s = document.createElement('span')
      s.className = 'marker-label'
      s.textContent = name
      container.appendChild(s)
      return s
    })
    return () => container.replaceChildren()
  }, [container, data.markers])

  useFrame(() => {
    const f = engine.index
    for (let m = 0; m < M; m++) {
      const el = els.current[m]
      if (!el) continue
      const k = f * M + m
      if (!settings.labels || !data.valid[k]) {
        el.style.display = 'none'
        continue
      }
      const [x, y, z] = qualisysToThree(data.positions[k * 3], data.positions[k * 3 + 1], data.positions[k * 3 + 2], scale)
      v.set(x, y + 0.02, z).project(camera)
      if (v.z > 1 || v.z < -1) {
        el.style.display = 'none'
        continue
      }
      el.style.display = 'block'
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`
    }
  })
  return null
}

/* ----------------------------------------------------------- grid and axes */
export function GridAndAxes({ data, settings }: { data: MotionData; settings: ViewSettings }) {
  const scale = displayScale(data.meta.positionUnit)
  const cx = (data.bounds.min[0] + data.bounds.max[0]) / 2
  const cz = (data.bounds.min[2] + data.bounds.max[2]) / 2
  const axisLen = 0.5
  const axes = useMemo(() => {
    const mk = (end: [number, number, number], color: string) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(...end)])
      return { g, color, end }
    }
    // Axes are drawn in Qualisys axis directions, mapped through qualisysToThree.
    return [
      { ...mk(qualisysToThree(axisLen, 0, 0), '#ff5252'), label: 'X' },
      { ...mk(qualisysToThree(0, axisLen, 0), '#5cdb5c'), label: 'Y' },
      { ...mk(qualisysToThree(0, 0, axisLen), '#4d8dff'), label: 'Z' },
    ]
  }, [])
  void scale
  return (
    <>
      {settings.grid && (
        <gridHelper args={[8, 16, '#3a4452', '#262d37']} position={[Math.round(cx * 2) / 2, 0, Math.round(cz * 2) / 2]} />
      )}
      {settings.axes && (
        <group>
          {axes.map((a) => (
            <group key={a.label}>
              <lineSegments geometry={a.g}>
                <lineBasicMaterial color={a.color} linewidth={2} />
              </lineSegments>
              <Html position={a.end} center style={{ color: a.color, fontSize: 12, fontWeight: 600, pointerEvents: 'none' }}>
                {a.label}
              </Html>
            </group>
          ))}
        </group>
      )}
    </>
  )
}
