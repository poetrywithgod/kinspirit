import { useState } from 'react'
import { ApiError, createGroup, type Person } from '../api'
import { PatternLayer } from '../PatternLayer'
import type { ChatTarget } from './ChatsTab'
import { ContactPicker } from './ContactPicker'
import { BackIcon } from './icons'

export function NewGroup({ onBack, onCreated }: { onBack: () => void; onCreated: (c: ChatTarget) => void }) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggle = (p: Person) =>
    setPicked((cur) => {
      const n = new Set(cur)
      if (n.has(p.id)) n.delete(p.id)
      else n.add(p.id)
      return n
    })

  const ok = name.trim().length > 0 && picked.size > 0 && !busy

  const create = async () => {
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      const title = name.trim()
      const id = await createGroup(title, [...picked])
      onCreated({ id, name: title, avatar: null, kind: 'group' })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the group. Try again.')
      setBusy(false)
    }
  }

  return (
    <div className="chat page">
      <PatternLayer />
      <header className="chat-top">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <BackIcon />
        </button>
        <span className="chat-name">New group</span>
      </header>
      <div className="page-body">
        <div className="tab">
          <div className="pill solid">
            <input
              placeholder="Group name"
              aria-label="Group name"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <h2 className="section-title">Add people{picked.size > 0 ? ` · ${picked.size} chosen` : ''}</h2>
          <ContactPicker selected={picked} onToggle={toggle} />
        </div>
      </div>
      <div className="page-foot">
        {error && <p className="error center">{error}</p>}
        <button type="button" className="btn" disabled={!ok} onClick={() => void create()}>
          {busy ? 'Creating…' : 'Create group'}
        </button>
      </div>
    </div>
  )
}
