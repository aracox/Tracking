import { useEffect, useState } from 'react'
import { loadSession, type LoadStage } from '../services/api'
import type { MotionData } from '../types'

export type SessionState =
  | { status: 'idle' }
  | { status: 'loading'; id: string; stage: LoadStage }
  | { status: 'ready'; data: MotionData }
  | { status: 'error'; id: string; message: string }

export function useSession(id: string | null): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'idle' })
  useEffect(() => {
    if (!id) return
    let cancelled = false
    setState({ status: 'loading', id, stage: 'parsing' })
    loadSession(id, (stage) => !cancelled && setState({ status: 'loading', id, stage }))
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((e) => !cancelled && setState({ status: 'error', id, message: String(e.message ?? e) }))
    return () => {
      cancelled = true
    }
  }, [id])
  return state
}
