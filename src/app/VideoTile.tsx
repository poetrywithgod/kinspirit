import { useEffect, useRef } from 'react'
import type { VideoTrack } from 'livekit-client'

/** One camera picture on the call screen. `mirror` flips my own picture like a mirror. */
export function VideoTile({ track, name, mirror = false, className = '' }: { track: VideoTrack; name: string; mirror?: boolean; className?: string }) {
  const el = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = el.current
    if (!v) return
    track.attach(v)
    return () => {
      track.detach(v)
    }
  }, [track])
  return (
    <div className={`video-tile ${className}`}>
      <video ref={el} autoPlay playsInline muted className={mirror ? 'mirror' : undefined} aria-label={`Video of ${name}`} />
      <span className="video-name">{name}</span>
    </div>
  )
}
