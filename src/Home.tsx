import { useEffect, useRef, useState } from 'react'
import { PatternLayer } from './PatternLayer'

export function Home({
  username,
  avatar,
  onLogout,
}: {
  username: string
  avatar: string | null
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="app">
      <PatternLayer />
      <header className="topbar">
        <div className="brand" role="img" aria-label="Kinspirit">
          <span className="brand-mark" />
          <span className="brand-word" />
        </div>
        <div className="top-right" ref={wrap}>
          <button
            type="button"
            className="top-avatar"
            aria-label="Your profile"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {avatar ? <img src={avatar} alt="" /> : <span>{username.slice(0, 1).toUpperCase()}</span>}
          </button>
          {open && (
            <div className="menu" role="menu">
              <p className="menu-name">@{username}</p>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                disabled={loggingOut}
                onClick={() => {
                  setLoggingOut(true)
                  onLogout()
                }}
              >
                {loggingOut ? 'Logging out…' : 'Log out'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="home-main">
        <section className="empty-card">
          <span className="empty-mark" aria-hidden="true" />
          <h1>Hi, @{username}</h1>
          <p>Your chats will show up here. Finding friends from your contacts is the next step.</p>
        </section>
      </main>
    </div>
  )
}
