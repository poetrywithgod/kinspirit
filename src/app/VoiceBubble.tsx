import type { Message } from '../api'
import { fmtDur } from '../time'
import { cycleRate, playVoice, seekVoice, useVoice } from '../voice'
import { waveOf } from '../wave'
import { DownloadIcon, PauseIcon, PlayIcon } from './icons'

export function VoiceBubble({ m, mine, local }: { m: Message; mine: boolean; local: boolean }) {
  const v = useVoice()
  const on = v.id === m.id
  const total = on && v.duration > 0 ? v.duration : (m.duration ?? 0)
  const pct = on && total > 0 ? Math.min(100, (v.time / total) * 100) : 0
  const needsDownload = !mine && !local && !on
  const bars = waveOf(m.body, m.id)
  const label = on && v.loading ? 'Loading' : on && v.playing ? 'Pause voice note' : needsDownload ? 'Download and play voice note' : 'Play voice note'
  return (
    <span className="voice-card">
      <button type="button" className="audio-btn" aria-label={label} disabled={on && v.loading} onClick={() => void playVoice(m)}>
        {on && v.loading ? <span className="dots">…</span> : on && v.playing ? <PauseIcon /> : needsDownload ? <DownloadIcon /> : <PlayIcon />}
      </button>
      <span className="voice-mid">
        <span
          className="voice-wave"
          role="slider"
          aria-label="Position in the voice note"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const f = (e.clientX - r.left) / r.width
            if (on) seekVoice(f)
            else void playVoice(m)
          }}
        >
          {bars.map((h, i) => (
            <span key={i} className={(i + 0.5) / bars.length <= pct / 100 ? 'on' : ''} style={{ height: `${Math.round(h * 100)}%` }} />
          ))}
        </span>
        <span className="audio-sub">
          {on && (v.playing || v.time > 0) ? fmtDur(v.time) : fmtDur(total)}
          {needsDownload && ' · Tap to load'}
        </span>
        {v.errorId === m.id && <span className="audio-sub warn">{v.error}</span>}
      </span>
      {on && v.playing && (
        <button type="button" className="rate" aria-label="Change speed" onClick={cycleRate}>
          {v.rate}×
        </button>
      )}
    </span>
  )
}
