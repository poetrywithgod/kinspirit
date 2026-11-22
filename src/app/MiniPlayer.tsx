import { currentTrack, next, toggle, usePlayer } from '../player'
import { NextIcon, PauseIcon, PlayIcon } from './icons'

/** Slim player bar shown on every screen while something is loaded. */
export function MiniPlayer({ onOpen }: { onOpen?: () => void }) {
  const p = usePlayer()
  const t = currentTrack(p)
  if (!t) return null
  const pct = p.duration > 0 ? Math.min(100, (p.time / p.duration) * 100) : 0
  return (
    <div className="mini-player" role="region" aria-label="Audio player">
      <button type="button" className="mini-info" onClick={onOpen} disabled={!onOpen}>
        <span className="mini-title">{t.title}</span>
        <span className="mini-artist">{t.artist}</span>
      </button>
      <button type="button" className="icon-btn" aria-label={p.playing ? 'Pause' : 'Play'} onClick={() => void toggle()}>
        {p.playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button type="button" className="icon-btn" aria-label="Next track" onClick={() => next(false)}>
        <NextIcon />
      </button>
      <span className="mini-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}
