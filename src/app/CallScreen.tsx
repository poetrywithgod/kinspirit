import { useEffect, useState } from 'react'
import { PatternLayer } from '../PatternLayer'
import {
  clearCallError,
  hostAction,
  leaveCall,
  showCall,
  canRecordScreen,
  cycleSpeaker,
  startRecording,
  stopRecording,
  toggleMic,
  useCall,
  type Row,
} from '../call'
import { acceptIncoming, declineIncoming, useIncoming } from '../incoming'
import { fmtDur } from '../time'
import { Avatar } from './Avatar'
import { CloseIcon, DotsIcon, DownIcon, HangupIcon, AnswerIcon, LockIcon, MicIcon, MicOffIcon, PhoneIcon, RecordIcon, SpeakerIcon, AddPersonIcon, ScreenShareIcon, VideoIcon } from './icons'

function useElapsed(since: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [since])
  return since ? Math.floor((now - since) / 1000) : 0
}

/** Runs the full-screen call and the slim "in call" bar, whichever is needed. */
export function CallLayer() {
  const c = useCall()
  const secs = useElapsed(c.startedAt)
  const [menu, setMenu] = useState<Row | null>(null)
  const [soon, setSoon] = useState('')

  useEffect(() => {
    document.documentElement.classList.toggle('in-call', c.phase !== 'idle' && !c.open)
    return () => document.documentElement.classList.remove('in-call')
  }, [c.phase, c.open])

  useEffect(() => {
    if (!soon) return
    const t = setTimeout(() => setSoon(''), 3000)
    return () => clearTimeout(t)
  }, [soon])

  // Notes (like "Everyone has been muted") fade away by themselves.
  useEffect(() => {
    if (!c.notice && !c.error) return
    const t = setTimeout(clearCallError, c.error ? 8000 : 4500)
    return () => clearTimeout(t)
  }, [c.notice, c.error])

  if (c.phase === 'idle') {
    return c.error ? (
      <div className="toast" role="alert">
        <span>{c.error}</span>
        <button type="button" className="toast-x" aria-label="Close" onClick={clearCallError}>
          <CloseIcon />
        </button>
      </div>
    ) : null
  }

  if (!c.open) {
    return (
      <button type="button" className="call-bar" onClick={() => showCall(true)}>
        <PhoneIcon />
        <span className="call-bar-title">In call · {c.title}</span>
        <span className="call-bar-time">{fmtDur(secs)}</span>
        {c.recording && <span className="rec-dot" aria-label="Recording" />}
      </button>
    )
  }

  const isHost = c.role === 'host'
  const other = c.people.find((p) => !p.me)
  const connecting = c.phase === 'connecting'

  return (
    <div className="call" role="dialog" aria-label="Call">
      <PatternLayer />
      <header className="call-top">
        <button type="button" className="icon-btn" aria-label="Minimise the call" onClick={() => showCall(false)}>
          <DownIcon />
        </button>
        <div className="call-head">
          <p className="call-title">{c.title}</p>
          <p className="call-sub">
            {connecting
              ? 'Connecting…'
              : c.dial === 'calling'
                ? 'Calling…'
                : c.dial === 'ringing'
                  ? 'Ringing…'
                  : c.direct
                    ? 'Voice call'
                    : `${c.people.length} in call · ${fmtDur(secs)}`}
            {c.locked && ' · Mics locked'}
          </p>
        </div>
      </header>

      {c.recording && (
        <p className="rec-banner" role="status">
          <span className="rec-dot" aria-hidden="true" /> {c.recordingBy === 'You' ? c.recKind === 'screen' ? 'You are recording your screen and this call' : 'You are recording this call' : `${c.recordingBy} is recording this call`}
        </p>
      )}
      {(soon || c.notice) && <p className="call-note">{soon || c.notice}</p>}

      {c.direct ? (
        <div className="duo">
          <div className={`duo-avatar${other?.speaking ? ' speaking' : ''}${c.dial !== 'none' || connecting ? ' calling' : ''}`}>
            <span className="duo-ring" aria-hidden="true" />
            <span className="duo-ring r2" aria-hidden="true" />
            <Avatar src={null} name={c.title.replace(/^@/, '')} size={132} />
          </div>
          <p className="duo-name">{c.title}</p>
          <p className="duo-state">
            {connecting
              ? 'Connecting…'
              : c.dial === 'ringing'
                ? 'Their phone is ringing…'
                : c.dial === 'calling'
                  ? 'Waiting for them to come online…'
                  : other?.muted
                    ? 'Their mic is off'
                    : other?.speaking
                      ? 'Talking…'
                      : 'Listening'}
          </p>
          {c.dial === 'none' && !connecting && <p className="duo-time">{fmtDur(secs)}</p>}
        </div>
      ) : (
        <ul className="people">
          {c.people.map((p) => (
            <li key={p.id} className={`person-row${p.speaking ? ' speaking' : ''}`}>
              <Avatar src={null} name={p.name} size={46} />
              <span className="row-main">
                <span className="row-name">
                  @{p.name}
                  {p.me ? ' (you)' : ''}
                </span>
                {p.host && <span className="role small">Host</span>}
              </span>
              <span className={`mic-state${p.muted ? ' off' : ''}`} aria-label={p.muted ? 'Muted' : 'Mic on'}>
                {p.muted ? <MicOffIcon /> : <MicIcon />}
              </span>
              {isHost && !p.me && (
                <button type="button" className="icon-btn" aria-label={`Options for ${p.name}`} onClick={() => setMenu(p)}>
                  <DotsIcon />
                </button>
              )}
            </li>
          ))}
          {connecting && <li className="muted center">Joining…</li>}
        </ul>
      )}

      <footer className="call-dock">
        <div className="dock-grid">
          <button type="button" className="ctl" onClick={() => void cycleSpeaker()}>
            <SpeakerIcon />
            <span>Speaker</span>
          </button>
          <button type="button" className="ctl" onClick={() => setSoon('Adding someone to a call is coming soon.')}>
            <AddPersonIcon />
            <span>Add</span>
          </button>
          <button type="button" className="ctl soon" onClick={() => setSoon('Screen sharing is coming soon.')}>
            <ScreenShareIcon />
            <span>Share</span>
          </button>
          <button type="button" className="ctl soon" onClick={() => setSoon('Switching to video is coming soon.')}>
            <VideoIcon />
            <span>Video</span>
          </button>
          {isHost && (
            <>
              <button
                type="button"
                className={`ctl${c.recording && c.recKind !== 'screen' ? ' on' : ''}`}
                disabled={c.recording && c.recKind === 'screen'}
                onClick={() => void (c.recording ? stopRecording() : startRecording('audio'))}
              >
                <RecordIcon />
                <span>{c.recording && c.recKind !== 'screen' ? 'Stop' : 'Record'}</span>
              </button>
              {canRecordScreen() && (
                <button
                  type="button"
                  className={`ctl${c.recording && c.recKind === 'screen' ? ' on' : ''}`}
                  disabled={c.recording && c.recKind !== 'screen'}
                  onClick={() => void (c.recording ? stopRecording() : startRecording('screen'))}
                >
                  <RecordIcon />
                  <span>{c.recording && c.recKind === 'screen' ? 'Stop' : 'Rec screen'}</span>
                </button>
              )}
              {!c.direct && (
                <>
                  <button type="button" className="ctl" onClick={() => void hostAction('mute_all')}>
                    <MicOffIcon />
                    <span>Mute all</span>
                  </button>
                  <button type="button" className={`ctl${c.locked ? ' on' : ''}`} onClick={() => void hostAction(c.locked ? 'unlock_all' : 'lock_all')}>
                    <LockIcon />
                    <span>{c.locked ? 'Unlock' : 'Lock mics'}</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
        <div className="dock-main">
          <button
            type="button"
            className={`ctl big${c.micOn ? '' : ' off'}`}
            disabled={!c.canSpeak || connecting}
            aria-label={c.micOn ? 'Mute yourself' : 'Unmute yourself'}
            onClick={() => void toggleMic()}
          >
            {c.micOn ? <MicIcon /> : <MicOffIcon />}
            <span>{c.canSpeak ? (c.micOn ? 'Mute' : 'Unmute') : 'Locked'}</span>
          </button>
          <button type="button" className="ctl leave" aria-label="Leave call" onClick={leaveCall}>
            <HangupIcon />
            <span>{c.direct ? 'End' : 'Leave'}</span>
          </button>
        </div>
      </footer>

      {menu && (
        <div className="sheet-wrap" onClick={() => setMenu(null)}>
          <div className="sheet" role="dialog" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">@{menu.name}</p>
            <button
              type="button"
              className="menu-item danger"
              onClick={() => {
                void hostAction('remove', menu.id)
                setMenu(null)
              }}
            >
              Remove from call
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Full-screen "someone is calling you" with Accept and Decline. */
export function IncomingLayer() {
  const c = useIncoming()
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 4000)
    return () => clearTimeout(t)
  }, [msg])
  if (!c) {
    return msg ? (
      <div className="toast" role="alert">
        <span>{msg}</span>
        <button type="button" className="toast-x" aria-label="Close" onClick={() => setMsg('')}>
          <CloseIcon />
        </button>
      </div>
    ) : null
  }
  const group = c.kind === 'group'
  return (
    <div className="incoming" role="alertdialog" aria-label="Incoming call">
      <PatternLayer />
      <div className="incoming-body">
        <div className="incoming-ring">
          <Avatar src={c.caller_avatar} name={c.caller_username} size={104} />
        </div>
        <p className="incoming-name">@{c.caller_username}</p>
        <p className="incoming-sub">{group ? `is calling ${c.title ?? 'the group'}` : 'Kinspirit audio call…'}</p>
      </div>
      <div className="incoming-actions">
        <button type="button" className="ctl leave" aria-label="Decline" onClick={() => void declineIncoming()}>
          <HangupIcon />
          <span>Decline</span>
        </button>
        <button type="button" className="ctl accept" aria-label="Accept" onClick={() => void acceptIncoming().then(setMsg)}>
          <AnswerIcon />
          <span>Accept</span>
        </button>
      </div>
    </div>
  )
}
