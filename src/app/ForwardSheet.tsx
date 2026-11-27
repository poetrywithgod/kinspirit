import { useEffect, useState } from 'react'
import { ApiError, listConversations, type Conversation, type Message } from '../api'
import { forwardOne, previewOf } from '../forwardMedia'
import { Avatar } from './Avatar'

const MAX_TARGETS = 5

const nameOf = (c: Conversation) => (c.kind === 'direct' ? `@${c.other_username ?? 'unknown'}` : (c.title ?? 'Group'))

/** "Forward to…": send a copy of a message (text, sticker, photo, video, file, audio or voice note) into up to 5 other chats. */
export function ForwardSheet({
  message,
  fromChat,
  onClose,
  onDone,
}: {
  message: Message
  fromChat: string
  onClose: () => void
  onDone: (text: string) => void
}) {
  const [list, setList] = useState<Conversation[] | null>(null)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listConversations()
      .then(setList)
      .catch(() => setList([]))
  }, [])

  const shown = (list ?? []).filter((c) => nameOf(c).toLowerCase().includes(q.trim().toLowerCase()))

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_TARGETS) next.add(id)
      return next
    })

  const send = async () => {
    if (!picked.size || busy) return
    setBusy(true)
    setError('')
    // One after the other: files can be big, and a phone should not upload five at once.
    const ids = [...picked]
    const results: PromiseSettledResult<void>[] = []
    for (const cid of ids) {
      try {
        await forwardOne(message, cid)
        results.push({ status: 'fulfilled', value: undefined })
      } catch (e) {
        results.push({ status: 'rejected', reason: e })
      }
    }
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length === 0) {
      onDone(picked.size === 1 ? 'Message forwarded.' : `Message forwarded to ${picked.size} chats.`)
      return
    }
    const why = (failed[0] as PromiseRejectedResult).reason
    setError(
      failed.length === results.length
        ? why instanceof ApiError
          ? why.message
          : 'Could not forward. Try again.'
        : `Forwarded to ${results.length - failed.length}, but ${failed.length} failed. Pick those again to retry.`,
    )
    // keep only the failed chats selected so a retry does not send duplicates
    setPicked(new Set(ids.filter((_, i) => results[i].status === 'rejected')))
    setBusy(false)
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="sheet forward-sheet" role="dialog" aria-label="Forward message" onClick={(e) => e.stopPropagation()}>
        <p className="sheet-title">Forward to…</p>
        <p className="muted forward-preview">{previewOf(message)}</p>
        <input className="sheet-input" placeholder="Search chats" aria-label="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="forward-list">
          {list === null && <p className="muted">Loading…</p>}
          {list !== null && shown.length === 0 && <p className="muted">No chats found.</p>}
          {shown.map((c) => (
            <button key={c.id} type="button" className="forward-row" aria-pressed={picked.has(c.id)} onClick={() => toggle(c.id)}>
              <Avatar src={c.other_avatar} name={nameOf(c)} group={c.kind === 'group'} />
              <span className="forward-name">
                {nameOf(c)}
                {c.id === fromChat ? ' (this chat)' : ''}
              </span>
              <span className={`forward-check${picked.has(c.id) ? ' on' : ''}`} aria-hidden="true">
                {picked.has(c.id) ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>
        {picked.size >= MAX_TARGETS && <p className="muted">You can forward to {MAX_TARGETS} chats at a time.</p>}
        {error && <p className="error">{error}</p>}
        <div className="sheet-actions">
          <button type="button" className="cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={() => void send()} disabled={busy || picked.size === 0}>
            {busy ? (message.kind && message.kind !== 'text' && message.kind !== 'sticker' ? 'Uploading…' : 'Sending…') : picked.size ? `Send (${picked.size})` : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
