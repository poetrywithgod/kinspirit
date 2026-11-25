/**
 * Optional "unlock with fingerprint / face / screen lock" for this device.
 *
 * It uses the phone's own biometric check (WebAuthn platform authenticator). The check happens on the phone:
 * Kinspirit never sees or stores a fingerprint or face. It is an app lock for the signed-in session on this
 * device, so it is per device, and logging out removes it.
 */
const KEY = 'kinspirit.lock'
export const LOCK_AFTER_MS = 60_000 // lock again after the app was away this long

type Stored = { id: string; user: string }

const b64 = (bytes: ArrayBuffer | Uint8Array) => {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of u) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64 = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0))
}
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

function read(): Stored | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null
    return v && typeof v.id === 'string' && typeof v.user === 'string' ? v : null
  } catch {
    return null
  }
}

/** Can this device do a biometric / screen-lock check? */
export async function lockSupported(): Promise<boolean> {
  try {
    return (
      typeof window !== 'undefined' &&
      !!window.PublicKeyCredential &&
      !!navigator.credentials &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    )
  } catch {
    return false
  }
}

/** Is the lock switched on for this person on this device? */
export function lockEnabledFor(userId: string | undefined): boolean {
  const s = read()
  return !!s && !!userId && s.user === userId
}

export function disableLock() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: nothing to remove */
  }
}

export type LockResult = 'ok' | 'cancelled' | 'failed'

/** Switch the lock on: the phone asks for the fingerprint / face once to prove it works. */
export async function enableLock(userId: string, username: string): Promise<LockResult> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Kinspirit' },
        user: { id: new TextEncoder().encode(userId), name: username, displayName: username },
        challenge: random(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null
    if (!cred) return 'cancelled'
    localStorage.setItem(KEY, JSON.stringify({ id: b64(cred.rawId), user: userId } satisfies Stored))
    return 'ok'
  } catch (e) {
    return e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError') ? 'cancelled' : 'failed'
  }
}

/** Ask the phone to check the fingerprint / face / screen lock. */
export async function unlockWithDevice(): Promise<LockResult> {
  const s = read()
  if (!s) return 'ok'
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: unb64(s.id), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return got ? 'ok' : 'cancelled'
  } catch (e) {
    return e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError') ? 'cancelled' : 'failed'
  }
}
