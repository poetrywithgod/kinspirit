import { useEffect, useState } from 'react'
import { ApiError, cancelMeeting, createMeeting, meetingDetails, myMeetings, type Meeting, type Person } from '../api'
import { joinCall } from '../call'
import { meetingLink, shareMeeting } from '../invite'
import { usePolling } from '../usePolling'
import { ContactPicker } from './ContactPicker'
import { PlusIcon } from './icons'

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** The value a datetime-local box wants: local time, "YYYY-MM-DDTHH:MM". */
const localValue = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const nextHour = () => {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d
}

const LENGTHS = [15, 30, 45, 60, 90, 120, 180]
const lengthLabel = (m: number) => (m < 60 ? `${m} minutes` : m === 60 ? '1 hour' : `${m / 60} hours`)

function stateNote(m: Meeting): string {
  if (m.state === 'cancelled') return 'This meeting was cancelled.'
  if (m.state === 'ended') return 'This meeting has ended.'
  if (m.state === 'upcoming' && !m.is_host) return `It opens 10 minutes before the start, at ${when(m.starts_at)}.`
  return ''
}

export function MeetingsTab({ linkId, onLinkDone }: { linkId?: string | null; onLinkDone?: () => void }) {
  const [list, setList] = useState<Meeting[] | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [shown, setShown] = useState<Meeting | null>(null) // a meeting opened from a link

  const load = async () => {
    try {
      setList(await myMeetings())
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your meetings.')
    }
  }
  usePolling(load, 30000)

  // Someone sent me a meeting link.
  useEffect(() => {
    if (!linkId) return
    let dead = false
    meetingDetails(linkId)
      .then((m) => {
        if (dead) return
        if (m) setShown(m)
        else setNote('That meeting link does not work any more.')
      })
      .catch(() => !dead && setNote('Could not open that meeting. Check your internet and try again.'))
      .finally(() => onLinkDone?.())
    return () => {
      dead = true
    }
  }, [linkId, onLinkDone])

  const join = (m: Meeting) => {
    const why = stateNote(m)
    if (why) return setNote(why)
    setShown(null)
    void joinCall({ id: m.id, name: m.title, kind: 'group', meeting: true })
  }

  const share = async (m: Meeting) => {
    const r = await shareMeeting(m.title, when(m.starts_at), m.id)
    if (r === 'copied') setNote('Meeting message copied. Paste it in any chat.')
    if (r === 'failed') setNote(`Copy this link: ${meetingLink(m.id)}`)
  }

  const cancel = async (m: Meeting) => {
    if (!window.confirm(`Cancel "${m.title}"? People who have the link will see that it was cancelled.`)) return
    try {
      await cancelMeeting(m.id)
      setNote('Meeting cancelled.')
      void load()
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'Could not cancel. Try again.')
    }
  }

  const startNow = async () => {
    try {
      const id = await createMeeting({ title: 'Quick meeting', startsAt: new Date(), minutes: 60, invitees: [] })
      void load()
      void joinCall({ id, name: 'Quick meeting', kind: 'group', meeting: true })
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'Could not start the meeting. Try again.')
    }
  }

  const live = (list ?? []).filter((m) => m.state === 'open')
  const coming = (list ?? []).filter((m) => m.state === 'upcoming')
  const past = (list ?? []).filter((m) => m.state === 'ended' || m.state === 'cancelled')

  const card = (m: Meeting) => (
    <li key={m.id} className="settings-card meeting-card">
      <div className="meeting-top">
        <strong>{m.title}</strong>
        {m.state === 'open' && <span className="live-chip">Open now</span>}
        {m.state === 'cancelled' && <span className="muted">Cancelled</span>}
        {m.state === 'ended' && <span className="muted">Ended</span>}
      </div>
      <p className="muted">
        {when(m.starts_at)} · {lengthLabel(m.duration_min)} · {m.is_host ? 'You are hosting' : `Host @${m.host_username}`}
        {m.is_host && m.invited ? ` · ${m.invited} invited` : ''}
      </p>
      {(m.state === 'open' || m.state === 'upcoming') && (
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => join(m)} disabled={m.state === 'upcoming' && !m.is_host}>
            {m.state === 'upcoming' && !m.is_host ? 'Not open yet' : m.is_host && m.state === 'upcoming' ? 'Start early' : 'Join'}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => void share(m)}>
            Share link
          </button>
          {m.is_host && (
            <button type="button" className="btn btn-quiet" onClick={() => void cancel(m)}>
              Cancel meeting
            </button>
          )}
        </div>
      )}
    </li>
  )

  return (
    <section className="tab">
      <div className="settings-card">
        <h1 className="tab-title">Meetings</h1>
        <p className="muted">Group calls for up to 150 people. Share a link, and anyone who is signed in can join.</p>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => void startNow()}>
            Start now
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setScheduling(true)}>
            <PlusIcon /> Schedule
          </button>
        </div>
      </div>
      {note && (
        <p className="notice" role="status" onClick={() => setNote('')}>
          {note}
        </p>
      )}
      {error && <p className="error center">{error}</p>}
      {list === null && !error && <p className="muted center">Loading…</p>}
      {list !== null && list.length === 0 && <p className="muted center">No meetings yet. Tap Schedule to plan one.</p>}
      {live.length > 0 && <ul className="meeting-list">{live.map(card)}</ul>}
      {coming.length > 0 && (
        <>
          <h2 className="list-head">Coming up</h2>
          <ul className="meeting-list">{coming.map(card)}</ul>
        </>
      )}
      {past.length > 0 && (
        <>
          <h2 className="list-head">Recent</h2>
          <ul className="meeting-list">{past.map(card)}</ul>
        </>
      )}

      {scheduling && (
        <ScheduleSheet
          onClose={() => setScheduling(false)}
          onCreated={() => {
            setScheduling(false)
            setNote('Meeting scheduled. Tap Share link on it to send the link to anyone.')
            void load()
          }}
        />
      )}

      {shown && (
        <div className="sheet-wrap" onClick={() => setShown(null)}>
          <div className="sheet" role="dialog" aria-label="Meeting" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">{shown.title}</p>
            <p className="muted">
              {when(shown.starts_at)} · {lengthLabel(shown.duration_min)}
              <br />
              Host @{shown.host_username}
            </p>
            {stateNote(shown) && <p className="muted">{stateNote(shown)}</p>}
            <div className="sheet-actions">
              <button type="button" className="btn btn-quiet" onClick={() => setShown(null)}>
                Close
              </button>
              <button type="button" className="btn" disabled={!!stateNote(shown)} onClick={() => join(shown)}>
                Join meeting
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ScheduleSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [at, setAt] = useState(localValue(nextHour()))
  const [mins, setMins] = useState(60)
  const [picked, setPicked] = useState<Map<string, Person>>(new Map())
  const [showPeople, setShowPeople] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggle = (p: Person) =>
    setPicked((prev) => {
      const n = new Map(prev)
      if (n.has(p.id)) n.delete(p.id)
      else n.set(p.id, p)
      return n
    })

  const save = async () => {
    const startsAt = new Date(at)
    if (!title.trim()) return setError('Give the meeting a name.')
    if (Number.isNaN(startsAt.getTime())) return setError('Pick a date and time.')
    setBusy(true)
    setError('')
    try {
      await createMeeting({ title: title.trim(), startsAt, minutes: mins, invitees: [...picked.keys()] })
      onCreated()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not schedule the meeting. Try again.')
      setBusy(false)
    }
  }

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label="Schedule a meeting" onClick={(e) => e.stopPropagation()}>
        <p className="sheet-title">Schedule a meeting</p>
        <input className="sheet-input" placeholder="Meeting name" aria-label="Meeting name" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        <label className="field-label">
          When
          <input className="sheet-input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <label className="field-label">
          How long
          <select className="sheet-input" value={mins} onChange={(e) => setMins(Number(e.target.value))}>
            {LENGTHS.map((m) => (
              <option key={m} value={m}>
                {lengthLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-quiet wide" onClick={() => setShowPeople((v) => !v)}>
          {picked.size ? `${picked.size} invited` : 'Invite from your contacts'} {showPeople ? '▲' : '▼'}
        </button>
        {showPeople && <ContactPicker selected={new Set(picked.keys())} onToggle={toggle} />}
        <p className="muted">After saving you get a link to share. Anyone who is signed in can join with it.</p>
        {error && <p className="error">{error}</p>}
        <div className="sheet-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
