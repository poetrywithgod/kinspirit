import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ApiError, MAX_AUDIO_BYTES, audioPath, deleteMessage, editMessage, fetchMessages, markRead, myId, sendAudio, sendMessage, sendVoice, groupMembers, type Message } from '../api'
import { downloadAudio, keepOwnAudio, useLibrary } from '../library'
import { syncIncomingMedia } from '../mediaSync'
import { currentTrack, play, toggle, usePlayer } from '../player'
import { fmtSize } from '../time'
import { MiniPlayer } from './MiniPlayer'
import { callStatus } from '../api'
import { joinCall, showCall, startCall, useCall } from '../call'
import { VoiceBubble } from './VoiceBubble'
import { startRecording, type Recording } from '../recorder'
import { keepOwnVoice, useVoiceIds } from '../voice'
import { GroupInfo } from './GroupInfo'
import { PatternLayer } from '../PatternLayer'
import { clock } from '../time'
import { usePolling } from '../usePolling'
import { Avatar } from './Avatar'
import type { ChatTarget } from './ChatsTab'
import { BackIcon, ChevronDownIcon, ClipIcon, CloseIcon, CopyIcon, EditIcon, MicIcon, PhoneIcon, ReplyIcon, TrashIcon, DownloadIcon, MusicIcon, PauseIcon, PlayIcon, SendIcon } from './icons'

const newId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
      )

const PALETTE = ['#c42759', '#9b3fb5', '#2f7fb8', '#2e8f6b', '#b8742f', '#7a54c9', '#b03a3a', '#318a8f']
function senderColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

function merge(a: Message[], b: Message[]): Message[] {
  const map = new Map<string, Message>()
  for (const m of a) map.set(m.id, m)
  for (const m of b) {
    const old = map.get(m.id)
    map.set(m.id, old && !m.status ? { ...m, status: undefined } : m)
  }
  return [...map.values()].sort((x, y) =>
    x.created_at === y.created_at ? x.id.localeCompare(y.id) : x.created_at < y.created_at ? -1 : 1,
  )
}

function preview(m: Message | undefined): string {
  if (!m) return 'Original message'
  if (m.deleted_at) return '🚫 Message deleted'
  if (m.kind === 'voice') return '🎤 Voice note'
  if (m.kind === 'audio') return `🎵 ${m.file_name ?? m.body}`
  return m.body.length > 120 ? `${m.body.slice(0, 120)}…` : m.body
}

export function ChatView({
  chat,
  onBack,
  onRenamed,
}: {
  chat: ChatTarget
  onBack: () => void
  onRenamed: (title: string) => void
}) {
  const me = myId()
  const isGroup = chat.kind === 'group'
  const [info, setInfo] = useState(false)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [amAdmin, setAmAdmin] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const [menu, setMenu] = useState<Message | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)
  const asked = useRef(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const files = useRef(new Map<string, File>())
  const voices = useRef(new Map<string, { blob: Blob; seconds: number }>())
  const voiceIds = useVoiceIds()
  const call = useCall()
  const [callInfo, setCallInfo] = useState<{ active: boolean; count: number } | null>(null)
  const recentCall = messages.some((m) => m.kind === 'call' && Date.now() - new Date(m.created_at).getTime() < 6 * 3600 * 1000)
  const inThisCall = call.phase !== 'idle' && call.cid === chat.id
  usePolling(
    async () => {
      try {
        setCallInfo(await callStatus(chat.id))
      } catch {
        setCallInfo(null) // calls not set up, or offline: no banner
      }
    },
    8000,
    recentCall && !inThisCall,
  )
  const [rec, setRec] = useState<Recording | null>(null)
  const [recSecs, setRecSecs] = useState(0)
  const picker = useRef<HTMLInputElement>(null)
  const lib = useLibrary()
  const have = new Set((lib ?? []).map((x) => x.id))
  const player = usePlayer()
  const nowId = currentTrack(player)?.id
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState<Record<string, string>>({})
  const stick = useRef(true)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  // Only the server's own timestamps decide what to fetch next, so a wrong phone clock can never hide messages.
  const cursor = useRef<string | undefined>(undefined)
  const lastServerTime = () =>
    cursor.current ? new Date(new Date(cursor.current).getTime() - 120000).toISOString() : undefined

  usePolling(async () => {
    try {
      const after = lastServerTime()
      const rows = await fetchMessages(chat.id, after)
      setLoaded(true)
      setError('')
      if (rows.length) {
        const newest = rows.reduce((t, r) => ((r.updated_at ?? r.created_at) > t ? (r.updated_at ?? r.created_at) : t), '')
        if (!cursor.current || newest > cursor.current) cursor.current = newest
        // The look-back re-fetches a few recent rows; only react to what is new or changed.
        const known = new Map(messagesRef.current.map((m) => [m.id, m]))
        const changed = rows.filter((r) => known.get(r.id)?.updated_at !== r.updated_at)
        if (changed.length) setMessages((cur) => merge(cur, changed))
        if (rows.some((m) => m.sender_id !== me && !known.has(m.id))) {
          void markRead(chat.id).catch(() => {})
          void syncIncomingMedia() // new voice notes and audio are saved to this phone right away
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load messages.')
    }
  }, 4000)

  useEffect(() => {
    void markRead(chat.id).catch(() => {})
  }, [chat.id])

  // In groups, learn who is who. Asks again when a message arrives from someone not known yet
  // (a new member), but at most once every 10 seconds.
  useEffect(() => {
    if (!isGroup) return
    const unknown = messages.some((m) => m.sender_id !== me && !names.has(m.sender_id))
    if ((names.size === 0 || unknown) && Date.now() - asked.current > 10000) {
      asked.current = Date.now()
      groupMembers(chat.id)
        .then((ms) => {
          setNames(new Map(ms.map((x) => [x.id, x.username])))
          setAmAdmin(ms.some((x) => x.id === me && x.role === 'admin'))
        })
        .catch(() => {})
    }
  }, [isGroup, messages, names, chat.id, me])

  useLayoutEffect(() => {
    const el = list.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages, loaded])

  const onScroll = () => {
    const el = list.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const push = useCallback(
    (m: Message) => {
      const file = files.current.get(m.id)
      const vo = voices.current.get(m.id)
      const job =
        m.kind === 'voice' && vo
          ? sendVoice({ id: m.id, conversation_id: m.conversation_id, blob: vo.blob, seconds: vo.seconds })
          : m.kind === 'audio' && file
          ? sendAudio({ id: m.id, conversation_id: m.conversation_id, file })
          : sendMessage({ id: m.id, conversation_id: m.conversation_id, body: m.body, reply_to: m.reply_to })
      job
        .then(() => {
          setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, status: undefined } : x)))
        })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.code === 'too_large') setError(e.message)
          setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, status: 'failed' } : x)))
        })
    },
    [],
  )

  const send = () => {
    const body = text.trim()
    if (!body) return
    if (editing) return void saveEdit(body)
    const m: Message = {
      id: newId(),
      conversation_id: chat.id,
      sender_id: me,
      body,
      created_at: new Date().toISOString(),
      reply_to: replyTo?.id ?? null,
      status: 'sending',
    }
    stick.current = true
    setMessages((cur) => merge(cur, [m]))
    setText('')
    setReplyTo(null)
    push(m)
  }

  const saveEdit = async (body: string) => {
    const target = editing
    if (!target) return
    if (body === target.body) {
      setEditing(null)
      setText('')
      return
    }
    setBusy(true)
    try {
      await editMessage(target.id, body)
      setMessages((cur) => cur.map((x) => (x.id === target.id ? { ...x, body, edited_at: new Date().toISOString() } : x)))
      setEditing(null)
      setText('')
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not edit that message.')
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async (target: Message) => {
    setConfirmDelete(null)
    setBusy(true)
    try {
      await deleteMessage(target.id)
      setMessages((cur) => cur.map((x) => (x.id === target.id ? { ...x, deleted_at: new Date().toISOString() } : x)))
      if (replyTo?.id === target.id) setReplyTo(null)
      if (editing?.id === target.id) {
        setEditing(null)
        setText('')
      }
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete that message.')
    } finally {
      setBusy(false)
    }
  }

  const who = (id: string) => (id === me ? 'You' : isGroup ? `@${names.get(id) ?? '…'}` : chat.name)

  const jumpTo = (id: string) => {
    const el = list.current?.querySelector<HTMLElement>(`[data-mid="${id}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('flash')
    window.setTimeout(() => el.classList.remove('flash'), 1200)
  }

  const pickAudio = (file: File | undefined) => {
    if (!file) return
    const isAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|opus|wav|flac|amr|wma)$/i.test(file.name)
    if (!isAudio) return setError('Choose an audio file (like MP3 or M4A).')
    if (file.size > MAX_AUDIO_BYTES) return setError('That file is too big. The limit is 20 MB.')
    setError('')
    const id = newId()
    files.current.set(id, file)
    void keepOwnAudio(id, file, chat.id).catch(() => {})
    const m: Message = {
      id,
      conversation_id: chat.id,
      sender_id: me,
      body: file.name,
      created_at: new Date().toISOString(),
      kind: 'audio',
      file_path: audioPath(chat.id, id, file.name),
      file_name: file.name,
      file_size: file.size,
      status: 'sending',
    }
    stick.current = true
    setMessages((cur) => merge(cur, [m]))
    push(m)
  }

  const save = async (m: Message) => {
    setSaving((c) => new Set(c).add(m.id))
    setNotes((n) => ({ ...n, [m.id]: '' }))
    try {
      await downloadAudio(m, isGroup ? (names.get(m.sender_id) ?? 'a friend') : chat.name.replace(/^@/, ''))
    } catch (e) {
      setNotes((n) => ({ ...n, [m.id]: e instanceof ApiError ? e.message : 'Download failed. Tap to retry.' }))
    } finally {
      setSaving((c) => {
        const n = new Set(c)
        n.delete(m.id)
        return n
      })
    }
  }

  const MAX_VOICE_SECONDS = 600

  useEffect(() => {
    if (!rec) return
    const t0 = Date.now()
    setRecSecs(0)
    const iv = window.setInterval(() => {
      const secs = Math.floor((Date.now() - t0) / 1000)
      setRecSecs(secs)
    }, 250)
    return () => window.clearInterval(iv)
  }, [rec])

  // Leaving the chat while recording throws the recording away.
  const recRef = useRef<Recording | null>(null)
  useEffect(() => {
    recRef.current = rec
  }, [rec])
  useEffect(() => () => recRef.current?.cancel(), [])

  const beginVoice = async () => {
    setError('')
    try {
      setRec(await startRecording())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start recording.')
    }
  }

  const finishVoice = async () => {
    const r = rec
    if (!r) return
    setRec(null)
    const { blob, seconds } = await r.stop()
    if (seconds < 1 || blob.size === 0) return setError('Hold on a little longer to record a voice note.')
    const id = newId()
    voices.current.set(id, { blob, seconds })
    void keepOwnVoice(id, blob).catch(() => {})
    const m: Message = {
      id,
      conversation_id: chat.id,
      sender_id: me,
      body: 'Voice note',
      created_at: new Date().toISOString(),
      kind: 'voice',
      duration: Math.max(1, Math.round(seconds)),
      status: 'sending',
    }
    stick.current = true
    setMessages((cur) => merge(cur, [m]))
    push(m)
  }

  useEffect(() => {
    if (rec && recSecs >= MAX_VOICE_SECONDS) void finishVoice()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recSecs])

  const retry = (m: Message) => {
    setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, status: 'sending' } : x)))
    push(m)
  }

  if (info)
    return (
      <GroupInfo
        chat={chat}
        onBack={() => setInfo(false)}
        onLeft={onBack}
        onRenamed={(t) => {
          onRenamed(t)
        }}
      />
    )

  return (
    <div className="chat">
      <PatternLayer />
      <header className="chat-top">
        <button type="button" className="icon-btn" aria-label="Back to chats" onClick={onBack}>
          <BackIcon />
        </button>
        {isGroup ? (
          <button type="button" className="chat-title-btn" aria-label="Group info" onClick={() => setInfo(true)}>
            <Avatar src={null} name={chat.name} size={40} group />
            <span className="chat-name">{chat.name}</span>
          </button>
        ) : (
          <>
            <Avatar src={chat.avatar} name={chat.name} size={40} />
            <span className="chat-name">{chat.name}</span>
          </>
        )}
        <button
          type="button"
          className="icon-btn call-btn"
          aria-label={inThisCall ? 'Return to the call' : 'Start a call'}
          onClick={() => (inThisCall ? showCall(true) : void startCall(chat))}
        >
          <PhoneIcon />
        </button>
      </header>

      {inThisCall ? (
        <button type="button" className="call-strip" onClick={() => showCall(true)}>
          <PhoneIcon /> You are in this call · Return
        </button>
      ) : (
        callInfo?.active && (
          <button type="button" className="call-strip" onClick={() => void joinCall(chat)}>
            <PhoneIcon /> Call in progress · {callInfo.count} in call · Join
          </button>
        )
      )}

      <MiniPlayer />

      <div className="chat-list" ref={list} onScroll={onScroll}>
        {!loaded && !error && <p className="muted center">Loading…</p>}
        {error && <p className="error center">{error}</p>}
        {loaded && messages.length === 0 && <p className="muted center">No messages yet. Say hello 👋</p>}
        {messages.map((m) => {
          const mine = m.sender_id === me
          if (m.kind === 'call') {
            const who = mine ? 'You' : isGroup ? `@${names.get(m.sender_id) ?? '…'}` : chat.name
            return (
              <p key={m.id} className="sys-note">
                📞 {who} started a call
              </p>
            )
          }
          return (
            <div key={m.id} data-mid={m.id} className={`bubble-row${mine ? ' mine' : ''}`}>
              <div
                className={`bubble${mine ? ' mine' : ''}${m.status === 'failed' ? ' failed' : ''}${m.deleted_at ? ' deleted' : ''}`}
                onContextMenu={(e) => {
                  if (m.deleted_at || m.status) return
                  e.preventDefault()
                  setMenu(m)
                }}
              >
                {!m.deleted_at && !m.status && (
                  <button type="button" className="bubble-more" aria-label="Message options" onClick={() => setMenu(m)}>
                    <ChevronDownIcon />
                  </button>
                )}
                {isGroup && !mine && (
                  <span className="sender" style={{ color: senderColor(m.sender_id) }}>
                    @{names.get(m.sender_id) ?? '…'}
                  </span>
                )}
                {m.deleted_at ? (
                  <span className="bubble-text deleted-text">🚫 {mine ? 'You deleted this message' : 'This message was deleted'}</span>
                ) : (
                  <>
                {m.reply_to && (
                  <button type="button" className="quote" onClick={() => jumpTo(m.reply_to!)}>
                    <span className="quote-who">{who(messages.find((x) => x.id === m.reply_to)?.sender_id ?? '')}</span>
                    <span className="quote-text">{preview(messages.find((x) => x.id === m.reply_to))}</span>
                  </button>
                )}
                {m.kind === 'voice' ? (
                  <VoiceBubble m={m} mine={mine} local={voiceIds.has(m.id)} />
                ) : m.kind === 'audio' ? (
                  <span className="audio-card">
                    {have.has(m.id) ? (
                      <button
                        type="button"
                        className="audio-btn"
                        aria-label={nowId === m.id && player.playing ? 'Pause' : 'Play'}
                        onClick={() => (nowId === m.id ? void toggle() : void play(m.id, lib ?? []))}
                      >
                        {nowId === m.id && player.playing ? <PauseIcon /> : <PlayIcon />}
                      </button>
                    ) : !mine ? (
                      <button
                        type="button"
                        className="audio-btn"
                        aria-label="Save to your phone"
                        disabled={saving.has(m.id)}
                        onClick={() => void save(m)}
                      >
                        <DownloadIcon />
                      </button>
                    ) : (
                      <span className="audio-btn static" aria-hidden="true">
                        <MusicIcon />
                      </span>
                    )}
                    <span className="audio-info">
                      <span className="audio-name">{m.file_name ?? m.body}</span>
                      <span className="audio-sub">
                        {m.file_size ? fmtSize(m.file_size) : 'Audio'}
                        {!mine && !have.has(m.id) && (saving.has(m.id) ? ' · Saving…' : ' · Tap to save')}
                        {have.has(m.id) && ' · On your phone'}
                      </span>
                      {notes[m.id] && <span className="audio-sub warn">{notes[m.id]}</span>}
                    </span>
                  </span>
                ) : (
                  <span className="bubble-text">{m.body}</span>
                )}
                  </>
                )}
                <span className="bubble-meta">
                  {m.status === 'sending' ? 'Sending…' : m.status === 'failed' ? '' : `${m.edited_at && !m.deleted_at ? 'Edited · ' : ''}${clock(m.created_at)}`}
                  {m.status === 'failed' && (
                    <button type="button" className="retry" onClick={() => retry(m)}>
                      Not sent. Tap to retry
                    </button>
                  )}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {(replyTo || editing) && !rec && (
        <div className="compose-banner">
          <span className="compose-banner-body">
            <span className="quote-who">{editing ? 'Editing message' : `Replying to ${who(replyTo!.sender_id)}`}</span>
            <span className="quote-text">{preview(editing ?? replyTo!)}</span>
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cancel"
            onClick={() => {
              if (editing) setText('')
              setEditing(null)
              setReplyTo(null)
            }}
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {menu && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setMenu(null)}>
          <div className="sheet" role="menu" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setEditing(null)
                setReplyTo(menu)
                setMenu(null)
              }}
            >
              <ReplyIcon /> Reply
            </button>
            {menu.kind === 'text' && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void navigator.clipboard?.writeText(menu.body).catch(() => {})
                  setMenu(null)
                }}
              >
                <CopyIcon /> Copy
              </button>
            )}
            {menu.kind === 'text' && menu.sender_id === me && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setReplyTo(null)
                  setEditing(menu)
                  setText(menu.body)
                  setMenu(null)
                }}
              >
                <EditIcon /> Edit
              </button>
            )}
            {(menu.sender_id === me || (isGroup && amAdmin)) && (
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  setConfirmDelete(menu)
                  setMenu(null)
                }}
              >
                <TrashIcon /> Delete for everyone
              </button>
            )}
            <button type="button" role="menuitem" className="cancel" onClick={() => setMenu(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setConfirmDelete(null)}>
          <div className="sheet" role="alertdialog" aria-label="Delete message" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">
              {confirmDelete.sender_id === me ? 'Delete this message for everyone?' : `Delete @${names.get(confirmDelete.sender_id) ?? 'this person'}'s message for everyone?`}
            </p>
            <button type="button" className="danger" disabled={busy} onClick={() => void doDelete(confirmDelete)}>
              <TrashIcon /> Delete
            </button>
            <button type="button" className="cancel" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {rec ? (
        <div className="composer recording" role="status" aria-label="Recording a voice note">
          <button type="button" className="icon-btn" aria-label="Cancel recording" onClick={() => {
              rec.cancel()
              setRec(null)
            }}>
            <TrashIcon />
          </button>
          <span className="rec-dot" aria-hidden="true" />
          <span className="rec-time">{`${Math.floor(recSecs / 60)}:${String(recSecs % 60).padStart(2, '0')}`}</span>
          <span className="rec-hint">Recording…</span>
          <button type="button" className="send" aria-label="Send voice note" onClick={() => void finishVoice()}>
            <SendIcon />
          </button>
        </div>
      ) : (
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          ref={picker}
          type="file"
          accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac"
          hidden
          onChange={(e) => {
            pickAudio(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button type="button" className="icon-btn attach" aria-label="Send an audio file" onClick={() => picker.current?.click()}>
          <ClipIcon />
        </button>
        <textarea
          rows={1}
          placeholder="Message"
          aria-label="Message"
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(pointer: coarse)').matches) {
              e.preventDefault()
              send()
            }
          }}
        />
        {text.trim() ? (
          <button type="submit" className="send" aria-label="Send">
            <SendIcon />
          </button>
        ) : (
          <button type="button" className="send" aria-label="Record a voice note" onClick={() => void beginVoice()}>
            <MicIcon />
          </button>
        )}
      </form>
      )}
    </div>
  )
}
