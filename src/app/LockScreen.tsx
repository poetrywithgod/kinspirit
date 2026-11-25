import { useEffect, useRef, useState } from 'react'
import { PatternLayer } from '../PatternLayer'
import { unlockWithDevice } from '../appLock'

/** Covers the whole app until the phone confirms it is the owner (fingerprint, face or screen lock). */
export function LockScreen({ onUnlock, onLogout }: { onUnlock: () => void; onLogout: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const asked = useRef(false)

  const unlock = async () => {
    if (busy) return
    setBusy(true)
    setMsg('')
    const r = await unlockWithDevice()
    if (r === 'ok') return onUnlock()
    setMsg(
      r === 'cancelled'
        ? 'Not unlocked. Tap Unlock to try again.'
        : 'This phone could not check your fingerprint or face. Try again, or log out and use your password.',
    )
    setBusy(false)
  }

  useEffect(() => {
    if (asked.current) return
    asked.current = true
    void unlock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="lock-screen" role="dialog" aria-modal="true" aria-label="Kinspirit is locked">
      <PatternLayer />
      <span className="auth-logo lock-logo" role="img" aria-label="Kinspirit logo" />
      <h1>Kinspirit is locked</h1>
      <p>Use your fingerprint, face or screen lock to open it.</p>
      {msg && (
        <p className="lock-msg" role="status">
          {msg}
        </p>
      )}
      <button type="button" className="btn" onClick={() => void unlock()} disabled={busy}>
        {busy ? 'Waiting…' : 'Unlock'}
      </button>
      <button type="button" className="lock-link" onClick={onLogout}>
        Log out instead
      </button>
    </main>
  )
}
