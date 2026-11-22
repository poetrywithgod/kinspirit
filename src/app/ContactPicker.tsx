import { useEffect, useState } from 'react'
import { ApiError, listContacts, type Person } from '../api'
import { Avatar } from './Avatar'
import { CheckIcon, SearchIcon } from './icons'

/** A tick-list of my contacts. `exclude` hides people who are already in the group. */
export function ContactPicker({
  selected,
  onToggle,
  exclude,
}: {
  selected: Set<string>
  onToggle: (p: Person) => void
  exclude?: Set<string>
}) {
  const [contacts, setContacts] = useState<Person[] | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    let dead = false
    listContacts()
      .then((r) => !dead && setContacts(r))
      .catch((e: unknown) => !dead && setError(e instanceof ApiError ? e.message : 'Could not load your contacts.'))
    return () => {
      dead = true
    }
  }, [])

  const shown = (contacts ?? []).filter(
    (c) => !exclude?.has(c.id) && c.username.toLowerCase().includes(q.trim().replace(/^@/, '').toLowerCase()),
  )

  return (
    <div>
      <label className="search">
        <SearchIcon />
        <input
          type="search"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Search your contacts"
          aria-label="Search your contacts"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {error && <p className="error center">{error}</p>}
      {contacts === null && !error && <p className="muted center">Loading…</p>}
      {contacts !== null && shown.length === 0 && (
        <p className="muted center">
          {contacts.length === 0
            ? 'You have no contacts yet. Find friends in the Contacts tab first.'
            : q
              ? 'No contacts match.'
              : 'Everyone in your contacts is already here.'}
        </p>
      )}
      <ul className="rows">
        {shown.map((p) => {
          const on = selected.has(p.id)
          return (
            <li key={p.id}>
              <button type="button" className="row" role="checkbox" aria-checked={on} onClick={() => onToggle(p)}>
                <Avatar src={p.avatar_url} name={p.username} />
                <span className="row-main">
                  <span className="row-name">@{p.username}</span>
                </span>
                <span className={`tick${on ? ' on' : ''}`}>{on && <CheckIcon />}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
