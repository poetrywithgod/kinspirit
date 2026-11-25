import { useCallback, useEffect, useRef, useState } from 'react'
import { autoSaveAudio, autoSaveBig, autoSavePhotos, onLibraryChange, setAutoSaveAudio, setAutoSaveBig, setAutoSavePhotos } from '../library'
import { protectStorage, storageInfo, type StorageInfo } from '../storage'
import { fmtSize } from '../time'
import { ApiError, myDiscoverable, setDiscoverable, updateAvatar } from '../api'
import { PhotoCropper } from '../PhotoCropper'
import { applyTheme, getTheme, type ThemePref } from '../theme'
import { Avatar } from './Avatar'
import { AccountCard } from './AccountCard'
import { SecurityCard } from './SecurityCard'
import { disablePush, enablePush, pushState, testPush, type PushState } from '../push'
import { profileLink, shareProfile } from '../invite'
import { setDataSaver, useDataSaver } from '../dataSaver'
import { LABEL, recSupport, setRecFormat, useRecFormat, type RecFormat } from '../recfmt'
import { refreshBlocks, unblockPerson, useBlocks } from '../blocks'

const OPTIONS: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'Match phone' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

export function SettingsTab({
  username,
  avatar,
  onAvatarChange,
  onUsernameChange,
  onLogout,
}: {
  username: string
  avatar: string | null
  onAvatarChange: (url: string) => void
  onUsernameChange: (username: string) => void
  onLogout: () => void
}) {
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [autoAudio, setAutoAudio] = useState(autoSaveAudio())
  const [autoPhotos, setAutoPhotos] = useState(autoSavePhotos())
  const [autoBig, setAutoBig] = useState(autoSaveBig())
  useEffect(() => {
    let dead = false
    const load = () => void storageInfo().then((i) => !dead && setInfo(i))
    void protectStorage().then(load)
    const off = onLibraryChange(load)
    return () => {
      dead = true
      off()
    }
  }, [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoMsg, setPhotoMsg] = useState('')
  const closeCropper = useCallback((msg?: string) => {
    setCropFile(null)
    if (msg) setPhotoMsg(msg)
  }, [])
  const savePhoto = (dataUrl: string) => {
    setCropFile(null)
    setPhotoBusy(true)
    setPhotoMsg('')
    updateAvatar(dataUrl)
      .then((url) => {
        onAvatarChange(url)
        setPhotoMsg('Photo updated.')
      })
      .catch((e: unknown) => setPhotoMsg(e instanceof ApiError ? e.message : 'Could not update your photo. Try again.'))
      .finally(() => setPhotoBusy(false))
  }

  const saver = useDataSaver()
  const recFmt = useRecFormat()
  const recOk = recSupport()
  const [shareMsg, setShareMsg] = useState('')
  const [disc, setDisc] = useState<boolean | null>(null)
  useEffect(() => {
    void myDiscoverable().then(setDisc).catch(() => undefined)
  }, [])
  const [push, setPush] = useState<PushState | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    void pushState().then(setPush)
  }, [])
  const { blocked } = useBlocks()
  useEffect(() => void refreshBlocks(), [])
  const [theme, setTheme] = useState<ThemePref>(getTheme())
  const [out, setOut] = useState(false)

  return (
    <section className="tab">
      {cropFile && <PhotoCropper file={cropFile} onCancel={closeCropper} onDone={savePhoto} />}
      <div className="settings-card profile-line">
        <button
          type="button"
          className="avatar-change"
          aria-label="Change profile photo"
          disabled={photoBusy}
          onClick={() => fileRef.current?.click()}
        >
          <Avatar src={avatar} name={username} size={64} />
          <span className="avatar-change-badge" aria-hidden="true">
            ✎
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              setPhotoMsg('')
              setCropFile(f)
            }
            e.target.value = ''
          }}
        />
        <div>
          <p className="row-name">@{username}</p>
          <p className="muted">{photoBusy ? 'Saving your photo…' : 'Tap your photo to change it'}</p>
          {photoMsg && <p className={photoMsg === 'Photo updated.' ? 'muted' : 'error'}>{photoMsg}</p>}
        </div>
      </div>

      <AccountCard username={username} onUsernameChange={onUsernameChange} />
      <SecurityCard username={username} />

      <div className="settings-card">
        <h2 className="section-title flush">Saved on this phone</h2>
        <p className="muted">
          What you receive is saved on this phone and stays here until you delete it.
          {info ? ` ${info.files} saved file${info.files === 1 ? '' : 's'}, ${fmtSize(info.used)} used.` : ''}
        </p>
        {info && info.persisted === false && (
          <p className="muted">
            {info.installed
              ? 'Your browser has not yet promised to keep these files. Keep using the app and it usually will.'
              : 'Add Kinspirit to your Home Screen (menu → Install app / Add to Home Screen). Browsers may clear saved files from a website that is not installed.'}
          </p>
        )}
        {info && info.persisted && <p className="muted">✓ Protected: this phone will not clear them to free up space.</p>}
        <label className="switch-row">
          <input
            type="checkbox"
            checked={autoAudio}
            onChange={(e) => {
              setAutoAudio(e.target.checked)
              setAutoSaveAudio(e.target.checked)
            }}
          />
          <span>Save audio files automatically (uses data; voice notes are always saved)</span>
        </label>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={autoPhotos}
            onChange={(e) => {
              setAutoPhotos(e.target.checked)
              setAutoSavePhotos(e.target.checked)
            }}
          />
          <span>Save photos automatically</span>
        </label>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={autoBig}
            onChange={(e) => {
              setAutoBig(e.target.checked)
              setAutoSaveBig(e.target.checked)
            }}
          />
          <span>Save videos and documents automatically (they can be big; otherwise tap to download)</span>
        </label>
      </div>

      {disc !== null && (
        <div className="settings-card">
          <h2 className="section-title flush">Privacy</h2>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={disc}
              onChange={(e) => {
                const v = e.target.checked
                setDisc(v)
                void setDiscoverable(v).catch(() => setDisc(!v))
              }}
            />
            <span>Let people who have my phone number find me on Kinspirit</span>
          </label>
        </div>
      )}

      <div className="settings-card">
        <h2 className="section-title flush">Notifications</h2>
        {push === 'unsupported' ? (
          <p className="muted">This browser cannot show notifications. On an iPhone, add Kinspirit to your Home Screen first (Share, then Add to Home Screen), then open it from there.</p>
        ) : push === 'unconfigured' ? (
          <p className="muted">Notifications are not switched on for this version of Kinspirit yet.</p>
        ) : push === 'denied' ? (
          <p className="muted">Notifications are blocked. Allow them for Kinspirit in your browser or phone settings, then come back here.</p>
        ) : (
          <>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={push === 'on'}
                disabled={push === null || pushBusy}
                onChange={(e) => {
                  setPushBusy(true)
                  setPushMsg(null)
                  const go = e.target.checked ? enablePush() : disablePush().then(() => pushState())
                  void go
                    .then(setPush)
                    .catch((err: unknown) => {
                      setPushMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not change notifications.' })
                      void pushState().then(setPush)
                    })
                    .finally(() => setPushBusy(false))
                }}
              />
              <span>Tell me about new messages and calls, even when Kinspirit is closed</span>
            </label>
            {push === 'on' && (
              <button
                type="button"
                className="link-btn"
                disabled={pushBusy}
                onClick={() => {
                  setPushBusy(true)
                  setPushMsg({ ok: true, text: 'Sending…' })
                  void testPush()
                    .then(setPushMsg)
                    .finally(() => setPushBusy(false))
                }}
              >
                Send me a test notification
              </button>
            )}
            {pushMsg && (
              <p className={pushMsg.ok ? 'muted' : 'error'} role="status">
                {pushMsg.text}
              </p>
            )}
          </>
        )}
      </div>

      <div className="settings-card">
        <h2 className="section-title flush">Your profile link</h2>
        <p className="muted">Send this link to friends. They tap it, join (or log in) and land on your profile, ready to message you.</p>
        <div className="link-box">{profileLink(username)}</div>
        <div className="link-actions">
          <button
            type="button"
            className="btn"
            onClick={() =>
              void shareProfile(username).then((r) => setShareMsg(r === 'copied' ? 'Link copied.' : r === 'failed' ? 'Could not share. Copy the link above.' : ''))
            }
          >
            Share my link
          </button>
        </div>
        {shareMsg && <p className="muted" role="status">{shareMsg}</p>}
      </div>

      <div className="settings-card">
        <h2 className="section-title flush">Data saver</h2>
        <label className="switch-row">
          <input type="checkbox" checked={saver} onChange={(e) => setDataSaver(e.target.checked)} />
          <span>Use less data</span>
        </label>
        <p className="muted">
          Nothing downloads by itself (tap to get photos, videos, files and audio), photos you send are made smaller, voice notes use less data,
          and chats refresh a little slower. Calls and message sending work as normal.
        </p>
      </div>

      <div className="settings-card">
        <h2 className="section-title flush">Call recordings</h2>
        <p className="muted">When you record a call as host, it is saved in your Audio tab in this format.</p>
        {([
          ['opus', 'Opus – smallest file (.webm). Plays in Chrome, VLC and most Android players.'],
          ['aac', 'AAC – small and plays on iPhone and Android (.m4a).'],
          ['mp3', 'MP3 – plays anywhere, best for sharing (.mp3, a bit bigger).'],
        ] as [RecFormat, string][]).map(([f, text]) => (
          <label key={f} className="switch-row">
            <input type="radio" name="recfmt" checked={recFmt === f} disabled={!recOk[f]} onChange={() => setRecFormat(f)} />
            <span>
              <strong>{LABEL[f]}</strong> {recOk[f] ? text.slice(text.indexOf('–') + 2) : 'Not available on this phone.'}
            </span>
          </label>
        ))}
        <p className="muted">On a computer, the host can also tap Screen during a call to record the screen and the call together as a video saved to Downloads.</p>
      </div>

      <div className="settings-card">
        <h2 className="section-title flush">Blocked people</h2>
        {blocked.length === 0 ? (
          <p className="muted">You have not blocked anyone.</p>
        ) : (
          <ul className="blocked-list">
            {blocked.map((p) => (
              <li key={p.id}>
                <Avatar src={p.avatar_url} name={p.username} size={36} />
                <span>@{p.username}</span>
                <button type="button" className="link-btn" onClick={() => void unblockPerson(p.id).catch(() => undefined)}>
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
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
