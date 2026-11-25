import { useEffect, useRef, useState } from 'react'
import { countSaved, createBackup, restoreBackup, type Counts } from '../backup'

const stamp = () => new Date().toISOString().slice(0, 10)
const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`)

export function BackupCard() {
  const [counts, setCounts] = useState<Counts | null>(null)
  const [busy, setBusy] = useState<'' | 'save' | 'restore'>('')
  const [progress, setProgress] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const pick = useRef<HTMLInputElement>(null)

  const refresh = () => void countSaved().then(setCounts).catch(() => setCounts(null))
  useEffect(refresh, [])

  const total = counts ? counts.audio + counts.voice + counts.media : 0

  const save = async () => {
    setBusy('save')
    setError('')
    setMsg('')
    try {
      const { blob, count } = await createBackup((d, t) => setProgress(`Packing ${d} of ${t}…`))
      if (count === 0) {
        setMsg('There are no saved files on this phone to back up yet.')
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `kinspirit-backup-${stamp()}.kinbak`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        setMsg(`Backup saved (${count} files, ${mb(blob.size)}). Keep it somewhere safe, like Google Drive or your computer.`)
      }
    } catch {
      setError('Could not make the backup. Free some space on this phone and try again.')
    }
    setProgress('')
    setBusy('')
  }

  const restore = async (file: File) => {
    setBusy('restore')
    setError('')
    setMsg('')
    try {
      const r = await restoreBackup(file, (d, t) => setProgress(`Restoring ${d} of ${t}…`))
      setMsg(`Restored ${r.restored} ${r.restored === 1 ? 'file' : 'files'}${r.skipped ? `. ${r.skipped} were already on this phone.` : '.'}`)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore that file.')
    }
    setProgress('')
    setBusy('')
  }

  return (
    <div className="settings-card">
      <h2 className="section-title flush">Backup</h2>
      <p className="muted">
        Your texts are kept by Kinspirit. Files you saved on this phone (audio, voice notes, photos, videos, documents) live only here, so a backup
        keeps them safe if you change or lose your phone.
      </p>
      <p className="muted">
        {counts === null
          ? ' '
          : total === 0
            ? 'Nothing saved on this phone yet.'
            : `On this phone: ${counts.audio} audio, ${counts.voice} voice notes, ${counts.media} photos, videos and files.`}
      </p>
      <div className="link-actions">
        <button type="button" className="btn btn-quiet" disabled={!!busy || total === 0} onClick={() => void save()}>
          {busy === 'save' ? 'Saving…' : 'Save a backup'}
        </button>
        <button type="button" className="btn btn-quiet" disabled={!!busy} onClick={() => pick.current?.click()}>
          {busy === 'restore' ? 'Restoring…' : 'Restore from a backup'}
        </button>
      </div>
      <input
        ref={pick}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void restore(f)
        }}
      />
      {progress && (
        <p className="muted" role="status">
          {progress}
        </p>
      )}
      {msg && (
        <p className="muted" role="status">
          {msg}
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
