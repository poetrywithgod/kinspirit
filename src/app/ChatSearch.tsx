import { useEffect, useRef, useState } from 'react'
import { ApiError, searchMessages, type Message } from '../api'
import { shortWhen } from '../time'
import { CloseIcon } from './icons'

function snippet(m: Message, q: string): string {
  const text = m.kind === 'text' ? m.body : `${m.kind === 'audio' ? '🎵' : m.kind === 'image' ? '🖼️' : m.kind === 'video' ? '🎬' : '📄'} ${m.file_name ?? m.body}`
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase())
  if (i < 0 || text.length <= 90) return text.slice(0, 120)
  const start = Math.max(0, i - 30)
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 100)}…`
}

/** Search bar + results for one chat. Picking a result tells the chat to open that spot. */
export function ChatSearch({
  chatId,
  who,
  onPick,
  onClose,
}: {
  chatId: string
  who: (senderId: string) => string
  onPick: (m: Message) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Message[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => input.current?.focus(), [])

  useEffect(() => {
    if (q.trim().length < 2) {
      setRows(null)
      setError('')
      return
    }
    let dead = false
    setBusy(true)
    const t = setTimeout(() => {
      searchMessages(chatId, q)
        .then((r) => {
          if (dead) return
          setRows(r)
          setError('')
        })
        .catch((e: unknown) => !dead && setError(e instanceof ApiError ? e.message : 'Could not search. Try again.'))
        .finally(() => !dead && setBusy(false))
    }, 350)
    return () => {
      dead = true
      clearTimeout(t)
    }
  }, [q, chatId])

  return (
    <div className="chat-search" role="search">
      <div className="chat-search-bar">
        <input
          ref={input}
          className="sheet-input"
          type="search"
          placeholder="Search in this chat"
          aria-label="Search in this chat"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="icon-btn" aria-label="Close search" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      {q.trim().length > 0 && q.trim().length < 2 && <p className="muted">Type at least 2 letters.</p>}
      {error && <p className="error">{error}</p>}
      {busy && rows === null && <p className="muted">Searching…</p>}
      {rows !== null && rows.length === 0 && !busy && <p className="muted">No messages found.</p>}
      {rows !== null && rows.length > 0 && (
        <ul className="chat-search-results">
          {rows.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onPick(m)}>
                <span className="cs-top">
                  <strong>{who(m.sender_id)}</strong>
                  <span className="muted">{shortWhen(m.created_at)}</span>
                </span>
                <span className="cs-text">{snippet(m, q)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
