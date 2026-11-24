import { VAPID_PUBLIC_KEY } from './config'
import { ApiError, db, functions } from './supabase'

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'on' | 'off'

const KEY = VAPID_PUBLIC_KEY.trim()

const supported = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const toKey = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** The service worker, or a clear error instead of waiting forever when there is none. */
async function worker(): Promise<ServiceWorkerRegistration> {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 8000)),
  ])
  if (!reg) throw new Error('The app is still getting ready. Close it, open it again and try once more.')
  return reg
}

async function current(): Promise<PushSubscription | null> {
  return (await worker()).pushManager.getSubscription()
}

async function subscribe(): Promise<PushSubscription> {
  const reg = await worker()
  const have = await reg.pushManager.getSubscription()
  if (have) return have
  try {
    return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(KEY) })
  } catch (e) {
    throw new Error(`This phone could not register for notifications (${(e as Error).message || 'unknown reason'}).`)
  }
}

const send = (s: PushSubscription) => {
  const j = s.toJSON()
  return db.rpc<unknown>('save_push_subscription', { endpoint: s.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' })
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported'
  if (!KEY) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return Notification.permission === 'granted' && (await current()) ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

/** True when this phone has not been asked yet, so the app should ask. */
export const canAskForPush = () => supported() && !!KEY && Notification.permission === 'default'

/** Asks permission, registers this phone and tells the server. Throws a readable error when something fails. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported'
  if (!KEY) return 'unconfigured'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  const sub = await subscribe()
  try {
    await send(sub)
  } catch {
    throw new Error('Could not save this phone on the server. Check your connection and try again.')
  }
  return 'on'
}

export async function disablePush(): Promise<void> {
  if (!supported()) return
  const sub = await current().catch(() => null)
  if (!sub) return
  await db.rpc<unknown>('remove_push_subscription', { endpoint: sub.endpoint }).catch(() => undefined)
  await sub.unsubscribe().catch(() => undefined)
}

/** On every start: if notifications are allowed, make sure this phone is registered for whoever is logged in now. */
export async function resyncPush(): Promise<void> {
  try {
    if (!supported() || !KEY || Notification.permission !== 'granted') return
    await send(await subscribe())
  } catch {
    /* try again next start */
  }
}

/** Sends a real notification to this account through the server and explains what happened. */
export async function testPush(): Promise<{ ok: boolean; text: string }> {
  type R = { ok: boolean; step: string; message?: string; devices?: number; sent?: number; failed?: { status: number | null; message: string }[] }
  try {
    await resyncPush() // register this phone first, so the test is honest
    const r = await functions.invoke<R>('send-push', { test: true })
    if (r.step === 'vapid-missing') return { ok: false, text: 'The server is missing its notification keys. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Supabase secrets.' }
    if (r.step === 'vapid-invalid') return { ok: false, text: `The server's notification keys or VAPID_SUBJECT are not valid: ${r.message ?? ''}` }
    if (r.step === 'no-device') return { ok: false, text: 'The server has no registered phone for you. Switch notifications off and on again, then retry.' }
    if (r.step === 'database') return { ok: false, text: `The server could not read its tables: ${r.message ?? ''}. Run the latest schema.sql.` }
    if (r.step === 'not-signed-in') return { ok: false, text: 'Please log in again, then retry.' }
    const bad = r.failed ?? []
    if (r.ok) {
      return { ok: true, text: `Sent to ${r.sent} of ${r.devices} device(s). It should appear in a few seconds. If nothing shows, check Kinspirit's notification settings in your phone.` }
    }
    const codes = bad.map((b) => b.status).filter(Boolean).join(', ')
    const mismatch = bad.some((b) => b.status === 401 || b.status === 403)
    return {
      ok: false,
      text: mismatch
        ? `The push service refused the message (${codes}). The public key in the app (VITE_VAPID_PUBLIC_KEY) and the private key in Supabase are probably not the same pair.`
        : `The push service could not deliver it${codes ? ` (${codes})` : ''}${bad[0]?.message ? `: ${bad[0].message}` : ''}.`,
    }
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.code === 'calls_not_ready' || e.code === 'calls_unreachable')) {
      return { ok: false, text: 'The send-push function is not answering. Check that it exists with exactly that name and that Verify JWT is OFF.' }
    }
    return { ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' }
  }
}
