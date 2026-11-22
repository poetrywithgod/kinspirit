// Incoming calls: the phone rings while the app is open, with Accept and Decline.
import { useSyncExternalStore } from 'react'
import { answerCall, declineCall, incomingCalls, type IncomingCall } from './api'
import { getCall, joinCall } from './call'

let current: IncomingCall | null = null
let busy = false
const dismissed = new Set<string>() // group calls someone said no to, so they stay hidden here
const subs = new Set<() => void>()
const set = (c: IncomingCall | null) => {
  if ((c?.id ?? '') === (current?.id ?? '')) return
  current = c
  c ? startRing() : stopRing()
  subs.forEach((f) => f())
}

/** Asked every few seconds while the app is open. */
export async function pollIncoming(): Promise<void> {
  if (getCall().phase !== 'idle') return set(null) // already in a call
  const list = await incomingCalls()
  set(list.find((c) => !dismissed.has(c.id)) ?? null)
}

export async function acceptIncoming(): Promise<string> {
  const c = current
  if (!c || busy) return ''
  busy = true
  try {
    const status = await answerCall(c.id)
    set(null)
    if (status !== 'answered') return 'That call has ended.'
    await joinCall({ id: c.conversation_id, name: c.kind === 'group' ? (c.title ?? 'Group call') : `@${c.caller_username}`, kind: c.kind }, { callId: c.id })
    return ''
  } catch {
    set(null)
    return 'Could not answer. Check your internet.'
  } finally {
    busy = false
  }
}

export async function declineIncoming() {
  const c = current
  if (!c) return
  dismissed.add(c.id)
  set(null)
  await declineCall(c.id).catch(() => undefined)
}

export const useIncoming = (): IncomingCall | null =>
  useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => current,
  )

// ---- ringtone: a soft two-note ring, plus vibration where the phone allows it ----
let ringCtx: AudioContext | null = null
let ringTimer = 0

function beep(freq: number, at: number, len: number) {
  if (!ringCtx) return
  const o = ringCtx.createOscillator()
  const g = ringCtx.createGain()
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, ringCtx.currentTime + at)
  g.gain.exponentialRampToValueAtTime(0.18, ringCtx.currentTime + at + 0.03)
  g.gain.exponentialRampToValueAtTime(0.0001, ringCtx.currentTime + at + len)
  o.connect(g).connect(ringCtx.destination)
  o.start(ringCtx.currentTime + at)
  o.stop(ringCtx.currentTime + at + len + 0.05)
}

function ringOnce() {
  try {
    ringCtx ??= new AudioContext()
    void ringCtx.resume()
    beep(523, 0, 0.35)
    beep(659, 0.4, 0.35)
    beep(523, 1.0, 0.35)
    beep(659, 1.4, 0.35)
    navigator.vibrate?.([350, 100, 350])
  } catch {
    // no sound allowed: the screen still shows the call
  }
}

function startRing() {
  stopRing()
  ringOnce()
  ringTimer = window.setInterval(ringOnce, 3200)
}

function stopRing() {
  window.clearInterval(ringTimer)
  try {
    navigator.vibrate?.(0)
  } catch {
    // ignore
  }
}
