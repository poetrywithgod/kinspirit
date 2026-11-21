// A small Supabase client written with plain fetch, so the app needs no extra package.
import { SUPABASE_KEY, SUPABASE_URL } from './config'

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 0) {
    super(message)
    this.code = code
    this.status = status
  }
}

export type SessionUser = {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}

export type Session = {
  access_token: string
  refresh_token: string
  expires_at: number // seconds since epoch
  user: SessionUser
}

export const STORE_KEY = 'kinspirit.session'

function load(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Session | null
  } catch {
    return null
  }
}

let session: Session | null = load()

function save(s: Session | null) {
  session = s
  try {
    if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s))
    else localStorage.removeItem(STORE_KEY)
  } catch {
    // storage blocked: the session just lasts until the page closes
  }
}

/** Re-reads the session from storage (another tab may have saved one). */
export function reloadSession(): Session | null {
  session = load()
  return session
}

/**
 * Runs when the email "Confirm my email" link is opened: Supabase sends the person back
 * with the session in the page address. Saves it and tidies the address bar.
 */
export async function consumeAuthRedirect(): Promise<{ session: Session | null; error: string | null }> {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return { session: null, error: null }
  const q = new URLSearchParams(hash)
  const tidy = () => window.history.replaceState(null, '', window.location.pathname + window.location.search)

  if (q.get('error')) {
    tidy()
    const expired = q.get('error_code') === 'otp_expired'
    return {
      session: null,
      error: expired
        ? 'That email link has expired. Log in or sign up again to get a new code.'
        : (q.get('error_description')?.replace(/\+/g, ' ') ?? 'Could not confirm your email.'),
    }
  }
  const at = q.get('access_token')
  const rt = q.get('refresh_token')
  if (!at || !rt || q.get('type') !== 'signup') return { session: null, error: null }
  tidy()
  const user = await call<SessionUser>('/auth/v1/user', { token: at })
  const s: Session = {
    access_token: at,
    refresh_token: rt,
    expires_at: Number(q.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(q.get('expires_in') ?? 3600),
    user,
  }
  save(s)
  return { session: s, error: null }
}

/** Calls back when the confirmation link is opened in another tab of this browser. */
export function onSessionFromOtherTab(email: string, cb: () => void): () => void {
  const check = () => {
    const s = reloadSession()
    if (s && s.user.email?.toLowerCase() === email.toLowerCase()) cb()
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORE_KEY && e.newValue) check()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') check()
  }
  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    window.removeEventListener('storage', onStorage)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

export function currentSession() {
  return session
}

export function signOutLocal() {
  save(null)
}

const FRIENDLY: Record<string, string> = {
  user_already_exists: 'That email already has an account. Log in instead.',
  email_exists: 'That email already has an account. Log in instead.',
  weak_password: 'Choose a stronger password.',
  over_email_send_rate_limit: 'Too many emails sent. Wait a few minutes and try again.',
  over_request_rate_limit: 'Too many tries. Wait a minute and try again.',
  invalid_credentials: 'Email or password is wrong.',
  otp_expired: 'That code is wrong or has expired. Try again, or ask for a new one.',
  email_address_invalid: 'Check the email address and try again.',
  validation_failed: 'Check what you entered and try again.',
  signup_disabled: 'Sign-ups are switched off on the server.',
  '42501': 'The server is not allowing this yet. Run the latest supabase/schema.sql in the Supabase SQL Editor, then try again.',
}

type Opts = {
  method?: string
  body?: unknown
  token?: string
  headers?: Record<string, string>
  rawBody?: BodyInit
}

async function request(path: string, o: Opts = {}): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: SUPABASE_KEY,
    ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}),
    ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...o.headers,
  }
  try {
    return await fetch(`${SUPABASE_URL}${path}`, {
      method: o.method ?? (o.body !== undefined || o.rawBody ? 'POST' : 'GET'),
      headers,
      body: o.rawBody ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
    })
  } catch {
    throw new ApiError('network', 'Cannot reach the server. Check your internet and try again.')
  }
}

async function call<T>(path: string, o: Opts = {}): Promise<T> {
  const res = await request(path, o)
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    // not JSON
  }
  if (!res.ok) {
    const code = String(data.error_code ?? data.code ?? data.error ?? `http_${res.status}`)
    const msg = String(data.msg ?? data.message ?? data.error_description ?? data.error ?? 'Something went wrong.')
    throw new ApiError(code, FRIENDLY[code] ?? msg, res.status)
  }
  return data as T
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in?: number
  expires_at?: number
  user: SessionUser
}

function toSession(t: TokenResponse): Session {
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: t.expires_at ?? Math.floor(Date.now() / 1000) + (t.expires_in ?? 3600),
    user: t.user,
  }
}

export const auth = {
  /** Returns the new session when the server confirms the email at once, else null (a code was emailed). */
  async signUp(email: string, password: string, metadata: Record<string, unknown>): Promise<Session | null> {
    const data = await call<Partial<TokenResponse> & { identities?: unknown[] }>('/auth/v1/signup', {
      body: { email, password, data: metadata },
    })
    if (data.access_token) {
      const s = toSession(data as TokenResponse)
      save(s)
      return s
    }
    // An already-registered, confirmed email comes back with no identities.
    if (Array.isArray(data.identities) && data.identities.length === 0) {
      throw new ApiError('user_already_exists', FRIENDLY.user_already_exists)
    }
    return null
  },

  async verifySignupCode(email: string, token: string): Promise<Session> {
    const s = toSession(await call<TokenResponse>('/auth/v1/verify', { body: { type: 'signup', email, token } }))
    save(s)
    return s
  },

  async resendSignupCode(email: string): Promise<void> {
    await call('/auth/v1/resend', { body: { type: 'signup', email } })
  },

  /** Ends the session on the server (best effort) and forgets it on this device. */
  async signOut(): Promise<void> {
    const token = session?.access_token
    save(null)
    if (token) await request('/auth/v1/logout', { body: {}, token }).catch(() => undefined)
  },

  async signIn(email: string, password: string): Promise<Session> {
    const s = toSession(await call<TokenResponse>('/auth/v1/token?grant_type=password', { body: { email, password } }))
    save(s)
    return s
  },
}

async function accessToken(): Promise<string> {
  if (!session) throw new ApiError('no_session', 'Please log in again.')
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token
  try {
    const s = toSession(
      await call<TokenResponse>('/auth/v1/token?grant_type=refresh_token', {
        body: { refresh_token: session.refresh_token },
      }),
    )
    save(s)
    return s.access_token
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'network') save(null)
    throw new ApiError('no_session', 'Your session ended. Please log in again.')
  }
}

function setupHint(e: unknown): never {
  if (e instanceof ApiError && (e.status === 404 || e.code === 'PGRST205' || e.code === 'PGRST202')) {
    throw new ApiError(
      'setup_missing',
      'The server is not fully set up yet. Run supabase/schema.sql in the Supabase SQL editor.',
      e.status,
    )
  }
  throw e
}

export const db = {
  async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    try {
      return await call<T>(`/rest/v1/rpc/${fn}`, { body: args, token: await accessToken() })
    } catch (e) {
      return setupHint(e)
    }
  },

  async select<T>(query: string): Promise<T[]> {
    try {
      return await call<T[]>(`/rest/v1/${query}`, { token: await accessToken() })
    } catch (e) {
      return setupHint(e)
    }
  },

  /** Creates the row; if this person already has one, updates it instead. */
  async save(table: string, row: Record<string, unknown> & { id: string }): Promise<void> {
    const token = await accessToken()
    const taken = () => new ApiError('username_taken', 'That username was just taken. Try another.', 409)
    try {
      await call(`/rest/v1/${table}`, { body: row, token, headers: { Prefer: 'return=minimal' } })
      return
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== '23505') return setupHint(e)
      if (/username/i.test(e.message)) throw taken()
    }
    // The row for this person already exists: update it.
    const { id, ...rest } = row
    try {
      await call(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: rest,
        token,
        headers: { Prefer: 'return=minimal' },
      })
    } catch (e) {
      if (e instanceof ApiError && e.code === '23505') throw taken()
      return setupHint(e)
    }
  },
}

export const storage = {
  /** Uploads a JPEG to the public "avatars" bucket and returns its public URL. */
  async uploadAvatar(userId: string, jpeg: Blob): Promise<string> {
    const path = `${userId}/avatar.jpg`
    try {
      await call(`/storage/v1/object/avatars/${path}`, {
        rawBody: jpeg,
        token: await accessToken(),
        headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      })
    } catch (e) {
      return setupHint(e)
    }
    return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?v=${Date.now()}`
  },
}
