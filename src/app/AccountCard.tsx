import { useEffect, useState } from 'react'
import { ApiError, USERNAME_RE, changePassword, changeUsername, deleteAccount, isUsernameAvailable, usernameLockedUntil } from '../api'
import { signOutLocal } from '../supabase'
import { disableLock } from '../appLock'
import { PasswordField } from '../PasswordField'

type Open = null | 'username' | 'password' | 'delete'

export function AccountCard({ username, onUsernameChange }: { username: string; onUsernameChange: (u: string) => void }) {
  const [open, setOpen] = useState<Open>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // username form
  const [name, setName] = useState('')
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null)
  const [sure, setSure] = useState(false) // second step: "this locks it for 30 days"
  const [avail, setAvail] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle')
  // password form
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  // delete-account form
  const [typed, setTyped] = useState('')
  const [delPw, setDelPw] = useState('')

  const close = () => {
    setOpen(null)
    setError('')
    setName('')
    setCur('')
    setPw('')
    setTyped('')
    setDelPw('')
    setAvail('idle')
    setSure(false)
  }

  const candidate = name.trim().toLowerCase()
  useEffect(() => {
    if (open !== 'username' || candidate === username || !USERNAME_RE.test(candidate)) {
      setAvail('idle')
      return
    }
    setAvail('checking')
    let dead = false
    const t = setTimeout(() => {
      isUsernameAvailable(candidate)
        .then((ok) => !dead && setAvail(ok ? 'ok' : 'taken'))
        .catch(() => !dead && setAvail('idle'))
    }, 400)
    return () => {
      dead = true
      clearTimeout(t)
    }
  }, [candidate, open, username])

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.')

  const saveName = async () => {
    if (candidate === username) return close()
    if (!sure) return setSure(true)
    setBusy(true)
    setError('')
    try {
      const saved = await changeUsername(candidate)
      onUsernameChange(saved)
      close()
      setMsg(`Your username is now @${saved}. You can change it again in 30 days. Your old profile link no longer works, so share the new one below.`)
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }

  const savePassword = async () => {
    if (!cur) return setError('Enter your current password.')
    if (pw.length < 8) return setError('Use at least 8 characters for the new password.')
    setBusy(true)
    setError('')
    try {
      await changePassword(cur, pw)
      close()
      setMsg('Password changed.')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'invalid_credentials') setError('Your current password is wrong.')
      else fail(e)
    }
    setBusy(false)
  }

  const removeAccount = async () => {
    if (typed.trim().toLowerCase() !== username) return setError('Type your username exactly to confirm.')
    if (!delPw) return setError('Enter your password.')
    setBusy(true)
    setError('')
    try {
      await deleteAccount(delPw)
      disableLock()
      signOutLocal()
      window.location.replace('/')
      return
    } catch (e) {
      if (e instanceof ApiError && e.code === 'invalid_credentials') setError('Your password is wrong.')
      else fail(e)
    }
    setBusy(false)
  }

  return (
    <div className="settings-card">
      <h2 className="section-title flush">Account</h2>
      {msg && (
        <p className="muted" role="status">
          {msg}
        </p>
      )}

      {open === null && (
        <div className="link-actions">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setMsg('')
              setName(username)
              setLockedUntil(null)
              void usernameLockedUntil().then(setLockedUntil).catch(() => undefined)
              setOpen('username')
            }}
          >
            Change username
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setMsg('')
              setOpen('password')
            }}
          >
            Change password
          </button>
          <button
            type="button"
            className="btn btn-quiet danger-text"
            onClick={() => {
              setMsg('')
              setOpen('delete')
            }}
          >
            Delete account
          </button>
        </div>
      )}

      {open === 'delete' && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void removeAccount()
          }}
        >
          <p className="error" style={{ fontWeight: 700 }}>
            This deletes your account for good.
          </p>
          <ul className="muted delete-list">
            <li>Your login, profile, contacts and settings are removed.</li>
            <li>You leave all groups. If you were the only admin, another member becomes admin.</li>
            <li>Your one-to-one chats are removed for the other person too, and messages you sent are deleted.</li>
            <li>Files saved on this phone are removed. Your username becomes free for anyone to take.</li>
            <li>This cannot be undone.</li>
          </ul>
          <input
            className="sheet-input"
            aria-label={`Type ${username} to confirm`}
            placeholder={`Type ${username} to confirm`}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              setError('')
            }}
          />
          <PasswordField className="pill" value={delPw} onChange={(v) => { setDelPw(v); setError('') }} autoComplete="current-password" placeholder="Your password" label="Your password" />
          {error && <p className="error">{error}</p>}
          <div className="sheet-actions">
            <button type="button" className="btn btn-quiet" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn delete-confirm" disabled={busy || typed.trim().toLowerCase() !== username || !delPw}>
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </form>
      )}

      {open === 'username' && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void saveName()
          }}
        >
          <input
            className="sheet-input"
            aria-label="New username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            value={name}
            onChange={(e) => {
              setName(e.target.value.replace(/^@/, ''))
              setSure(false)
              setError('')
            }}
          />
          <p className={avail === 'taken' || (name && !USERNAME_RE.test(candidate)) ? 'error' : 'muted'}>
            {!USERNAME_RE.test(candidate)
              ? 'Letters, numbers and underscore, 3 to 20 characters.'
              : avail === 'checking'
                ? 'Checking…'
                : avail === 'taken'
                  ? 'That username is taken.'
                  : avail === 'ok'
                    ? 'Available.'
                    : 'Letters, numbers and underscore.'}
          </p>
          <p className={lockedUntil ? 'error' : 'muted'}>
            {lockedUntil
              ? `You changed your username recently. You can change it again on ${lockedUntil.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.`
              : 'You can change your username only once every 30 days. Your profile link changes too, and friends who have the old link will need the new one.'}
          </p>
          {sure && !lockedUntil && (
            <p className="error" role="alert">
              Change to @{candidate}? After this you cannot change it again for 30 days. Tap Yes, change it to confirm.
            </p>
          )}
          {error && <p className="error">{error}</p>}
          <div className="sheet-actions">
            <button type="button" className="btn btn-quiet" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={busy || !!lockedUntil || !USERNAME_RE.test(candidate) || avail === 'taken'}>
              {busy ? 'Saving…' : sure ? 'Yes, change it' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {open === 'password' && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void savePassword()
          }}
        >
          <PasswordField className="pill" value={cur} onChange={(v) => { setCur(v); setError('') }} autoComplete="current-password" placeholder="Current password" label="Current password" />
          <PasswordField className="pill" value={pw} onChange={(v) => { setPw(v); setError('') }} autoComplete="new-password" placeholder="New password (8+ characters)" label="New password" />
          {error && <p className="error">{error}</p>}
          <div className="sheet-actions">
            <button type="button" className="btn btn-quiet" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
