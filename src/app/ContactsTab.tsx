import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  addContact,
  listContacts,
  searchPeople,
  startChat,
  type Person,
} from '../api'
import { Avatar } from './Avatar'
import type { ChatTarget } from './ChatsTab'
import { SearchIcon } from './icons'

let cache: Person[] | null = null

export function ContactsTab({ onOpen, autoFocus }: { onOpen: (c: ChatTarget) => void; autoFocus?: boolean }) {
  const [contacts, setContacts] = useState<Person[] | null>(cache)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Person[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.')

  useEffect(() => {
    let dead = false
    listContacts()
      .then((rows) => {
        cache = rows
        if (!dead) setContacts(rows)
      })
      .catch((e: unknown) => !dead && fail(e))
    return () => {
      dead = true
    }
  }, [])

  useEffect(() => {
    if (autoFocus) input.current?.focus()
  }, [autoFocus])

  const clean = q.trim().replace(/^@/, '')
  useEffect(() => {
    if (clean.length < 2) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    let dead = false
    const t = setTimeout(() => {
      searchPeople(clean)
        .then((rows) => {
          if (dead) return
          setResults(rows)
          setError('')
        })
        .catch((e: unknown) => !dead && fail(e))
        .finally(() => !dead && setSearching(false))
    }, 300)
    return () => {
      dead = true
      clearTimeout(t)
    }
  }, [clean])

  const known = new Set((contacts ?? []).map((c) => c.id))

  const open = async (p: Person) => {
    setBusy(p.id)
    setError('')
    try {
      const id = await startChat(p.id)
      onOpen({ id, name: `@${p.username}`, avatar: p.avatar_url })
    } catch (e) {
      fail(e)
    } finally {
      setBusy('')
    }
  }

  const add = async (p: Person) => {
    setBusy(p.id)
    try {
      await addContact(p.id)
      const next = [...(contacts ?? []), p].sort((a, b) => a.username.localeCompare(b.username))
      cache = next
      setContacts(next)
    } catch (e) {
      fail(e)
    } finally {
      setBusy('')
    }
  }

  const list = results ?? contacts ?? []
  const showingResults = results !== null

  return (
    <section className="tab">
      <label className="search">
        <SearchIcon />
        <input
          ref={input}
          type="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Find people by username"
          aria-label="Find people by username"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      {error && <p className="error center">{error}</p>}

      <h2 className="section-title">{showingResults ? 'People' : 'My contacts'}</h2>

      {contacts === null && !error && <p className="muted center">Loading…</p>}
      {showingResults && !searching && list.length === 0 && (
        <p className="muted center">No one found for “{clean}”.</p>
      )}
      {!showingResults && contacts !== null && contacts.length === 0 && (
        <div className="empty-card">
          <span className="empty-mark" aria-hidden="true" />
          <h1>No contacts yet</h1>
          <p>Type a friend’s username above to find them.</p>
        </div>
      )}

      <ul className="rows">
        {list.map((p) => (
          <li key={p.id} className="row person">
            <button type="button" className="row-hit" disabled={busy === p.id} onClick={() => void open(p)}>
              <Avatar src={p.avatar_url} name={p.username} />
              <span className="row-main">
                <span className="row-name">@{p.username}</span>
                <span className="row-preview">Tap to chat</span>
              </span>
            </button>
            {showingResults && !known.has(p.id) && (
              <button type="button" className="mini-btn" disabled={busy === p.id} onClick={() => void add(p)}>
                Add
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
