import { useEffect, useState } from 'react'
import { ApiError, myId, profileSince, type Person } from '../api'
import { useCall } from '../call'
import { openDirect } from '../openChat'
import { PatternLayer } from '../PatternLayer'
import { Avatar } from './Avatar'
import { BackIcon } from './icons'
import { Lightbox } from './Lightbox'
import { ReportSheet } from './ReportSheet'
import { blockPerson, unblockPerson, useBlocks } from '../blocks'

/** Someone's profile: their display photo (tap to see it full size), username and when they joined. */
export function ProfileView({
  person,
  onClose,
  onMessage,
}: {
  person: Person
  onClose: () => void
  onMessage?: (p: Person) => void
}) {
  const [since, setSince] = useState<string | null>(null)
  const [photo, setPhoto] = useState(false)
  const [report, setReport] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [opening, setOpening] = useState<'' | 'chat' | 'call'>('')
  const inCall = useCall().phase !== 'idle'
  const { isBlocked } = useBlocks()
  const blocked = isBlocked(person.id)
  const me = myId()
  useEffect(() => {
    let dead = false
    profileSince(person.id)
      .then((d) => !dead && setSince(d))
      .catch(() => undefined)
    return () => {
      dead = true
    }
  }, [person.id])

  const go = async (call: boolean) => {
    if (opening) return
    setOpening(call ? 'call' : 'chat')
    setErr('')
    try {
      if (!call && onMessage) onMessage(person)
      else await openDirect(person, { call })
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not open the chat. Try again.')
    }
    setOpening('')
  }

  const joined = since ? new Date(since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : ''
  return (
    <div className="profile-view" role="dialog" aria-label={`@${person.username}`}>
      <PatternLayer />
      <header className="profile-top">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onClose}>
          <BackIcon />
        </button>
      </header>
      <div className="profile-body">
        {person.avatar_url ? (
          <button type="button" className="profile-photo" aria-label="View photo" onClick={() => setPhoto(true)}>
            <Avatar src={person.avatar_url} name={person.username} size={168} />
          </button>
        ) : (
          <span className="profile-photo static">
            <Avatar src={null} name={person.username} size={168} />
          </span>
        )}
        <h1 className="profile-name">@{person.username}</h1>
        {!person.avatar_url && <p className="muted">No profile photo yet</p>}
        {joined && <p className="muted">On Kinspirit since {joined}</p>}
        {me !== person.id && !blocked && (
          <div className="profile-actions">
            <button type="button" className="btn profile-action" disabled={!!opening} onClick={() => void go(false)}>
              {opening === 'chat' ? 'Opening…' : 'Message'}
            </button>
            <button
              type="button"
              className="btn btn-quiet profile-action"
              disabled={!!opening || inCall}
              title={inCall ? 'You are already in a call' : undefined}
              onClick={() => void go(true)}
            >
              {opening === 'call' ? 'Calling…' : 'Call'}
            </button>
          </div>
        )}
        {inCall && me !== person.id && !blocked && <p className="muted">Finish your current call to call @{person.username}.</p>}
        {me !== person.id && (
          <div className="profile-safety">
            {blocked ? (
              <button
                type="button"
                className="link-btn"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  setErr('')
                  unblockPerson(person.id)
                    .catch(() => setErr('Could not unblock. Try again.'))
                    .finally(() => setBusy(false))
                }}
              >
                Unblock @{person.username}
              </button>
            ) : (
              <button type="button" className="link-btn danger-text" onClick={() => setConfirm(true)}>
                Block @{person.username}
              </button>
            )}
            <button type="button" className="link-btn danger-text" onClick={() => setReport(true)}>
              Report @{person.username}
            </button>
            {err && <p className="error" role="alert">{err}</p>}
          </div>
        )}
      </div>
      {confirm && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setConfirm(false)}>
          <div className="sheet" role="dialog" aria-label="Block" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">Block @{person.username}? They will not be able to message or call you, and will not be told.</p>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                setErr('')
                blockPerson(person)
                  .catch(() => setErr('Could not block. Try again.'))
                  .finally(() => {
                    setBusy(false)
                    setConfirm(false)
                  })
              }}
            >
              Block
            </button>
            <button type="button" className="cancel" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {report && <ReportSheet person={person} onClose={() => setReport(false)} />}
      {photo && person.avatar_url && <Lightbox src={person.avatar_url} name={`@${person.username}`} onClose={() => setPhoto(false)} />}
    </div>
  )
}
