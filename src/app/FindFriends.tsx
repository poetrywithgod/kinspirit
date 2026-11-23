import { useRef, useState } from 'react'
import { ApiError, addContact, matchPhones, signupPhone, type Person } from '../api'
import { PatternLayer } from '../PatternLayer'
import { contactNumber, countryOfNumber, guessCountry, numbersFromVcf } from '../phone'
import { Avatar } from './Avatar'
import { BackIcon } from './icons'

type PickerNav = Navigator & { contacts?: { select: (props: string[], opts?: { multiple?: boolean }) => Promise<{ tel?: string[] }[]> } }

/** Finds which of my phone contacts are on Kinspirit. Nothing leaves the phone except the numbers, which are not stored. */
export function FindFriends({
  mine,
  onClose,
  onAdded,
  onMessage,
}: {
  mine: Set<string>
  onClose: () => void
  onAdded: (p: Person) => void
  onMessage: (p: Person) => void
}) {
  const [found, setFound] = useState<Person[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState<Set<string>>(new Set(mine))
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const nav = navigator as PickerNav
  const canPick = typeof nav.contacts?.select === 'function'
  const me = signupPhone() ? countryOfNumber(signupPhone()) : guessCountry()

  const lookup = async (raws: string[]) => {
    const nums = [...new Set(raws.map((r) => contactNumber(r, me)).filter((x): x is string => !!x))]
    if (!nums.length) {
      setFound([])
      return
    }
    const people: Person[] = []
    for (let i = 0; i < nums.length; i += 500) people.push(...(await matchPhones(nums.slice(i, i + 500))))
    setFound([...new Map(people.map((p) => [p.id, p])).values()])
  }

  const run = async (get: () => Promise<string[]>) => {
    setBusy(true)
    setErr('')
    try {
      await lookup(await get())
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not read your contacts.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="profile-view" role="dialog" aria-label="Find friends from your contacts">
      <PatternLayer />
      <header className="profile-top">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onClose}>
          <BackIcon />
        </button>
      </header>
      <div className="profile-body find-body">
        <h1 className="profile-name">Find friends</h1>
        <p className="muted center">See which of your phone contacts are already on Kinspirit. Their numbers are only compared, never saved.</p>
        {canPick && (
          <button
            type="button"
            className="btn profile-action"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const picked = await nav.contacts!.select(['tel'], { multiple: true })
                return picked.flatMap((c) => c.tel ?? [])
              })
            }
          >
            {busy ? 'Looking…' : 'Choose from my contacts'}
          </button>
        )}
        <button type="button" className={canPick ? 'link-btn' : 'btn profile-action'} disabled={busy} onClick={() => file.current?.click()}>
          Import a contacts file (.vcf)
        </button>
        <input
          ref={file}
          type="file"
          accept=".vcf,text/vcard,text/x-vcard"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void run(async () => numbersFromVcf(await f.text()))
          }}
        />
        {!canPick && <p className="muted center">Your browser cannot open the contact list directly. Export your contacts as a .vcf file from your Contacts app and import it here.</p>}
        {err && <p className="error center" role="alert">{err}</p>}
        {found && found.length === 0 && !busy && <p className="muted center">None of those contacts are on Kinspirit yet. Invite them!</p>}
        {found && found.length > 0 && (
          <ul className="rows find-list">
            {found.map((p) => (
              <li key={p.id} className="row person">
                <span className="row-hit">
                  <Avatar src={p.avatar_url} name={p.username} />
                  <span className="row-main">
                    <span className="row-name">@{p.username}</span>
                  </span>
                </span>
                {!added.has(p.id) ? (
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() =>
                      void addContact(p.id)
                        .then(() => {
                          setAdded((s) => new Set(s).add(p.id))
                          onAdded(p)
                        })
                        .catch(() => setErr('Could not add. Try again.'))
                    }
                  >
                    Add
                  </button>
                ) : (
                  <button type="button" className="mini-btn" onClick={() => onMessage(p)}>
                    Message
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
