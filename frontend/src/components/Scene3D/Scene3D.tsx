import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { MotionData, SkeletonConfig, ViewSettings } from '../../types'
import type { PlaybackEngine } from '../../lib/playback'
import { resolveSkeletonPairs } from '../../lib/skeletonPairs'
import { GridAndAxes, Labels, Markers, Skeleton, Trails, VelocityVectors } from './layers'
import './Scene3D.css'

export interface SceneApi {
  reset(): void
  fit(): void
}

interface Props {
  data: MotionData
  engine: PlaybackEngine
  settings: ViewSettings
  selected: number | null
  onSelect: (i: number | null) => void
  skeleton: SkeletonConfig
}

/** Default oblique view direction (three-space). */
const VIEW_DIR = new THREE.Vector3(1.1, 0.55, 1.4).normalize()

function CameraRig({ data, apiRef }: { data: MotionData; apiRef: React.Ref<SceneApi> }) {
  const { camera } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)
  const { center, radius } = useMemo(() => {
    const min = new THREE.Vector3(...data.bounds.min)
    const max = new THREE.Vector3(...data.bounds.max)
    return { center: min.clone().add(max).multiplyScalar(0.5), radius: Math.max(0.3, min.distanceTo(max) / 2) }
  }, [data])

  const place = useCallback(
    (dir: THREE.Vector3) => {
      const cam = camera as THREE.PerspectiveCamera
      const dist = (radius / Math.sin((cam.fov * Math.PI) / 360)) * 1.05
      cam.position.copy(center).addScaledVector(dir, dist)
      cam.near = dist / 200
      cam.far = dist * 50
      cam.updateProjectionMatrix()
      controls.current?.target.copy(center)
      controls.current?.update()
    },
    [camera, center, radius],
  )

  useImperativeHandle(
    apiRef,
    () => ({
      reset: () => place(VIEW_DIR),
      // Keep current view direction, re-centre and re-zoom on the data.
      fit: () => place(camera.position.clone().sub(controls.current?.target ?? center).normalize()),
    }),
    [place, camera, center],
  )

  // Initial framing whenever a new session loads.
  useEffect(() => {
    place(VIEW_DIR)
  }, [place])

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} />
}

export const Scene3D = forwardRef<SceneApi, Props>(function Scene3D(
  { data, engine, settings, selected, onSelect, skeleton },
  ref,
) {
  const [labelHost, setLabelHost] = useState<HTMLDivElement | null>(null)
  const pairs = useMemo(() => resolveSkeletonPairs(data.markers, skeleton), [data, skeleton])

  const layer = { data, engine, settings, selected }
  return (
    <div className="scene3d">
      <Canvas
        camera={{ fov: 45, position: [2, 1.5, 3] }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
        onPointerMissed={() => onSelect(null)}
      >
        <color attach="background" args={['#0e1116']} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 2]} intensity={1.2} />
        <CameraRig data={data} apiRef={ref} />
        <GridAndAxes data={data} settings={settings} />
        <Skeleton {...layer} pairs={pairs} />
        <Trails {...layer} />
        <VelocityVectors {...layer} />
        <Markers {...layer} onSelect={onSelect} />
        <Labels {...layer} container={labelHost} />
      </Canvas>
      <div className="label-host" ref={setLabelHost} />
    </div>
  )
})
