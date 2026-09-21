import { useEffect, useState } from 'react'
import { loadSession, uploadSession, type LoadStage } from '../services/api'
import type { MotionData } from '../types'

export type SessionSource =
  | { kind: 'server'; id: string }
  | { kind: 'upload'; position: File; velocity: File | null }

export type SessionState =
  | { status: 'idle' }
  | { status: 'loading'; id: string; stage: LoadStage }
  | { status: 'ready'; data: MotionData }
  | { status: 'error'; id: string; message: string }

export function useSession(source: SessionSource | null): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'idle' })
  useEffect(() => {
    if (!source) return
    let cancelled = false
    const id = source.kind === 'server' ? source.id : source.position.name
    const initial: LoadStage = source.kind === 'server' ? 'parsing' : 'uploading'
    setState({ status: 'loading', id, stage: initial })
    const onStage = (stage: LoadStage) => !cancelled && setState({ status: 'loading', id, stage })
    const run = source.kind === 'server' ? loadSession(source.id, onStage) : uploadSession(source.position, source.velocity, onStage)
    run
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((e) => !cancelled && setState({ status: 'error', id, message: String(e.message ?? e) }))
    return () => {
      cancelled = true
    }
  }, [source])
  return state
}
