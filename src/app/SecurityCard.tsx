import { useEffect, useState } from 'react'
import { disableLock, enableLock, lockEnabledFor, lockSupported } from '../appLock'
import { currentSession } from '../api'

export function SecurityCard({ username }: { username: string }) {
  const userId = currentSession()?.user.id
  const [supported, setSupported] = useState<boolean | null>(null)
  const [on, setOn] = useState(() => lockEnabledFor(userId))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void lockSupported().then(setSupported)
  }, [])

  const toggle = async () => {
    if (busy || !userId) return
    setMsg('')
    if (on) {
      disableLock()
      setOn(false)
      return
    }
    setBusy(true)
    const r = await enableLock(userId, username)
    setBusy(false)
    if (r === 'ok') {
      setOn(true)
      setMsg('Done. Kinspirit will ask for your fingerprint, face or screen lock when you open it.')
    } else {
      setMsg(
        r === 'cancelled'
          ? 'Not switched on. You need to confirm with your fingerprint, face or screen lock.'
          : 'This phone could not set that up. Make sure a fingerprint, face or screen lock is set in your phone settings.',
      )
    }
  }

  return (
    <div className="settings-card">
      <h2 className="section-title flush">Security</h2>
      {supported === false ? (
        <p className="muted">This phone or browser does not support fingerprint or face unlock for Kinspirit.</p>
      ) : (
        <>
          <label className="switch-row">
            <input type="checkbox" role="switch" checked={on} disabled={busy || supported === null} onChange={() => void toggle()} />
            <span>
              <strong>Unlock with fingerprint or face</strong>
              <span className="muted" style={{ display: 'block' }}>
                Asks every time you open Kinspirit, and after it has been away for a minute. This phone only.
              </span>
            </span>
          </label>
          {msg && (
            <p className="muted" role="status">
              {msg}
            </p>
          )}
        </>
      )}
    </div>
  )
}
