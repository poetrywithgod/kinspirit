// The app talks to the server only through this file.
// Email sign-up, log-in, username and profile are REAL (Supabase).
// Phone verification is still a DEV STUB: it needs a WhatsApp webhook on the server.
import { WHATSAPP_NUMBER } from './config'
import { EMAIL_OTP_LENGTH } from './config'
import { ApiError, auth, consumeAuthRedirect, currentSession, db, onSessionFromOtherTab, storage } from './supabase'

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

export type Profile = { username: string; avatar_url: string | null; phone: string | null }

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
  const rows = await db.select<Profile>(`profiles?id=eq.${s.user.id}&select=username,avatar_url,phone`)
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
