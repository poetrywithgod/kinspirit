// The app talks to the server only through this file.
// Email sign-up, log-in, username and profile are REAL (Supabase).
// Phone verification is still a DEV STUB: it needs a WhatsApp webhook on the server.
import { WHATSAPP_NUMBER } from './config'
import { EMAIL_OTP_LENGTH } from './config'
import { ApiError, auth, consumeAuthRedirect, currentSession, db, functions, onSessionFromOtherTab, storage } from './supabase'

export { ApiError, EMAIL_OTP_LENGTH, WHATSAPP_NUMBER, consumeAuthRedirect, onSessionFromOtherTab }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Code the phone-verification stub accepts until the WhatsApp webhook exists. */
export const DEV_CODE = '123456'

/* ---------- Email sign-up and log-in (real) ---------- */

export type SignUpResult = 'code_sent' | 'confirmed'

export async function signUp(email: string, password: string, phone: string): Promise<SignUpResult> {
  const session = await auth.signUp(email, password, { phone })
  return session ? 'confirmed' : 'code_sent'
}

export { currentSession }

export const signOut = () => auth.signOut()

export const sendEmailCode = (email: string) => auth.resendSignupCode(email)

export async function verifyEmailCode(email: string, code: string): Promise<boolean> {
  try {
    await auth.verifySignupCode(email, code)
    return true
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'network' && e.status < 500) return false
    throw e
  }
}

export type Profile = { username: string; avatar_url: string | null }

export type LoginResult =
  | { kind: 'verify-email'; email: string }
  | { kind: 'onboard'; email: string; phone: string }
  | { kind: 'home'; username: string; avatar: string | null }

export async function signIn(email: string, password: string): Promise<LoginResult> {
  let session
  try {
    session = await auth.signIn(email, password)
  } catch (e) {
    if (e instanceof ApiError && e.code === 'email_not_confirmed') {
      await auth.resendSignupCode(email).catch(() => undefined)
      return { kind: 'verify-email', email }
    }
    throw e
  }
  const profile = await getMyProfile()
  if (profile) return { kind: 'home', username: profile.username, avatar: profile.avatar_url }
  const phone = String(session.user.user_metadata?.phone ?? '')
  return { kind: 'onboard', email, phone }
}

export async function getMyProfile(): Promise<Profile | null> {
  const s = currentSession()
  if (!s) return null
  const rows = await db.select<Profile>(`profiles?id=eq.${s.user.id}&select=username,avatar_url`)
  return rows[0] ?? null
}

/** Phone saved at sign-up, for people who verified their email but did not finish. */
export function signupPhone(): string {
  return String(currentSession()?.user.user_metadata?.phone ?? '')
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  return db.rpc<boolean>('username_available', { u: username })
}

export async function saveProfile(p: { username: string; phone: string; photo: string | null }): Promise<void> {
  const s = currentSession()
  if (!s) throw new ApiError('no_session', 'Please log in again.')
  let avatar_url: string | null = null
  if (p.photo) {
    const blob = await (await fetch(p.photo)).blob()
    avatar_url = await storage.uploadAvatar(s.user.id, blob)
  }
  await db.save('profiles', {
    id: s.user.id,
    username: p.username,
    phone: p.phone || null,
    ...(avatar_url ? { avatar_url } : {}),
  })
}

/* ---------- Phone verification (DEV STUB) ---------- */

/** Creates the short code the user sends to Kinspirit's WhatsApp number. */
export async function createPhoneChallenge(_phone: string): Promise<string> {
  await wait(300)
  return `KIN-${Math.floor(1000 + Math.random() * 9000)}`
}

/** Asks the server whether the WhatsApp message with the code has arrived. */
export async function checkPhoneVerified(_phone: string): Promise<boolean> {
  await wait(600)
  return true
}

export async function sendSmsCode(_phone: string): Promise<void> {
  await wait(400)
}

export async function verifySmsCode(_phone: string, code: string): Promise<boolean> {
  await wait(500)
  return code === DEV_CODE
}

/* ---------- Contacts and chat (real) ---------- */

export type Person = { id: string; username: string; avatar_url: string | null }

export type Conversation = {
  id: string
  kind: 'direct' | 'group'
  title: string | null
  last_message_at: string
  other_id: string | null
  other_username: string | null
  other_avatar: string | null
  last_body: string | null
  last_sender: string | null
  last_sender_name: string | null
  unread: number
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  kind?: 'text' | 'audio' | 'voice' | 'call'
  duration?: number | null
  file_path?: string | null
  file_name?: string | null
  file_size?: number | null
  status?: 'sending' | 'failed'
}

export const myId = (): string => currentSession()?.user.id ?? ''

export const searchPeople = (q: string) => db.rpc<Person[]>('search_profiles', { q })
export const listContacts = () => db.rpc<Person[]>('my_contacts', {})
export const addContact = async (other: string) => void (await db.rpc<unknown>('add_contact', { other }))
export const removeContact = async (other: string) => void (await db.rpc<unknown>('remove_contact', { other }))
export const startChat = (other: string) => db.rpc<string>('start_direct_chat', { other })
export const listConversations = () => db.rpc<Conversation[]>('my_conversations', {})
export const markRead = async (cid: string) => void (await db.rpc<unknown>('mark_read', { cid }))

const MESSAGE_COLUMNS = 'id,conversation_id,sender_id,body,created_at,kind,file_path,file_name,file_size,duration'

/** First call: the latest 100 messages. With `after`: only messages newer than that time. */
export async function fetchMessages(cid: string, after?: string): Promise<Message[]> {
  if (after) {
    return db.select<Message>(
      `messages?conversation_id=eq.${cid}&created_at=gte.${encodeURIComponent(after)}&order=created_at.asc&limit=200&select=${MESSAGE_COLUMNS}`,
    )
  }
  const rows = await db.select<Message>(
    `messages?conversation_id=eq.${cid}&order=created_at.desc&limit=100&select=${MESSAGE_COLUMNS}`,
  )
  return rows.reverse()
}

/** Sending the same message id twice is safe, so retrying never makes duplicates. */
export async function sendMessage(m: { id: string; conversation_id: string; body: string; kind?: 'text' | 'call' }): Promise<void> {
  const s = currentSession()
  if (!s) throw new ApiError('no_session', 'Please log in again.')
  try {
    await db.insert('messages', { id: m.id, conversation_id: m.conversation_id, sender_id: s.user.id, body: m.body, ...(m.kind ? { kind: m.kind } : {}) })
  } catch (e) {
    if (e instanceof ApiError && e.code === '23505') return
    throw e
  }
}


export const MAX_AUDIO_BYTES = 20 * 1024 * 1024

export const audioPath = (cid: string, id: string, name: string) => {
  const ext = (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'audio').toLowerCase()
  return `${cid}/${id}.${ext}`
}

/** Uploads the file, then posts the message. Safe to retry: same id, same path. */
export async function sendAudio(m: { id: string; conversation_id: string; file: File }): Promise<void> {
  const s = currentSession()
  if (!s) throw new ApiError('no_session', 'Please log in again.')
  const path = audioPath(m.conversation_id, m.id, m.file.name)
  await storage.uploadFile(path, m.file, m.file.type || 'audio/mpeg')
  try {
    await db.insert('messages', {
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: s.user.id,
      body: m.file.name.slice(0, 200) || 'Audio',
      kind: 'audio',
      file_path: path,
      file_name: m.file.name.slice(0, 200) || 'Audio',
      file_size: m.file.size,
    })
  } catch (e) {
    if (e instanceof ApiError && e.code === '23505') return
    throw e
  }
}

export type AudioMessage = Message & { from: string }

/** Audio that friends sent me, newest first, with the sender's username. */
export async function listReceivedAudio(): Promise<AudioMessage[]> {
  const me = myId()
  const rows = await db.select<Message>(
    `messages?kind=eq.audio&sender_id=neq.${me}&order=created_at.desc&limit=100&select=${MESSAGE_COLUMNS}`,
  )
  const ids = [...new Set(rows.map((r) => r.sender_id))]
  const names = new Map<string, string>()
  if (ids.length) {
    const ps = await db.select<{ id: string; username: string }>(`profiles?id=in.(${ids.join(',')})&select=id,username`)
    ps.forEach((p) => names.set(p.id, p.username))
  }
  return rows.map((r) => ({ ...r, from: names.get(r.sender_id) ?? 'a friend' }))
}

export const downloadAudioFile = (path: string) => storage.downloadFile(path)
export const deleteServerFile = (path: string) => storage.deleteFile(path)


// ---- groups ----
export type GroupMember = { id: string; username: string; avatar_url: string | null; role: 'admin' | 'member' }

export const createGroup = (title: string, memberIds: string[]) =>
  db.rpc<string>('create_group', { group_title: title, member_ids: memberIds })
export const groupMembers = (cid: string) => db.rpc<GroupMember[]>('group_members', { cid })
export const addGroupMembers = async (cid: string, memberIds: string[]) =>
  void (await db.rpc<unknown>('add_group_members', { cid, member_ids: memberIds }))
export const removeGroupMember = async (cid: string, who: string) =>
  void (await db.rpc<unknown>('remove_group_member', { cid, who }))
export const setGroupAdmin = async (cid: string, who: string, makeAdmin: boolean) =>
  void (await db.rpc<unknown>('set_group_admin', { cid, who, make_admin: makeAdmin }))
export const renameGroup = async (cid: string, newTitle: string) =>
  void (await db.rpc<unknown>('rename_group', { cid, new_title: newTitle }))
export const leaveGroup = async (cid: string) => void (await db.rpc<unknown>('leave_group', { cid }))
/** True when everyone who should receive the file has now saved it. */
export const audioSaved = (mid: string) => db.rpc<boolean>('audio_saved', { mid })


/** Uploads a recorded voice note, then posts the message. Safe to retry. */
export async function sendVoice(m: { id: string; conversation_id: string; blob: Blob; seconds: number }): Promise<void> {
  const s = currentSession()
  if (!s) throw new ApiError('no_session', 'Please log in again.')
  const type = (m.blob.type || 'audio/webm').split(';')[0]
  const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
  const path = `${m.conversation_id}/${m.id}.${ext}`
  await storage.uploadFile(path, m.blob, type)
  try {
    await db.insert('messages', {
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: s.user.id,
      body: 'Voice note',
      kind: 'voice',
      file_path: path,
      file_name: `voice.${ext}`,
      file_size: m.blob.size,
      duration: Math.max(1, Math.round(m.seconds)),
    })
  } catch (e) {
    if (e instanceof ApiError && e.code === '23505') return
    throw e
  }
}


// ---- calls ----
export type CallPass = { url: string; token: string; role: 'host' | 'member'; locked: boolean }
export const callPass = (cid: string) => functions.invoke<CallPass>('livekit-token', { action: 'join', cid })
export const callStatus = (cid: string) =>
  functions.invoke<{ active: boolean; count: number }>('livekit-token', { action: 'status', cid })
export const callHost = (cid: string, action: 'mute_all' | 'lock_all' | 'unlock_all' | 'remove', identity?: string) =>
  functions.invoke<{ ok: boolean }>('livekit-token', { action, cid, identity })
