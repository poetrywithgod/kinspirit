import { useState } from 'react'
import { reportUserRpc, type Person } from '../api'
import { blockPerson, useBlocks } from '../blocks'

const REASONS = ['Spam', 'Harassment or abuse', 'Inappropriate content', 'Pretending to be someone else', 'Something else']

/** Pick a reason, send the report, and offer to block the person too. */
export function ReportSheet({
  person,
  messageId,
  conversationId,
  onClose,
}: {
  person: Person
  messageId?: string
  conversationId?: string
  onClose: () => void
}) {
  const { isBlocked } = useBlocks()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const send = async (reason: string) => {
    setBusy(true)
    setErr('')
    try {
      await reportUserRpc(person.id, reason, messageId, conversationId)
      setDone(true)
    } catch {
      setErr('Could not send the report. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Report" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <p className="sheet-title">Thanks. We will look at your report.</p>
            {!isBlocked(person.id) && (
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  blockPerson(person)
                    .catch(() => undefined)
                    .finally(onClose)
                }}
              >
                Also block @{person.username}
              </button>
            )}
            <button type="button" className="cancel" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <p className="sheet-title">Report @{person.username}: what is the problem?</p>
            {REASONS.map((r) => (
              <button key={r} type="button" role="menuitem" disabled={busy} onClick={() => void send(r)}>
                {r}
              </button>
            ))}
            {err && <p className="error" role="alert">{err}</p>}
            <button type="button" className="cancel" onClick={onClose}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
