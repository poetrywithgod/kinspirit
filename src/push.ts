import { VAPID_PUBLIC_KEY } from './config'
import { db } from './supabase'

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'on' | 'off'

const supported = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const toKey = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function current(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

const send = (s: PushSubscription) => {
  const j = s.toJSON()
  return db.rpc<unknown>('save_push_subscription', { endpoint: s.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' })
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return Notification.permission === 'granted' && (await current()) ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

/** Asks permission, subscribes this device and tells the server. Returns the new state. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'unconfigured'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) }))
  await send(sub)
  return 'on'
}

export async function disablePush(): Promise<void> {
  if (!supported()) return
  const sub = await current()
  if (!sub) return
  await db.rpc<unknown>('remove_push_subscription', { endpoint: sub.endpoint }).catch(() => undefined)
  await sub.unsubscribe().catch(() => undefined)
}

/** On every start: make sure the server knows this device belongs to whoever is logged in now. */
export async function resyncPush(): Promise<void> {
  try {
    if (!supported() || !VAPID_PUBLIC_KEY || Notification.permission !== 'granted') return
    const sub = await current()
    if (sub) await send(sub)
  } catch {
    /* try again next start */
  }
}
