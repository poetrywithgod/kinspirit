import { useEffect, useState } from 'react'
import { profileSince, type Person } from '../api'
import { PatternLayer } from '../PatternLayer'
import { Avatar } from './Avatar'
import { BackIcon } from './icons'
import { Lightbox } from './Lightbox'

/** Someone's profile: their display photo (tap to see it full size), username and when they joined. */
export function ProfileView({
  person,
  onClose,
  onMessage,
}: {
  person: Person
  onClose: () => void
  onMessage?: (p: Person) => void
}) {
  const [since, setSince] = useState<string | null>(null)
  const [photo, setPhoto] = useState(false)
  useEffect(() => {
    let dead = false
    profileSince(person.id)
      .then((d) => !dead && setSince(d))
      .catch(() => undefined)
    return () => {
      dead = true
    }
  }, [person.id])

  const joined = since ? new Date(since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : ''
  return (
    <div className="profile-view" role="dialog" aria-label={`@${person.username}`}>
      <PatternLayer />
      <header className="profile-top">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onClose}>
          <BackIcon />
        </button>
      </header>
      <div className="profile-body">
        {person.avatar_url ? (
          <button type="button" className="profile-photo" aria-label="View photo" onClick={() => setPhoto(true)}>
            <Avatar src={person.avatar_url} name={person.username} size={168} />
          </button>
        ) : (
          <span className="profile-photo static">
            <Avatar src={null} name={person.username} size={168} />
          </span>
        )}
        <h1 className="profile-name">@{person.username}</h1>
        {!person.avatar_url && <p className="muted">No profile photo yet</p>}
        {joined && <p className="muted">On Kinspirit since {joined}</p>}
        {onMessage && (
          <button type="button" className="btn profile-action" onClick={() => onMessage(person)}>
            Send a message
          </button>
        )}
      </div>
      {photo && person.avatar_url && <Lightbox src={person.avatar_url} name={`@${person.username}`} onClose={() => setPhoto(false)} />}
    </div>
  )
}
