import { useEffect, useState } from 'react'
import { ApiError, generalStatus, myId, requestGeneral, type Conversation, type GeneralStatus } from '../api'
import { useConversationState } from '../unread'
import { shortWhen } from '../time'
import { Avatar } from './Avatar'
import { PlusIcon } from './icons'

export type ChatTarget = { id: string; name: string; avatar: string | null; kind?: 'direct' | 'group'; userId?: string }

type Filter = 'all' | 'groups' | 'meetings'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'groups', label: 'Groups' },
  { id: 'meetings', label: 'Meetings' },
]

export function ChatsTab({
  onOpen,
  onFindPeople,
  onNewGroup,
}: {
  onOpen: (c: ChatTarget) => void
  onFindPeople: () => void
  onNewGroup: () => void
}) {
  const [fab, setFab] = useState(false)
  const { rows: items, error: listError } = useConversationState()
  const [filter, setFilter] = useState<Filter>('all')
  const [find, setFind] = useState('')
  const [actionError, setActionError] = useState('')
  const error = actionError || listError
  const me = myId()
  const [general, setGeneral] = useState<GeneralStatus | null>(null)
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    generalStatus().then(setGeneral).catch(() => undefined)
  }, [])
  const ask = async () => {
    setAsking(true)
    try {
      setGeneral(await requestGeneral())
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Could not send the request.')
    } finally {
      setAsking(false)
    }
  }

  const needle = find.trim().toLowerCase()
  const nameOf = (c: Conversation) => (c.kind === 'direct' ? `@${c.other_username ?? 'unknown'}` : (c.title ?? 'Group'))
  const shown = (items ?? [])
    .filter((c) => (filter === 'all' ? true : filter === 'groups' ? c.kind === 'group' : false))
    .filter((c) => !needle || nameOf(c).toLowerCase().includes(needle) || (c.last_body ?? '').toLowerCase().includes(needle))

  return (
    <section className="tab">
      <input
        className="sheet-input chat-find"
        type="search"
        placeholder="Search chats"
        aria-label="Search chats"
        value={find}
        onChange={(e) => setFind(e.target.value)}
      />
      <div className="chips" role="tablist" aria-label="Filter chats">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`chip${filter === f.id ? ' on' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="error center">{error}</p>}

      {(general === 'none' || general === 'pending') && (
        <div className="settings-card general-card">
          <strong>Kinspirit General</strong>
          <p className="muted">
            {general === 'pending'
              ? 'Request sent. You will see the group here once an admin approves you.'
              : 'The community chat for everyone on Kinspirit. An admin approves each person who asks to join.'}
          </p>
          {general === 'none' && (
            <button type="button" className="mini-btn" disabled={asking} onClick={() => void ask()}>
              {asking ? 'Sending…' : 'Ask to join'}
            </button>
          )}
        </div>
      )}

      {items === null && !error && <p className="muted center">Loading…</p>}

      {items !== null && shown.length === 0 && needle && <p className="muted center">No chats match “{find.trim()}”.</p>}

      {items !== null && shown.length === 0 && !needle && (
        <div className="empty-card">
          <span className="empty-mark" aria-hidden="true" />
          {filter === 'all' ? (
            <>
              <h1>No chats yet</h1>
              <p>Find a friend by their username and say hello.</p>
              <button type="button" className="btn empty-btn" onClick={onFindPeople}>
                Find people
              </button>
            </>
          ) : filter === 'groups' ? (
            <>
              <h1>No groups yet</h1>
              <p>Bring your friends together in one chat.</p>
              <button type="button" className="btn empty-btn" onClick={onNewGroup}>
                New group
              </button>
            </>
          ) : (
            <>
              <h1>No meetings yet</h1>
              <p>Scheduled calls and meeting chats will appear here.</p>
            </>
          )}
        </div>
      )}

      <ul className="rows">
        {shown.map((c) => {
          const name = c.kind === 'direct' ? `@${c.other_username ?? 'unknown'}` : (c.title ?? 'Group')
          return (
            <li key={c.id}>
              <button
                type="button"
                className="row"
                onClick={() => onOpen({ id: c.id, name, avatar: c.other_avatar, kind: c.kind, ...(c.other_id ? { userId: c.other_id } : {}) })}
              >
                <Avatar src={c.other_avatar} name={name} group={c.kind === 'group'} />
                <span className="row-main">
                  <span className="row-top">
                    <span className="row-name">{name}</span>
                    <span className={`row-time${c.unread > 0 ? ' hot' : ''}`}>{shortWhen(c.last_message_at)}</span>
                  </span>
                  <span className="row-bottom">
                    <span className="row-preview">
                      {c.last_sender === me ? 'You: ' : c.kind === 'group' && c.last_sender_name ? `@${c.last_sender_name}: ` : ''}
                      {c.last_body}
                    </span>
                    {c.mentioned && c.unread > 0 && (
                      <span className="mention-pill" aria-label="You were mentioned">
                        @
                      </span>
                    )}
                    {c.unread > 0 && (
                      <span className="badge" aria-label={`${c.unread} unread`}>
                        {c.unread > 99 ? '99+' : c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {fab && (
        <div className="fab-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setFab(false); onFindPeople() }}>
            New chat
          </button>
          <button type="button" role="menuitem" onClick={() => { setFab(false); onNewGroup() }}>
            New group
          </button>
        </div>
      )}
      <button type="button" className="fab" aria-label="New chat or group" aria-expanded={fab} onClick={() => setFab((f) => !f)}>
        <PlusIcon />
      </button>
    </section>
  )
}
