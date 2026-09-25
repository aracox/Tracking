import { useEffect, useState } from 'react'
import { mediaUrl } from '../services/api'
import type { SessionSource } from './useSession'
import type { MotionData } from '../types'

/** Resolves the session's camera video URL: an object URL for a client-picked file
 *  (never touches the server), or the local-dev `/media/*` route for a server session.
 *  Manages createObjectURL/revokeObjectURL lifecycle. */
export function useVideoUrl(source: SessionSource | null, data: MotionData | null): string | null {
  const uploadVideo = source?.kind === 'upload' ? source.video : null
  const serverVideoFile = source?.kind === 'server' && data?.meta.hasVideo ? data.meta.videoFile : null
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (uploadVideo) {
      const objectUrl = URL.createObjectURL(uploadVideo)
      setUrl(objectUrl)
      return () => URL.revokeObjectURL(objectUrl)
    }
    setUrl(serverVideoFile ? mediaUrl(serverVideoFile) : null)
  }, [uploadVideo, serverVideoFile])

  return url
}
