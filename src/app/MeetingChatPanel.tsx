import { useEffect, useRef, useState } from 'react'
import { ApiError, type MeetingMessage } from '../api'
import { Avatar } from './Avatar'
import { CloseIcon, SendIcon } from './icons'

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export function MeetingChatPanel({
  title,
  messages,
  me,
  onSend,
  onClose,
}: {
  title: string
  messages: MeetingMessage[]
  me: string
  onSend: (text: string) => Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const end = useRef<HTMLLIElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const send = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    setError('')
    try {
      await onSend(t)
      setText('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send. Check your internet.')
    }
    setBusy(false)
  }

  return (
    <div className="sheet-wrap meeting-chat-wrap" onClick={onClose}>
      <div className="sheet meeting-chat" role="dialog" aria-label="Meeting chat" onClick={(e) => e.stopPropagation()}>
        <div className="meeting-chat-head">
          <p className="sheet-title">{title} · Chat</p>
          <button type="button" className="icon-btn" aria-label="Close chat" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <ul className="meeting-chat-list">
          {messages.length === 0 && <li className="muted center">No messages yet. Say hello.</li>}
          {messages.map((m) => {
            const mine = m.sender_id === me
            return (
              <li key={m.id} className={`mc-msg${mine ? ' mine' : ''}`}>
                {!mine && <Avatar src={m.avatar_url} name={m.username} />}
                <span className="mc-bubble">
                  {!mine && <strong className="mc-name">@{m.username}</strong>}
                  <span className="mc-text">{m.body}</span>
                  <span className="mc-time">{clock(m.created_at)}</span>
                </span>
              </li>
            )
          })}
          <li ref={end} aria-hidden="true" />
        </ul>
        {error && <p className="error">{error}</p>}
        <form
          className="meeting-chat-form"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <input
            className="sheet-input"
            placeholder="Message everyone"
            aria-label="Message everyone in the meeting"
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn send-btn" aria-label="Send" disabled={busy || !text.trim()}>
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  )
}
