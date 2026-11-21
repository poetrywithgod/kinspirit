import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthLayout } from '../AuthLayout'
import { ApiError, isUsernameAvailable, saveProfile } from '../api'
import { PhotoCropper } from '../PhotoCropper'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export function Profile({
  phone,
  onDone,
}: {
  phone: string
  onDone: (profile: { username: string; photo: string | null }) => void
}) {
  const [username, setUsername] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'unknown'>('idle')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [touched, setTouched] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const valid = USERNAME_RE.test(username)

  useEffect(() => {
    if (!valid) {
      setStatus('idle')
      return
    }
    setStatus('checking')
    let cancelled = false
    const t = setTimeout(() => {
      isUsernameAvailable(username)
        .then((ok) => {
          if (!cancelled) setStatus(ok ? 'ok' : 'taken')
        })
        .catch(() => {
          // Could not check (offline or server not set up): the server still enforces uniqueness on save.
          if (!cancelled) setStatus('unknown')
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [username, valid])

  const closeCropper = useCallback((msg?: string) => {
    setCropFile(null)
    if (msg) setPhotoError(msg)
  }, [])

  let message: { text: string; kind: 'hint' | 'error' | 'ok' } = {
    text: 'Letters, numbers and underscore, 3 to 20 characters.',
    kind: 'hint',
  }
  if (touched && !valid) message = { text: 'Use 3 to 20 letters, numbers or underscores.', kind: 'error' }
  else if (status === 'checking') message = { text: 'Checking…', kind: 'hint' }
  else if (status === 'ok') message = { text: `@${username} is available.`, kind: 'ok' }
  else if (status === 'unknown') message = { text: 'Could not check this name right now. You can still continue.', kind: 'hint' }
  else if (status === 'taken') message = { text: `@${username} is taken. Try another.`, kind: 'error' }

  return (
    <AuthLayout title="Set up your profile" step={3}>
      {cropFile && (
        <PhotoCropper
          file={cropFile}
          onCancel={closeCropper}
          onDone={(url) => {
            setPhoto(url)
            setCropFile(null)
          }}
        />
      )}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setTouched(true)
          setSaveError('')
          if (!valid || saving || (status !== 'ok' && status !== 'unknown')) return
          setSaving(true)
          saveProfile({ username, phone, photo })
            .then(() => onDone({ username, photo }))
            .catch((err: unknown) => {
              if (err instanceof ApiError && err.code === 'username_taken') setStatus('taken')
              else setSaveError(err instanceof ApiError ? err.message : 'Could not save your profile. Try again.')
            })
            .finally(() => setSaving(false))
        }}
      >
        <div className="avatar-wrap">
          <button
            type="button"
            className="avatar"
            aria-label={photo ? 'Change profile photo' : 'Add profile photo'}
            onClick={() => fileRef.current?.click()}
          >
            {photo ? (
              <img src={photo} alt="Your profile" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c1-4.2 4-6 8-6s7 1.8 8 6" />
              </svg>
            )}
            <span className="avatar-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
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
                setPhotoError('')
                setCropFile(f)
              }
              e.target.value = ''
            }}
          />
          {photo ? (
            <p className="photo-links">
              <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>
                Change photo
              </button>
              <button type="button" className="link-btn" onClick={() => setPhoto(null)}>
                Remove
              </button>
            </p>
          ) : (
            <p className="hint center">Add a photo so friends recognise you. You can skip this.</p>
          )}
          {photoError && <p className="error center">{photoError}</p>}
        </div>

        <div className="pill">
          <span className="prefix" aria-hidden="true">@</span>
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            placeholder="username"
            aria-label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          />
        </div>
        <p className={message.kind === 'hint' ? 'hint' : message.kind === 'ok' ? 'ok' : 'error'}>{message.text}</p>

        <div className="spacer" />
        {saveError && <p className="error center">{saveError}</p>}
        <button type="submit" className="btn" disabled={status === 'checking' || saving}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </AuthLayout>
  )
}
