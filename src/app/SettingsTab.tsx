import { useCallback, useEffect, useRef, useState } from 'react'
import { autoSaveAudio, autoSaveBig, autoSavePhotos, onLibraryChange, setAutoSaveAudio, setAutoSaveBig, setAutoSavePhotos } from '../library'
import { protectStorage, storageInfo, type StorageInfo } from '../storage'
import { fmtSize } from '../time'
import { ApiError, updateAvatar } from '../api'
import { PhotoCropper } from '../PhotoCropper'
import { applyTheme, getTheme, type ThemePref } from '../theme'
import { Avatar } from './Avatar'

const OPTIONS: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'Match phone' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

export function SettingsTab({
  username,
  avatar,
  onAvatarChange,
  onLogout,
}: {
  username: string
  avatar: string | null
  onAvatarChange: (url: string) => void
  onLogout: () => void
}) {
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [autoAudio, setAutoAudio] = useState(autoSaveAudio())
  const [autoPhotos, setAutoPhotos] = useState(autoSavePhotos())
  const [autoBig, setAutoBig] = useState(autoSaveBig())
  useEffect(() => {
    let dead = false
    const load = () => void storageInfo().then((i) => !dead && setInfo(i))
    void protectStorage().then(load)
    const off = onLibraryChange(load)
    return () => {
      dead = true
      off()
    }
  }, [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoMsg, setPhotoMsg] = useState('')
  const closeCropper = useCallback((msg?: string) => {
    setCropFile(null)
    if (msg) setPhotoMsg(msg)
  }, [])
  const savePhoto = (dataUrl: string) => {
    setCropFile(null)
    setPhotoBusy(true)
    setPhotoMsg('')
    updateAvatar(dataUrl)
      .then((url) => {
        onAvatarChange(url)
        setPhotoMsg('Photo updated.')
      })
      .catch((e: unknown) => setPhotoMsg(e instanceof ApiError ? e.message : 'Could not update your photo. Try again.'))
      .finally(() => setPhotoBusy(false))
  }

  const [theme, setTheme] = useState<ThemePref>(getTheme())
  const [out, setOut] = useState(false)

  return (
    <section className="tab">
      {cropFile && <PhotoCropper file={cropFile} onCancel={closeCropper} onDone={savePhoto} />}
      <div className="settings-card profile-line">
        <button
          type="button"
          className="avatar-change"
          aria-label="Change profile photo"
          disabled={photoBusy}
          onClick={() => fileRef.current?.click()}
        >
          <Avatar src={avatar} name={username} size={64} />
          <span className="avatar-change-badge" aria-hidden="true">
            ✎
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              setPhotoMsg('')
              setCropFile(f)
            }
            e.target.value = ''
          }}
        />
        <div>
          <p className="row-name">@{username}</p>
          <p className="muted">{photoBusy ? 'Saving your photo…' : 'Tap your photo to change it'}</p>
          {photoMsg && <p className={photoMsg === 'Photo updated.' ? 'muted' : 'error'}>{photoMsg}</p>}
        </div>
      </div>

      <div className="settings-card">
        <h2 className="section-title flush">Saved on this phone</h2>
        <p className="muted">
          What you receive is saved on this phone and stays here until you delete it.
          {info ? ` ${info.files} saved file${info.files === 1 ? '' : 's'}, ${fmtSize(info.used)} used.` : ''}
        </p>
        {info && info.persisted === false && (
          <p className="muted">
            {info.installed
              ? 'Your browser has not yet promised to keep these files. Keep using the app and it usually will.'
              : 'Add Kinspirit to your Home Screen (menu → Install app / Add to Home Screen). Browsers may clear saved files from a website that is not installed.'}
          </p>
        )}
        {info && info.persisted && <p className="muted">✓ Protected: this phone will not clear them to free up space.</p>}
        <label className="switch-row">
          <input
            type="checkbox"
            checked={autoAudio}
            onChange={(e) => {
              setAutoAudio(e.target.checked)
              setAutoSaveAudio(e.target.checked)
            }}
          />
          <span>Save audio files automatically (uses data; voice notes are always saved)</span>
        </label>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={autoPhotos}
            onChange={(e) => {
              setAutoPhotos(e.target.checked)
              setAutoSavePhotos(e.target.checked)
            }}
          />
          <span>Save photos automatically</span>
        </label>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={autoBig}
            onChange={(e) => {
              setAutoBig(e.target.checked)
              setAutoSaveBig(e.target.checked)
            }}
          />
          <span>Save videos and documents automatically (they can be big; otherwise tap to download)</span>
        </label>
      </div>

      <div className="settings-card">
        <h2 className="section-title flush">Appearance</h2>
        <div className="chips" role="radiogroup" aria-label="Appearance">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={theme === o.id}
              className={`chip${theme === o.id ? ' on' : ''}`}
              onClick={() => {
                setTheme(o.id)
                applyTheme(o.id)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-card">
        <button
          type="button"
          className="btn btn-quiet"
          disabled={out}
          onClick={() => {
            setOut(true)
            onLogout()
          }}
        >
          {out ? 'Logging out…' : 'Log out'}
        </button>
      </div>
    </section>
  )
}
