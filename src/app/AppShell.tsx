import { useEffect, useRef, useState } from 'react'
import { refreshBlocks } from '../blocks'
import { listConversations, markDelivered, myId, profileByUsername, startChat, type Person } from '../api'
import { clearInvite, pendingInvite } from '../invite'
import { ProfileView } from './ProfileView'
import { resyncPush } from '../push'
import { PushPrompt } from './PushPrompt'
import { PatternLayer } from '../PatternLayer'
import { NewGroup } from './NewGroup'
import { ChatView } from './ChatView'
import { ChatsTab, type ChatTarget } from './ChatsTab'
import { AudioTab } from './AudioTab'
import { MiniPlayer } from './MiniPlayer'
import { stop } from '../player'
import { stopVoice } from '../voice'
import { leaveCall, resumeCall } from '../call'
import { hasShared, takeShared } from '../share'
import { ShareTo } from './ShareTo'
import { CallLayer, IncomingLayer } from './CallScreen'
import { pollIncoming } from '../incoming'
import { ContactsTab } from './ContactsTab'
import { MeetingsTab } from './MeetingsTab'
import { SettingsTab } from './SettingsTab'
import { syncIncomingMedia } from '../mediaSync'
import { protectStorage } from '../storage'
import { usePolling } from '../usePolling'
import { ChatIcon, GearIcon, MeetingIcon, MusicIcon, PeopleIcon } from './icons'

type Tab = 'chats' | 'meetings' | 'contacts' | 'audio' | 'settings'
const TABS: { id: Tab; label: string; Icon: () => React.JSX.Element }[] = [
  { id: 'chats', label: 'Chats', Icon: ChatIcon },
  { id: 'meetings', label: 'Meetings', Icon: MeetingIcon },
  { id: 'contacts', label: 'Contacts', Icon: PeopleIcon },
  { id: 'audio', label: 'Audio', Icon: MusicIcon },
  { id: 'settings', label: 'Settings', Icon: GearIcon },
]

function Shell({
  username,
  avatar,
  onAvatarChange,
  onUsernameChange,
  onLogout: logout,
}: {
  username: string
  avatar: string | null
  onAvatarChange: (url: string) => void
  onUsernameChange: (username: string) => void
  onLogout: () => void
}) {
  const onLogout = () => {
    stop()
    stopVoice()
    leaveCall()
    logout()
  }
  useEffect(() => void refreshBlocks(), [])
  useEffect(() => void resyncPush(), [])
  usePolling(() => markDelivered().catch(() => undefined), 10000)
  // Someone sent me their profile link: show their profile so I can message them.
  const [invited, setInvited] = useState<Person | null>(null)
  useEffect(() => {
    const u = pendingInvite()
    if (!u) return
    clearInvite()
    void profileByUsername(u)
      .then((p) => p && p.id !== myId() && setInvited(p))
      .catch(() => undefined)
  }, [])
  // A page refresh should not end a call: go back into it.
  useEffect(() => {
    void resumeCall()
  }, [])
  const [chat, setChat] = useState<ChatTarget | null>(null)
  // Files shared from the phone's Files / Music / Gallery apps: choose who gets them.
  const [sharing, setSharing] = useState<File[] | null>(null)
  const [handOver, setHandOver] = useState<File[] | null>(null)
  useEffect(() => {
    if (!hasShared()) return
    history.replaceState(null, '', location.pathname)
    void takeShared().then((f) => f.length > 0 && setSharing(f))
  }, [])
  // Tapping a notification opens that chat.
  useEffect(() => {
    const open = async (cid: string) => {
      try {
        const c = (await listConversations()).find((x) => x.id === cid)
        if (!c) return
        setChat({ id: c.id, name: c.kind === 'direct' ? `@${c.other_username ?? 'unknown'}` : (c.title ?? 'Group'), avatar: c.other_avatar, kind: c.kind, ...(c.other_id ? { userId: c.other_id } : {}) })
      } catch {
        /* stay where we are */
      }
    }
    const q = new URLSearchParams(location.search).get('chat')
    if (q) {
      void open(q)
      history.replaceState(null, '', location.pathname)
    }
    const onMsg = (e: MessageEvent) => e.data?.type === 'open-chat' && void open(String(e.data.cid))
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [])
  useEffect(() => {
    void protectStorage()
  }, [])
  usePolling(() => syncIncomingMedia(), 15000)
  usePolling(() => pollIncoming(), 3000, true, true)
  const [tab, setTab] = useState<Tab>('chats')
  const [menu, setMenu] = useState(false)
  const [newGroup, setNewGroup] = useState(false)
  const [focusSearch, setFocusSearch] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const inviteView = invited && (
    <ProfileView
      person={invited}
      onClose={() => setInvited(null)}
      onMessage={(p) => {
        setInvited(null)
        void startChat(p.id)
          .then((id) => setChat({ id, name: `@${p.username}`, avatar: p.avatar_url, kind: 'direct', userId: p.id }))
          .catch(() => undefined)
      }}
    />
  )
  if (sharing && !chat)
    return (
      <ShareTo
        files={sharing}
        onCancel={() => setSharing(null)}
        onPick={(c) => {
          setHandOver(sharing)
          setSharing(null)
          setChat(c)
        }}
      />
    )
  if (chat) return <>{inviteView}<ChatView chat={chat} shared={handOver} onSharedUsed={() => setHandOver(null)} onBack={() => setChat(null)} onRenamed={(name) => setChat({ ...chat, name })} /></>
  if (newGroup)
    return (
      <NewGroup
        onBack={() => setNewGroup(false)}
        onCreated={(c) => {
          setNewGroup(false)
          setTab('chats')
          setChat(c)
        }}
      />
    )

  return (
    <div className="app shell">
      <PatternLayer />
      {inviteView}
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
            aria-expanded={menu}
            onClick={() => setMenu((o) => !o)}
          >
            {avatar ? <img src={avatar} alt="" /> : <span>{username.slice(0, 1).toUpperCase()}</span>}
          </button>
          {menu && (
            <div className="menu" role="menu">
              <p className="menu-name">@{username}</p>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setMenu(false)
                  setTab('settings')
                }}
              >
                Settings
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={onLogout}>
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="shell-main">
        {tab === 'chats' && (
          <ChatsTab
            onOpen={setChat}
            onNewGroup={() => setNewGroup(true)}
            onFindPeople={() => {
              setFocusSearch(true)
              setTab('contacts')
            }}
          />
        )}
        {tab === 'meetings' && <MeetingsTab />}
        {tab === 'contacts' && <ContactsTab onOpen={setChat} autoFocus={focusSearch} />}
        {tab === 'audio' && <AudioTab />}
        {tab === 'settings' && <SettingsTab username={username} avatar={avatar} onAvatarChange={onAvatarChange} onUsernameChange={onUsernameChange} onLogout={onLogout} />}
      </main>

      {tab !== 'audio' && <MiniPlayer onOpen={() => setTab('audio')} />}
      <nav className="bottom-nav" aria-label="Main">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`nav-item${tab === id ? ' on' : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => {
              setFocusSearch(false)
              setTab(id)
            }}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export function AppShell(props: {
  username: string
  avatar: string | null
  onAvatarChange: (url: string) => void
  onUsernameChange: (username: string) => void
  onLogout: () => void
}) {
  return (
    <>
      <Shell {...props} />
      <CallLayer />
      <IncomingLayer />
      <PushPrompt />
    </>
  )
}
