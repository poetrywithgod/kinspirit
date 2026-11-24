import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  addGroupMembers,
  groupMembers,
  joinRequestsFor,
  reviewJoinRequest,
  type JoinRequest,
  leaveGroup,
  myId,
  removeGroupMember,
  renameGroup,
  setGroupAdmin,
  type GroupMember,
  type Person,
} from '../api'
import { PatternLayer } from '../PatternLayer'
import { Avatar } from './Avatar'
import type { ChatTarget } from './ChatsTab'
import { ContactPicker } from './ContactPicker'
import { BackIcon, DotsIcon, PlusIcon } from './icons'
import { ProfileView } from './ProfileView'

type Sheet =
  | { kind: 'member'; m: GroupMember }
  | { kind: 'rename' }
  | { kind: 'leave' }
  | { kind: 'add' }
  | null

export function GroupInfo({
  chat,
  onBack,
  onLeft,
  onRenamed,
}: {
  chat: ChatTarget
  onBack: () => void
  onLeft: () => void
  onRenamed: (title: string) => void
}) {
  const me = myId()
  const [members, setMembers] = useState<GroupMember[] | null>(null)
  const [profile, setProfile] = useState<Person | null>(null)
  const [error, setError] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [title, setTitle] = useState(chat.name)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [requests, setRequests] = useState<JoinRequest[]>([])

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.')

  const load = useCallback(async () => {
    try {
      setMembers(await groupMembers(chat.id))
      setRequests(await joinRequestsFor(chat.id).catch(() => []))
      setError('')
    } catch (e) {
      fail(e)
    }
  }, [chat.id])

  useEffect(() => {
    void load()
  }, [load])

  const iAmAdmin = members?.find((m) => m.id === me)?.role === 'admin'

  const act = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true)
    try {
      await fn()
      setSheet(null)
      after?.()
      await load()
    } catch (e) {
      fail(e)
      setSheet(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chat page">
      <PatternLayer />
      <header className="chat-top">
        <button type="button" className="icon-btn" aria-label="Back to the chat" onClick={onBack}>
          <BackIcon />
        </button>
        <span className="chat-name">Group info</span>
      </header>
      <div className="page-body">
        <div className="tab">
          <div className="settings-card group-head">
            <Avatar src={null} name={chat.name} size={76} group />
            <p className="group-title">{chat.name}</p>
            <p className="muted">{members ? `${members.length} ${members.length === 1 ? 'member' : 'members'}` : ' '}</p>
            {iAmAdmin && (
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  setTitle(chat.name)
                  setSheet({ kind: 'rename' })
                }}
              >
                Rename
              </button>
            )}
          </div>

          {error && <p className="error center">{error}</p>}

          <button
            type="button"
            className="row add-row"
            onClick={() => {
              setPicked(new Set())
              setSheet({ kind: 'add' })
            }}
          >
            <span className="track-art" aria-hidden="true">
              <PlusIcon />
            </span>
            <span className="row-name">Add people</span>
          </button>

          {iAmAdmin && requests.length > 0 && (
            <>
              <h2 className="section-title">Waiting to join ({requests.length})</h2>
              <ul className="rows">
                {requests.map((r) => (
                  <li key={r.user_id} className="row person">
                    <Avatar src={r.avatar_url} name={r.username} />
                    <span className="row-main">
                      <span className="row-name">@{r.username}</span>
                    </span>
                    <button type="button" className="mini-btn" disabled={busy} onClick={() => void act(() => reviewJoinRequest(chat.id, r.user_id, true))}>
                      Approve
                    </button>
                    <button type="button" className="mini-btn" disabled={busy} onClick={() => void act(() => reviewJoinRequest(chat.id, r.user_id, false))}>
                      Decline
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="section-title">Members</h2>
          {members === null && !error && <p className="muted center">Loading…</p>}
          <ul className="rows">
            {(members ?? []).map((m) => (
              <li key={m.id} className="row person">
                <button
                  type="button"
                  className="row-hit"
                  aria-label={`View @${m.username}'s profile`}
                  onClick={() => setProfile({ id: m.id, username: m.username, avatar_url: m.avatar_url })}
                >
                  <Avatar src={m.avatar_url} name={m.username} />
                  <span className="row-main">
                    <span className="row-name">@{m.username}{m.id === me ? ' (you)' : ''}</span>
                  </span>
                  {m.role === 'admin' && <span className="role">Admin</span>}
                </button>
                {iAmAdmin && m.id !== me && (
                  <button type="button" className="icon-btn" aria-label={`Options for ${m.username}`} onClick={() => setSheet({ kind: 'member', m })}>
                    <DotsIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="settings-card">
            <button type="button" className="btn btn-quiet danger-btn" onClick={() => setSheet({ kind: 'leave' })}>
              Leave group
            </button>
          </div>
        </div>
      </div>

      {sheet && (
        <div className="sheet-wrap" onClick={() => !busy && setSheet(null)}>
          <div className="sheet tall" role="dialog" onClick={(e) => e.stopPropagation()}>
            {sheet.kind === 'member' && (
              <>
                <p className="sheet-title">@{sheet.m.username}</p>
                <button
                  type="button"
                  className="menu-item"
                  disabled={busy}
                  onClick={() => void act(() => setGroupAdmin(chat.id, sheet.m.id, sheet.m.role !== 'admin'))}
                >
                  {sheet.m.role === 'admin' ? 'Remove as admin' : 'Make admin'}
                </button>
                <button
                  type="button"
                  className="menu-item danger"
                  disabled={busy}
                  onClick={() => void act(() => removeGroupMember(chat.id, sheet.m.id))}
                >
                  Remove from group
                </button>
              </>
            )}
            {sheet.kind === 'rename' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const t = title.trim()
                  if (t) void act(() => renameGroup(chat.id, t), () => onRenamed(t))
                }}
              >
                <p className="sheet-title">Rename group</p>
                <input className="sheet-input" autoFocus aria-label="Group name" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
                <div className="sheet-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => setSheet(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn" disabled={!title.trim() || busy}>
                    Save
                  </button>
                </div>
              </form>
            )}
            {sheet.kind === 'leave' && (
              <>
                <p className="sheet-title">Leave “{chat.name}”?</p>
                <p className="muted">You will stop getting its messages.</p>
                <div className="sheet-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => setSheet(null)}>
                    Cancel
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => void act(() => leaveGroup(chat.id), onLeft)}>
                    Leave
                  </button>
                </div>
              </>
            )}
            {sheet.kind === 'add' && (
              <>
                <p className="sheet-title">Add people</p>
                <div className="sheet-scroll">
                  <ContactPicker
                    selected={picked}
                    exclude={new Set((members ?? []).map((m) => m.id))}
                    onToggle={(p: Person) =>
                      setPicked((cur) => {
                        const n = new Set(cur)
                        if (n.has(p.id)) n.delete(p.id)
                        else n.add(p.id)
                        return n
                      })
                    }
                  />
                </div>
                <div className="sheet-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => setSheet(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={picked.size === 0 || busy}
                    onClick={() => void act(() => addGroupMembers(chat.id, [...picked]))}
                  >
                    {busy ? 'Adding…' : `Add ${picked.size || ''}`.trim()}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {profile && <ProfileView person={profile} onClose={() => setProfile(null)} />}
    </div>
  )
}
