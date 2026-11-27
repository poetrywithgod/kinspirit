// A small Supabase client written with plain fetch, so the app needs no extra package.
import { SUPABASE_KEY, SUPABASE_URL } from './config'

export class ApiError extends Error {
  code: string
  status: number
  raw: string // the server's own text, before it is made friendly
  constructor(code: string, message: string, status = 0, raw = message) {
    super(message)
    this.code = code
    this.status = status
    this.raw = raw
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
  same_password: 'Your new password must be different from the old one.',
  P0001: 'Something went wrong. Try again.',
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
    throw new ApiError(code, FRIENDLY[code] ?? msg, res.status, msg)
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

  /** Emails a reset code (the server answers the same whether or not the email has an account). */
  async requestRecovery(email: string): Promise<void> {
    await call('/auth/v1/recover', { body: { email } })
  },

  /** Checks the emailed code, sets the new password, and logs the person in on this device. */
  async resetPassword(email: string, token: string, password: string): Promise<Session> {
    const t = toSession(await call<TokenResponse>('/auth/v1/verify', { body: { type: 'recovery', email, token } }))
    await call('/auth/v1/user', { method: 'PUT', body: { password }, token: t.access_token })
    save(t)
    return t
  },

  /** Checks a password against the logged-in account without changing the saved log-in. */
  async verifyPassword(current: string): Promise<void> {
    const s = session
    if (!s?.user.email) throw new ApiError('no_session', 'Please log in again.')
    await call('/auth/v1/token?grant_type=password', { body: { email: s.user.email, password: current } })
  },

  /** Changes the password of the person who is logged in. Checks the current password first. */
  async changePassword(current: string, password: string): Promise<void> {
    const s = session
    if (!s?.user.email) throw new ApiError('no_session', 'Please log in again.')
    await this.verifyPassword(current)
    const token = await accessToken()
    await call('/auth/v1/user', { method: 'PUT', body: { password }, token })
  },

  async signIn(email: string, password: string): Promise<Session> {
    const s = toSession(await call<TokenResponse>('/auth/v1/token?grant_type=password', { body: { email, password } }))
    save(s)
    return s
  },
}

// Refresh tokens are single-use. If several requests refresh at once (the chat polls in parallel),
// all but one would fail and wrongly log the person out. So only one refresh runs at a time,
// and another open tab's newer session is adopted instead of refreshing again.
let refreshing: Promise<string> | null = null

const fresh = (s: Session | null) => !!s && s.expires_at - 60 > Date.now() / 1000

async function refreshNow(): Promise<string> {
  const stored = load()
  if (stored && fresh(stored)) {
    session = stored
    return stored.access_token
  }
  const token = (stored ?? session)?.refresh_token
  if (!token) throw new ApiError('no_session', 'Please log in again.')
  try {
    const s = toSession(
      await call<TokenResponse>('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: token } }),
    )
    save(s)
    return s.access_token
  } catch (e) {
    // Only a clear "this log-in is no longer valid" answer ends the session.
    // A bad connection or a server hiccup keeps it, so the next try can succeed.
    if (e instanceof ApiError && (e.status === 400 || e.status === 401 || e.status === 403)) {
      const again = load()
      if (again && again.refresh_token !== token) {
        session = again // another tab already refreshed
        if (fresh(again)) return again.access_token
      } else {
        save(null)
        throw new ApiError('no_session', 'Your session ended. Please log in again.')
      }
    }
    if (e instanceof ApiError && e.code === 'network') throw e
    throw new ApiError('server_busy', 'The server is busy. Try again in a moment.', e instanceof ApiError ? e.status : 0)
  }
}

/** A current log-in token (refreshed when needed), for the live-updates connection. */
export const getAccessToken = () => accessToken()

async function accessToken(): Promise<string> {
  if (!session) throw new ApiError('no_session', 'Please log in again.')
  if (fresh(session)) return session.access_token
  refreshing ??= refreshNow().finally(() => {
    refreshing = null
  })
  return refreshing
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

  async insert(table: string, row: Record<string, unknown>): Promise<void> {
    try {
      await call(`/rest/v1/${table}`, {
        body: row,
        token: await accessToken(),
        headers: { Prefer: 'return=minimal' },
      })
    } catch (e) {
      return setupHint(e)
    }
  },

  /** Changes some columns of one row (by id). */
  async update(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
    try {
      await call(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: patch,
        token: await accessToken(),
        headers: { Prefer: 'return=minimal' },
      })
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

  /** Puts a file in the private "chat-files" bucket (safe to repeat for the same path). */
  /** Removes files from a storage bucket (my own uploads). Best effort: failures are ignored by callers. */
  async remove(bucket: 'chat-files' | 'avatars', paths: string[]): Promise<void> {
    if (!paths.length) return
    await call(`/storage/v1/object/${bucket}`, { method: 'DELETE', body: { prefixes: paths }, token: await accessToken() })
  },

  async uploadFile(path: string, file: Blob, contentType: string): Promise<void> {
    try {
      await call(`/storage/v1/object/chat-files/${path}`, {
        rawBody: file,
        token: await accessToken(),
        headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
      })
    } catch (e) {
      if (e instanceof ApiError && /exceeded|too large|maximum/i.test(e.message)) {
        throw new ApiError('too_large', 'That file is too big. The limit is 50 MB.')
      }
      return setupHint(e)
    }
  },

  /** Same as uploadFile, but reports how much has been sent (0 to 1), for big photos and videos. */
  async uploadFileWithProgress(path: string, file: Blob, contentType: string, onProgress: (f: number) => void): Promise<void> {
    const token = await accessToken()
    await new Promise<void>((resolve, reject) => {
      const x = new XMLHttpRequest()
      x.open('POST', `${SUPABASE_URL}/storage/v1/object/chat-files/${path}`)
      x.setRequestHeader('apikey', SUPABASE_KEY)
      x.setRequestHeader('Authorization', `Bearer ${token}`)
      x.setRequestHeader('Content-Type', contentType)
      x.setRequestHeader('x-upsert', 'true')
      x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
      x.onerror = () => reject(new ApiError('network', 'Cannot reach the server. Check your internet and try again.'))
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) return resolve()
        if (x.status === 413 || /exceeded|too large|maximum/i.test(x.responseText)) {
          return reject(new ApiError('too_large', 'That file is too big. The limit is 50 MB.'))
        }
        reject(new ApiError(`http_${x.status}`, 'Could not send the file. Try again.', x.status))
      }
      x.send(file)
    })
  },

  async downloadFile(path: string): Promise<Blob> {
    const res = await request(`/storage/v1/object/authenticated/chat-files/${path}`, { token: await accessToken() })
    if (!res.ok) {
      throw new ApiError(
        res.status === 400 || res.status === 404 ? 'gone' : `http_${res.status}`,
        res.status === 400 || res.status === 404 ? 'This file is no longer available.' : 'Could not download the file.',
        res.status,
      )
    }
    return res.blob()
  },

  async deleteFile(path: string): Promise<void> {
    await request(`/storage/v1/object/chat-files/${path}`, { method: 'DELETE', token: await accessToken() })
  },
}

export const functions = {
  /** Calls a Supabase Edge Function as the signed-in person. */
  async invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
    try {
      return await call<T>(`/functions/v1/${name}`, { body, token: await accessToken() })
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        throw new ApiError('calls_not_ready', 'Calls are not set up yet. The call function still needs to be added in Supabase.', 404)
      }
      if (e instanceof ApiError && e.code === 'network' && navigator.onLine !== false) {
        // The phone is online (chat works) but the function did not answer: it is missing, failed to start,
        // or still requires a Supabase JWT check, so the browser blocks the reply.
        console.error(
          `Edge function "${name}" did not answer. Open ${SUPABASE_URL}/functions/v1/${name} in a browser tab to see why: ` +
            'NOT_FOUND = not deployed; "Missing authorization header" = turn OFF "Enforce JWT verification"; BOOT_ERROR = redeploy it.',
        )
        throw new ApiError('calls_unreachable', "Calls can't start right now: the call service is not answering. Please try again in a little while.", 0)
      }
      throw e
    }
  },
}
