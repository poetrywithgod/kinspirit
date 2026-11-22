import { useState } from 'react'
import { ApiError, listReceivedAudio, type AudioMessage } from '../api'
import { downloadAudio, isGone, removeAudio, renameLocalAudio, useLibrary } from '../library'
import type { AudioMeta } from '../localdb'
import { currentTrack, cycleRepeat, next, play, prev, seek, toggle, toggleShuffle, usePlayer } from '../player'
import { fmtDur, fmtSize, shortWhen } from '../time'
import { usePolling } from '../usePolling'
import { DotsIcon, DownloadIcon, MusicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RepeatIcon, ShuffleIcon } from './icons'

function NowPlaying() {
  const p = usePlayer()
  const t = currentTrack(p)
  if (!t) return null
  return (
    <div className="now-playing">
      <div className="np-art" aria-hidden="true">
        <MusicIcon />
      </div>
      <p className="np-title">{t.title}</p>
      <p className="np-artist">{t.artist}</p>
      {p.error && <p className="error center">{p.error}</p>}
      <input
        type="range"
        className="np-seek"
        aria-label="Seek"
        min={0}
        max={Math.max(1, Math.floor(p.duration))}
        value={Math.min(Math.floor(p.time), Math.max(1, Math.floor(p.duration)))}
        onChange={(e) => seek(Number(e.target.value))}
        style={{ ['--pct' as string]: `${p.duration > 0 ? (p.time / p.duration) * 100 : 0}%` }}
      />
      <div className="np-times">
        <span>{fmtDur(p.time)}</span>
        <span>{fmtDur(p.duration)}</span>
      </div>
      <div className="np-controls">
        <button type="button" className={`icon-btn${p.shuffle ? ' lit' : ''}`} aria-label="Shuffle" aria-pressed={p.shuffle} onClick={toggleShuffle}>
          <ShuffleIcon />
        </button>
        <button type="button" className="icon-btn" aria-label="Previous track" onClick={() => void prev()}>
          <PrevIcon />
        </button>
        <button type="button" className="np-play" aria-label={p.playing ? 'Pause' : 'Play'} onClick={() => void toggle()}>
          {p.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="icon-btn" aria-label="Next track" onClick={() => next(false)}>
          <NextIcon />
        </button>
        <button
          type="button"
          className={`icon-btn${p.repeat !== 'off' ? ' lit' : ''}`}
          aria-label={`Repeat: ${p.repeat}`}
          onClick={cycleRepeat}
        >
          <RepeatIcon one={p.repeat === 'one'} />
        </button>
      </div>
    </div>
  )
}

type Sheet = { kind: 'menu' | 'rename' | 'delete'; item: AudioMeta } | null

export function AudioTab() {
  const lib = useLibrary()
  const p = usePlayer()
  const nowId = currentTrack(p)?.id
  const [waiting, setWaiting] = useState<AudioMessage[]>([])
  const [loadedWaiting, setLoadedWaiting] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [name, setName] = useState('')

  usePolling(async () => {
    try {
      setWaiting(await listReceivedAudio())
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not check for new audio.')
    }
    setLoadedWaiting(true)
  }, 10000)

  const have = new Set((lib ?? []).map((x) => x.id))
  const pending = waiting.filter((m) => !have.has(m.id) && !isGone(m.id))

  const get = async (m: AudioMessage) => {
    setBusy((b) => new Set(b).add(m.id))
    try {
      await downloadAudio(m, m.from)
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Download failed. Try again.')
    } finally {
      setBusy((b) => {
        const n = new Set(b)
        n.delete(m.id)
        return n
      })
    }
  }

  return (
    <section className="tab">
      <h1 className="tab-title">Audio Player</h1>
      <NowPlaying />
      {error && <p className="error center">{error}</p>}

      {pending.length > 0 && (
        <>
          <h2 className="section-title">Waiting to download</h2>
          <ul className="rows">
            {pending.map((m) => (
              <li key={m.id} className="row person">
                <span className="row-hit static">
                  <span className="track-art" aria-hidden="true">
                    <MusicIcon />
                  </span>
                  <span className="row-main">
                    <span className="row-name">{m.file_name ?? m.body}</span>
                    <span className="row-preview">
                      @{m.from} · {m.file_size ? fmtSize(m.file_size) : ''} · {shortWhen(m.created_at)}
                    </span>
                  </span>
                </span>
                <button type="button" className="mini-btn dl" disabled={busy.has(m.id)} onClick={() => void get(m)}>
                  <DownloadIcon />
                  {busy.has(m.id) ? 'Saving…' : 'Save'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="section-title">On this device</h2>
      {lib === null && <p className="muted center">Loading…</p>}
      {lib !== null && lib.length === 0 && (
        <div className="empty-card">
          <span className="empty-mark" aria-hidden="true" />
          <h1>No audio yet</h1>
          <p>
            Audio files your friends send you in chat will show up here. Save them to your phone and play them like
            music, even when you switch screens.
          </p>
          {!loadedWaiting && <p className="muted">Checking for new audio…</p>}
        </div>
      )}
      <ul className="rows">
        {(lib ?? []).map((it) => {
          const on = nowId === it.id
          return (
            <li key={it.id} className={`row person${on ? ' playing' : ''}`}>
              <button type="button" className="row-hit" onClick={() => (on ? void toggle() : void play(it.id, lib ?? []))}>
                <span className="track-art" aria-hidden="true">
                  {on && p.playing ? <PauseIcon /> : <PlayIcon />}
                </span>
                <span className="row-main">
                  <span className="row-name">{it.name}</span>
                  <span className="row-preview">
                    {it.from ? `@${it.from}` : 'You'} · {fmtDur(it.duration)} · {fmtSize(it.size)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`More for ${it.name}`}
                onClick={() => setSheet({ kind: 'menu', item: it })}
              >
                <DotsIcon />
              </button>
            </li>
          )
        })}
      </ul>

      {sheet && (
        <div className="sheet-wrap" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-label="Audio options" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">{sheet.item.name}</p>
            {sheet.kind === 'menu' && (
              <>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setName(sheet.item.name)
                    setSheet({ kind: 'rename', item: sheet.item })
                  }}
                >
                  Rename
                </button>
                <button type="button" className="menu-item danger" onClick={() => setSheet({ kind: 'delete', item: sheet.item })}>
                  Delete from this device
                </button>
              </>
            )}
            {sheet.kind === 'rename' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const n = name.trim()
                  if (n) void renameLocalAudio(sheet.item.id, n.slice(0, 120)).then(() => setSheet(null))
                }}
              >
                <input
                  className="sheet-input"
                  autoFocus
                  aria-label="New name"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                />
                <div className="sheet-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => setSheet(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn" disabled={!name.trim()}>
                    Save
                  </button>
                </div>
              </form>
            )}
            {sheet.kind === 'delete' && (
              <>
                <p className="muted">This removes the file from your phone. It cannot be undone.</p>
                <div className="sheet-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => setSheet(null)}>
                    Cancel
                  </button>
                  <button type="button" className="btn" onClick={() => void removeAudio(sheet.item.id).then(() => setSheet(null))}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
