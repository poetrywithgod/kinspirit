import { useCallback, useRef, useState } from 'react'
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
