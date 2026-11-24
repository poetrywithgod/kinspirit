import { useEffect, useState } from 'react'
import { listConversations, type Conversation } from '../api'
import { PatternLayer } from '../PatternLayer'
import { Avatar } from './Avatar'
import type { ChatTarget } from './ChatsTab'
import { BackIcon } from './icons'
import { fmtSize } from '../time'

/** "Send to…": pick the chat for files shared from another app. */
export function ShareTo({ files, onPick, onCancel }: { files: File[]; onPick: (c: ChatTarget) => void; onCancel: () => void }) {
  const [list, setList] = useState<Conversation[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    listConversations().then(setList).catch(() => setList([]))
  }, [])
  const name = (c: Conversation) => (c.kind === 'direct' ? `@${c.other_username ?? 'unknown'}` : (c.title ?? 'Group'))
  const shown = (list ?? []).filter((c) => name(c).toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="chat page">
      <PatternLayer />
      <header className="chat-top">
        <button type="button" className="icon-btn" aria-label="Cancel" onClick={onCancel}>
          <BackIcon />
        </button>
        <span className="chat-name">Send to…</span>
      </header>
      <div className="page-body">
        <div className="tab">
          <div className="settings-card">
            <strong>{files.length === 1 ? files[0].name : `${files.length} files`}</strong>
            <p className="muted">{files.length === 1 ? fmtSize(files[0].size) : files.map((f) => f.name).join(', ')}</p>
          </div>
          <input className="sheet-input" placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
          {list === null && <p className="muted center">Loading…</p>}
          {list !== null && shown.length === 0 && <p className="muted center">No chats found.</p>}
          <ul className="rows">
            {shown.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="row"
                  onClick={() =>
                    onPick({
                      id: c.id,
                      name: name(c),
                      avatar: c.other_avatar,
                      kind: c.kind,
                      ...(c.other_id ? { userId: c.other_id } : {}),
                    })
                  }
                >
                  <Avatar src={c.other_avatar} name={name(c)} group={c.kind === 'group'} />
                  <span className="row-main">
                    <span className="row-name">{name(c)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
