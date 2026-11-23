import { useEffect, useState } from 'react'
import { ApiError, type Message } from '../api'
import { extLabel } from '../media'
import { downloadToDevice, getMediaBlob, saveReceivedMedia, useMediaIds } from '../mediaStore'
import { fmtDur, fmtSize } from '../time'
import { DownloadIcon, PlayIcon } from './icons'

/** The picture, video or file itself, loaded from this phone. */
function useBlobUrl(id: string, have: boolean) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!have) {
      setUrl('')
      return
    }
    let dead = false
    let made = ''
    void getMediaBlob(id).then((b) => {
      if (!b || dead) return
      made = URL.createObjectURL(b)
      setUrl(made)
    })
    return () => {
      dead = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [id, have])
  return url
}

const viewable = (type: string) => /^(image|video|audio|text)\//.test(type) || type === 'application/pdf'

export function MediaBubble({
  m,
  onView,
}: {
  m: Message
  onView: (src: string, name: string, save: () => void) => void
}) {
  const have = useMediaIds().has(m.id)
  const url = useBlobUrl(m.id, have)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [broken, setBroken] = useState(false)
  const name = m.file_name ?? m.body
  const unavailable = !m.file_path && !have
  const type = m.file_type || 'application/octet-stream'
  const ratio = m.media_w && m.media_h ? `${m.media_w} / ${m.media_h}` : '4 / 3'

  const get = async () => {
    setBusy(true)
    setErr('')
    try {
      await saveReceivedMedia(m)
    } catch (e) {
      setErr(e instanceof ApiError && e.code === 'gone' ? 'No longer available' : 'Could not download. Tap to try again.')
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    const b = await getMediaBlob(m.id)
    if (b) downloadToDevice(b, name)
  }

  if (m.kind === 'image' && !broken) {
    return (
      <span className="media-card" style={{ aspectRatio: ratio }}>
        {url ? (
          <button type="button" className="media-hit" aria-label={`Open photo ${name}`} onClick={() => onView(url, name, () => void save())}>
            <img src={url} alt={name} onError={() => setBroken(true)} />
          </button>
        ) : (
          <button type="button" className="media-get" disabled={busy || unavailable} onClick={() => void get()}>
            <DownloadIcon />
            <span>{busy ? 'Downloading…' : (err || (unavailable ? 'No longer available' : m.file_size ? fmtSize(m.file_size) : 'Photo'))}</span>
          </button>
        )}
      </span>
    )
  }

  if (m.kind === 'video') {
    return (
      <span className="media-wrap">
        <span className="media-card" style={{ aspectRatio: ratio }}>
          {url ? (
            <video className="media-video" src={url} controls playsInline preload="metadata" />
          ) : (
            <button type="button" className="media-get" disabled={busy || unavailable} onClick={() => void get()}>
              {busy ? null : <PlayIcon />}
              <span>
                {busy ? 'Downloading…' : err || (unavailable ? 'No longer available' : '') || `${m.file_size ? fmtSize(m.file_size) : 'Video'}${m.duration ? ` · ${fmtDur(m.duration)}` : ''}`}
              </span>
            </button>
          )}
        </span>
        <span className="file-sub">
          {name}
          {have && (
            <>
              {' · '}
              <button type="button" className="link-btn" onClick={() => void save()}>
                Save
              </button>
            </>
          )}
        </span>
      </span>
    )
  }

  // Documents and any other file, shown with their own name and format.
  return (
    <span className="file-card">
      <button
        type="button"
        className="file-main"
        disabled={busy || unavailable}
        onClick={() => (have ? (viewable(type) && url ? window.open(url, '_blank', 'noopener') : void save()) : void get())}
      >
        <span className="file-badge" aria-hidden="true">
          {extLabel(name)}
        </span>
        <span className="file-info">
          <span className="file-name">{name}</span>
          <span className="file-sub">
            {m.file_size ? fmtSize(m.file_size) : 'File'}
            {!have && (busy ? ' · Downloading…' : unavailable ? ' · No longer available' : ' · Tap to download')}
            {have && ' · On your phone'}
          </span>
          {err && <span className="file-sub warn">{err}</span>}
        </span>
      </button>
      <button
        type="button"
        className="audio-btn"
        aria-label={have ? 'Save to your files' : 'Download'}
        disabled={busy}
        onClick={() => void (have ? save() : get())}
      >
        <DownloadIcon />
      </button>
    </span>
  )
}
