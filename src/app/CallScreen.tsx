import { useEffect, useState } from 'react'
import { PatternLayer } from '../PatternLayer'
import {
  clearCallError,
  hostAction,
  leaveCall,
  showCall,
  canRecordScreen,
  canShareScreen,
  screenTrack,
  toggleScreenShare,
  warmRecorder,
  addToCall,
  cycleSpeaker,
  enableSound,
  startRecording,
  stopRecording,
  toggleMic,
  toggleCamera,
  videoTrackOf,
  useCall,
  type Row,
} from '../call'
import { acceptIncoming, declineIncoming, useIncoming } from '../incoming'
import { listContacts, myId, type Person } from '../api'
import { shareMeeting } from '../invite'
import { useMeetingChat } from '../meetingChat'
import { MeetingChatPanel } from './MeetingChatPanel'
import { fmtDur } from '../time'
import { Avatar } from './Avatar'
import { VideoTile } from './VideoTile'
import { ChatIcon, CloseIcon, DotsIcon, DownIcon, HangupIcon, AnswerIcon, LockIcon, MicIcon, MicOffIcon, PhoneIcon, RecordIcon, SpeakerIcon, AddPersonIcon, ScreenShareIcon, VideoIcon } from './icons'

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
  const [adding, setAdding] = useState<Person[] | null>(null)
  const [addFilter, setAddFilter] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [starting, setStarting] = useState<'audio' | 'screen'>('audio') // which Record button was pressed
  const hostLive = c.phase === 'live' && c.role === 'host'
  useEffect(() => {
    if (hostLive) warmRecorder()
  }, [hostLive])
  const chat = useMeetingChat(c.cid, c.meeting && c.phase === 'live', chatOpen, myId())
  const openAdd = () => {
    setAddFilter('')
    setAdding([])
    listContacts().then(setAdding).catch(() => setSoon('Could not load your contacts.'))
  }

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
        <span className="call-bar-title">{c.reconnecting ? 'Reconnecting…' : c.needsSound ? 'Tap to hear the call' : `In call · ${c.title}`}</span>
        <span className="call-bar-time">{fmtDur(secs)}</span>
        {c.recording && <span className="rec-dot" aria-label="Recording" />}
      </button>
    )
  }

  const isHost = c.role === 'host'
  const other = c.people.find((p) => !p.me)
  const connecting = c.phase === 'connecting'
  const withVideo = c.people.filter((p) => p.video && videoTrackOf(p.id))
  const screen = c.people.some((p) => p.sharing) ? screenTrack() : undefined
  const sharer = screen ? c.people.find((p) => p.id === screen.identity) : undefined

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
                    ? withVideo.length > 0
                      ? 'Video call'
                      : 'Voice call'
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
      {c.reconnecting && (
        <p className="call-note warn" role="status">
          Your connection dropped. Reconnecting…
        </p>
      )}
      {c.needsSound && (
        <button type="button" className="call-note sound-btn" onClick={enableSound}>
          🔈 Tap here to turn the call sound on
        </button>
      )}
      {(soon || c.notice) && <p className="call-note">{soon || c.notice}</p>}

      {screen && (
        <div className="screen-stage" aria-label="Shared screen">
          {sharer?.me ? (
            <div className="video-tile screen self-share">
              <p>You are sharing your screen.</p>
              <button type="button" className="btn" onClick={() => void toggleScreenShare()}>
                Stop sharing
              </button>
            </div>
          ) : (
            <VideoTile track={screen.track} name={`@${sharer?.name ?? 'Someone'}'s screen`} className="screen" />
          )}
        </div>
      )}

      {withVideo.length > 0 && (
        <div className={`video-stage n${Math.min(withVideo.length, 4)}`} aria-label="Video">
          {withVideo.map((p) => {
            const t = videoTrackOf(p.id)
            return t ? <VideoTile key={p.id} track={t} name={p.me ? 'You' : `@${p.name}`} mirror={p.me} className={p.me && c.direct && withVideo.length > 1 ? 'self' : ''} /> : null
          })}
        </div>
      )}

      {c.direct && c.people.length <= 2 && withVideo.length > 0 ? (
        <p className="duo-state compact" role="status">
          {c.peerAway ? 'They lost connection. Waiting for them to come back…' : other?.away ? 'They switched to another app.' : fmtDur(secs)}
        </p>
      ) : c.direct && c.people.length <= 2 ? (
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
                  : c.peerAway
                    ? 'They lost connection. Waiting for them to come back…'
                    : other?.away
                    ? 'They switched to another app. You cannot hear them until they come back.'
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
                {p.away && <span className="role small">In another app</span>}
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

      {chatOpen && c.meeting && (
        <MeetingChatPanel title={c.title} messages={chat.messages} me={myId()} onSend={chat.send} onClose={() => setChatOpen(false)} />
      )}

      <footer className="call-dock">
        <div className="dock-grid">
          <button type="button" className="ctl" onClick={() => void cycleSpeaker()}>
            <SpeakerIcon />
            <span>Speaker</span>
          </button>
          <button
            type="button"
            className="ctl"
            onClick={() => {
              if (!c.meeting) return openAdd()
              void shareMeeting(c.title, 'happening now', c.cid).then((r) => r === 'copied' && setSoon('Meeting link copied. Send it to anyone you want to invite.'))
            }}
          >
            <AddPersonIcon />
            <span>{c.meeting ? 'Invite' : 'Add'}</span>
          </button>
          {c.meeting && (
            <button type="button" className="ctl chat-ctl" onClick={() => setChatOpen(true)}>
              <ChatIcon />
              {chat.unread > 0 && <span className="nav-badge">{chat.unread > 9 ? '9+' : chat.unread}</span>}
              <span>Chat</span>
            </button>
          )}
          <button
            type="button"
            className={`ctl${c.sharing ? ' on' : ''}${canShareScreen() ? '' : ' soon'}`}
            aria-pressed={c.sharing}
            onClick={() => void toggleScreenShare()}
          >
            <ScreenShareIcon />
            <span>{c.sharing ? 'Stop sharing' : 'Share'}</span>
          </button>
          <button type="button" className={`ctl${c.camOn ? ' on' : ''}`} aria-pressed={c.camOn} onClick={() => void toggleCamera()}>
            <VideoIcon />
            <span>{c.camOn ? 'Stop video' : 'Video'}</span>
          </button>
          {isHost && (
            <>
              <button
                type="button"
                className={`ctl${(c.recording && c.recKind !== 'screen') || (c.recStarting && starting === 'audio') ? ' on' : ''}`}
                disabled={(c.recording && c.recKind === 'screen') || c.recStarting}
                onClick={() => {
                  if (c.recording) return void stopRecording()
                  setStarting('audio')
                  void startRecording('audio')
                }}
              >
                <RecordIcon />
                <span>{c.recording && c.recKind !== 'screen' ? 'Stop' : c.recStarting && starting === 'audio' ? 'Starting…' : 'Record'}</span>
              </button>
              {canRecordScreen() && (
                <button
                  type="button"
                  className={`ctl${(c.recording && c.recKind === 'screen') || (c.recStarting && starting === 'screen') ? ' on' : ''}`}
                  disabled={(c.recording && c.recKind !== 'screen') || c.recStarting}
                  onClick={() => {
                    if (c.recording) return void stopRecording()
                    setStarting('screen')
                    void startRecording('screen')
                  }}
                >
                  <RecordIcon />
                  <span>{c.recording && c.recKind === 'screen' ? 'Stop' : c.recStarting && starting === 'screen' ? 'Starting…' : 'Rec screen'}</span>
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

      {adding && (
        <div className="sheet-wrap" onClick={() => setAdding(null)}>
          <div className="sheet" role="dialog" aria-label="Add someone to the call" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">Add someone to this call</p>
            <input className="sheet-input" placeholder="Search your contacts" value={addFilter} onChange={(e) => setAddFilter(e.target.value)} />
            <ul className="add-list">
              {adding
                .filter((p) => !c.people.some((x) => x.id === p.id) && p.username.includes(addFilter.trim().toLowerCase().replace(/^@/, '')))
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="menu-item add-row"
                      onClick={() => {
                        void addToCall(p)
                        setAdding(null)
                      }}
                    >
                      <Avatar src={p.avatar_url} name={p.username} size={36} />
                      <span>@{p.username}</span>
                    </button>
                  </li>
                ))}
              {adding.length === 0 && <li className="muted center">No contacts yet. Add people in the Contacts tab first.</li>}
            </ul>
          </div>
        </div>
      )}

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
