import { disablePush } from './push'
// The app talks to the server only through this file.
// Email sign-up, log-in, username and profile are REAL (Supabase).
// Phone verification is still a DEV STUB: it needs a WhatsApp webhook on the server.
import { WHATSAPP_NUMBER } from './config'
import { audioType } from './mime'
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

export const signOut = async () => {
  cacheProfile(null)
  await disablePush().catch(() => undefined)
  await auth.signOut()
}

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

/** Replaces my profile photo (a cropped picture from the cropper). Returns the new public address. */
export async function updateAvatar(photo: string): Promise<string> {
  const s = currentSession()
  if (!s) throw new ApiError('no_session', 'Please log in again.')
  const blob = await (await fetch(photo)).blob()
  const url = await storage.uploadAvatar(s.user.id, blob)
  await db.update('profiles', s.user.id, { avatar_url: url })
  return url
}

/* A copy of my username and photo address, so the app opens straight to the chats
   even when the connection is slow or the server is busy. */
const PROFILE_KEY = 'kinspirit.profile'

export function cachedProfile(): Profile | null {
  const s = currentSession()
  if (!s) return null
  try {
    const c = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as (Profile & { id: string }) | null
    return c && c.id === s.user.id && c.username ? { username: c.username, avatar_url: c.avatar_url } : null
  } catch {
    return null
  }
}

export function cacheProfile(p: Profile | null): void {
  try {
    const s = currentSession()
    if (!p || !s) localStorage.removeItem(PROFILE_KEY)
    else
      localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({ id: s.user.id, username: p.username, avatar_url: p.avatar_url?.startsWith('http') ? p.avatar_url : null }),
      )
  } catch {
    // storage blocked: the app just asks the server each time
  }
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
  kind?: 'text' | 'audio' | 'voice' | 'call' | 'image' | 'video' | 'file' | 'sticker'
  duration?: number | null
  file_path?: string | null
  file_name?: string | null
  file_size?: number | null
  reply_to?: string | null
  edited_at?: string | null
  deleted_at?: string | null
  updated_at?: string
  file_type?: string | null
  media_w?: number | null
  media_h?: number | null
  call_status?: 'ringing' | 'answered' | 'declined' | 'missed' | 'ended' | 'cancelled' | null
  call_ringing_at?: string | null
  call_answered_at?: string | null
  call_ended_at?: string | null
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

const MESSAGE_COLUMNS =
  'id,conversation_id,sender_id,body,created_at,kind,file_path,file_name,file_size,duration,reply_to,edited_at,deleted_at,updated_at,file_type,media_w,media_h,call_status,call_ringing_at,call_answered_at,call_ended_at'

/** First call: the latest 100 messages. With `after`: only messages newer than that time. */
export async function fetchMessages(cid: string, after?: string): Promise<Message[]> {
  if (after) {
    return db.select<Message>(
      `messages?conversation_id=eq.${cid}&updated_at=gte.${encodeURIComponent(after)}&order=updated_at.asc&limit=200&select=${MESSAGE_COLUMNS}`,
    )
  }
  const rows = await db.select<Message>(
    `messages?conversation_id=eq.${cid}&order=created_at.desc&limit=100&select=${MESSAGE_COLUMNS}`,
  )
  return rows.reverse()
}

/** Sending the same message id twice is safe, so retrying never makes duplicates. */
export async function sendMessage(m: { id: string; conversation_id: string; body: string; kind?: 'text' | 'call' | 'sticker'; reply_to?: string | null }): Promise<void> {
  const s = currentSession()
  if (!s) throw new ApiError('no_session', 'Please log in again.')
  try {
    await db.insert('messages', { id: m.id, conversation_id: m.conversation_id, sender_id: s.user.id, body: m.body, ...(m.kind ? { kind: m.kind } : {}), ...(m.reply_to ? { reply_to: m.reply_to } : {}) })
  } catch (e) {
    if (e instanceof ApiError && e.code === '23505') return
    throw e
  }
}


export const MAX_AUDIO_BYTES = 50 * 1024 * 1024
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024

export const audioPath = (cid: string, id: string, name: string) => {
  const ext = (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'audio').toLowerCase()
  return `${cid}/${id}.${ext}`
}

/** Uploads the file, then posts the message. Safe to retry: same id, same path. */
export async function sendAudio(m: { id: string; conversation_id: string; file: File }): Promise<void> {
  const s = currentSession()
  if (!s) throw new ApiError('no_session', 'Please log in again.')
  const path = audioPath(m.conversation_id, m.id, m.file.name)
  // Phones often leave the type empty, so it is worked out from the file's name.
  const type = audioType(m.file.name, m.file.type) || 'audio/mpeg'
  await storage.uploadFile(path, m.file, type)
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
      file_type: type,
    })
  } catch (e) {
    if (e instanceof ApiError && e.code === '23505') return
    throw e
  }
}

/** Uploads a photo, video or any file with its own name and format, then posts the message. Safe to retry. */
export async function sendMedia(m: {
  id: string
  conversation_id: string
  kind: 'image' | 'video' | 'file'
  file: Blob
  name: string
  type: string
  width?: number
  height?: number
  duration?: number
  onProgress?: (f: number) => void
}): Promise<void> {
  const s = currentSession()
  if (!s) throw new ApiError('no_session', 'Please log in again.')
  const path = audioPath(m.conversation_id, m.id, m.name)
  const type = m.type || 'application/octet-stream'
  if (m.onProgress) await storage.uploadFileWithProgress(path, m.file, type, m.onProgress)
  else await storage.uploadFile(path, m.file, type)
  try {
    await db.insert('messages', {
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: s.user.id,
      body: m.name.slice(0, 200) || 'File',
      kind: m.kind,
      file_path: path,
      file_name: m.name.slice(0, 200) || 'File',
      file_size: m.file.size,
      file_type: type,
      ...(m.width ? { media_w: m.width, media_h: m.height } : {}),
      ...(m.duration ? { duration: Math.round(m.duration) } : {}),
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
    `messages?kind=eq.audio&deleted_at=is.null&sender_id=neq.${me}&order=created_at.desc&limit=100&select=${MESSAGE_COLUMNS}`,
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

/** When a person joined Kinspirit (month and year are shown on their profile). */
export async function profileSince(id: string): Promise<string | null> {
  const rows = await db.select<{ created_at: string }>(`profiles?id=eq.${id}&select=created_at`)
  return rows[0]?.created_at ?? null
}

/** Usernames for some people, by id. */
export async function usernames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  const ps = await db.select<{ id: string; username: string }>(`profiles?id=in.(${ids.join(',')})&select=id,username`)
  ps.forEach((p) => out.set(p.id, p.username))
  return out
}

/** Voice notes and audio files that others sent me recently, in any of my chats. */
export async function listIncomingMedia(days = 30): Promise<Message[]> {
  const me = myId()
  const since = encodeURIComponent(new Date(Date.now() - days * 86400000).toISOString())
  return db.select<Message>(
    `messages?kind=in.(audio,voice,image,video,file)&deleted_at=is.null&sender_id=neq.${me}&created_at=gte.${since}&file_path=not.is.null&order=created_at.desc&limit=80&select=${MESSAGE_COLUMNS}`,
  )
}
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


// ---- ringing ----
export type IncomingCall = {
  id: string
  conversation_id: string
  kind: 'direct' | 'group'
  title: string | null
  caller_id: string
  caller_username: string
  caller_avatar: string | null
  created_at: string
}
export const startCallRpc = async (cid: string) => (await db.rpc<{ id: string; mine: boolean }[]>('start_call', { cid }))[0]
export const incomingCalls = () => db.rpc<IncomingCall[]>('incoming_calls', {})
export const answerCall = (mid: string) => db.rpc<string | null>('answer_call', { mid })
export const declineCall = async (mid: string) => void (await db.rpc<unknown>('decline_call', { mid }))
export const endCall = async (mid: string, failed = false) => void (await db.rpc<unknown>('end_call', { mid, failed }))
export const callRow = async (mid: string) =>
  (await db.select<Message>(`messages?id=eq.${mid}&select=id,call_status,call_ringing_at,call_answered_at`))[0] ?? null

// ---- calls ----
export type CallPass = { url: string; token: string; role: 'host' | 'member'; locked: boolean }
export const callPass = (cid: string) => functions.invoke<CallPass>('livekit-token', { action: 'join', cid })
export const callStatus = (cid: string) =>
  functions.invoke<{ active: boolean; count: number }>('livekit-token', { action: 'status', cid })
export const callHost = (cid: string, action: 'mute_all' | 'lock_all' | 'unlock_all' | 'remove', identity?: string) =>
  functions.invoke<{ ok: boolean }>('livekit-token', { action, cid, identity })


// ---- edit and delete ----
export const editMessage = async (mid: string, body: string) =>
  void (await db.rpc<unknown>('edit_message', { mid, new_body: body }))

/** Deletes for everyone. Also removes the file from storage when there was one. */
export async function deleteMessage(mid: string): Promise<void> {
  const path = await db.rpc<string | null>('delete_message', { mid })
  if (path) await storage.deleteFile(path).catch(() => undefined)
}

// ---- Block & report ----
export const blockUserRpc = async (who: string) => void (await db.rpc<unknown>('block_user', { who }))
export const unblockUserRpc = async (who: string) => void (await db.rpc<unknown>('unblock_user', { who }))
export const myBlocks = () => db.rpc<Person[]>('my_blocks', {})
export const reportUserRpc = async (who: string, reason: string, mid?: string, cid?: string) =>
  void (await db.rpc<unknown>('report_user', { who, reason, mid: mid ?? null, cid: cid ?? null }))

// ---- Reactions and the general group ----
export type Reaction = { message_id: string; user_id: string; emoji: string }
export const listReactions = (cid: string) => db.rpc<Reaction[]>('conversation_reactions', { cid })
export const reactTo = async (mid: string, emoji: string | null) => void (await db.rpc<unknown>('react', { mid, new_emoji: emoji }))
export const joinGeneral = () => db.rpc<string>('join_general', {})

// ---- Find friends by phone number ----
export const matchPhones = (nums: string[]) => db.rpc<Person[]>('match_phones', { nums })
export const setDiscoverable = async (on_off: boolean) => void (await db.rpc<unknown>('set_discoverable', { on_off }))
export const myDiscoverable = () => db.rpc<boolean>('my_discoverable', {})

// ---- Ticks and profile links ----
export type Receipts = { delivered_at: string | null; read_at: string | null }
export const chatReceipts = async (cid: string): Promise<Receipts> =>
  (await db.rpc<Receipts[]>('chat_receipts', { cid }))[0] ?? { delivered_at: null, read_at: null }
export const markDelivered = async () => void (await db.rpc<unknown>('mark_delivered', {}))
export const profileByUsername = async (u: string): Promise<Person | null> =>
  (await db.rpc<Person[]>('profile_by_username', { u }))[0] ?? null
