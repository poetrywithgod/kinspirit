import { useState } from 'react'
import { applyTheme, getTheme, type ThemePref } from '../theme'
import { Avatar } from './Avatar'

const OPTIONS: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'Match phone' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

export function SettingsTab({
  username,
  avatar,
  onLogout,
}: {
  username: string
  avatar: string | null
  onLogout: () => void
}) {
  const [theme, setTheme] = useState<ThemePref>(getTheme())
  const [out, setOut] = useState(false)

  return (
    <section className="tab">
      <div className="settings-card profile-line">
        <Avatar src={avatar} name={username} size={64} />
        <div>
          <p className="row-name">@{username}</p>
          <p className="muted">Your Kinspirit username</p>
        </div>
      </div>

      <div className="settings-card">
        <h2 className="section-title flush">Appearance</h2>
        <div className="chips" role="radiogroup" aria-label="Appearance">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={theme === o.id}
              className={`chip${theme === o.id ? ' on' : ''}`}
              onClick={() => {
                setTheme(o.id)
                applyTheme(o.id)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-card">
        <button
          type="button"
          className="btn btn-quiet"
          disabled={out}
          onClick={() => {
            setOut(true)
            onLogout()
          }}
        >
          {out ? 'Logging out…' : 'Log out'}
        </button>
      </div>
    </section>
  )
}
