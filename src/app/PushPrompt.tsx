import { useEffect, useState } from 'react'
import { canAskForPush, enablePush } from '../push'

const KEY = 'kinspirit.pushask'

/** Asks once per visit (until they decide) whether to switch notifications on. Browsers only allow asking after a tap. */
export function PushPrompt() {
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let skip = false
    try {
      skip = sessionStorage.getItem(KEY) === '1'
    } catch {
      /* storage blocked: ask anyway */
    }
    if (skip || !canAskForPush()) return
    const t = setTimeout(() => setShow(true), 2500)
    return () => clearTimeout(t)
  }, [])

  if (!show) return null
  const later = () => {
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    setShow(false)
  }
  return (
    <div className="push-prompt" role="dialog" aria-label="Notifications">
      <p>
        <strong>Never miss a message or call.</strong> Turn on notifications so Kinspirit can tell you even when it is closed.
      </p>
      {err && <p className="error">{err}</p>}
      <div className="push-prompt-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => {
          setBusy(true)
          setErr('')
          enablePush()
            .then((s) => (s === 'on' || s === 'denied' ? setShow(false) : later()))
            .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Could not turn on notifications.'))
            .finally(() => setBusy(false))
        }}>
          {busy ? 'Turning on…' : 'Turn on'}
        </button>
        <button type="button" className="link-btn" onClick={later}>
          Not now
        </button>
      </div>
    </div>
  )
}
