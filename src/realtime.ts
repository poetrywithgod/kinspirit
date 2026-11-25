import { RealtimeClient, type RealtimeChannel } from '@supabase/realtime-js'
import { useSyncExternalStore } from 'react'
import { SUPABASE_KEY, SUPABASE_URL } from './config'
import { getAccessToken } from './supabase'

/**
 * Live updates. Supabase tells the app the moment a message is added or changed, and the app then refreshes
 * what it shows at once. The normal refresh timers (usePolling) keep running, only slower, so everything still
 * works if the live connection is down. The server only sends the messages this person is allowed to read.
 */
export type LiveStatus = 'off' | 'connecting' | 'live'

let client: RealtimeClient | null = null
let channel: RealtimeChannel | null = null
let status: LiveStatus = 'off'
let tokenTimer = 0
let pokeTimer = 0
const statusSubs = new Set<() => void>()
const pokeSubs = new Set<() => void>()

const setStatus = (s: LiveStatus) => {
  if (status === s) return
  status = s
  statusSubs.forEach((f) => f())
}

export const liveStatus = (): LiveStatus => status
export const useLiveStatus = (): LiveStatus =>
  useSyncExternalStore(
    (f) => {
      statusSubs.add(f)
      return () => void statusSubs.delete(f)
    },
    () => status,
  )

/** Run `fn` whenever the server reports a change (at most about 6 times a second). */
export function onPoke(fn: () => void): () => void {
  pokeSubs.add(fn)
  return () => void pokeSubs.delete(fn)
}

function poke() {
  if (pokeTimer) return
  pokeTimer = window.setTimeout(() => {
    pokeTimer = 0
    pokeSubs.forEach((f) => f())
  }, 150)
}

async function sendToken() {
  try {
    await client?.setAuth(await getAccessToken())
  } catch {
    /* logged out or offline: the next try fixes it */
  }
}

export async function startRealtime() {
  if (client || typeof WebSocket === 'undefined') return
  setStatus('connecting')
  try {
    const url = `${SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1`
    client = new RealtimeClient(url, { params: { apikey: SUPABASE_KEY } })
    await client.setAuth(await getAccessToken())
    channel = client
      .channel('kinspirit-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, poke)
      .subscribe((s: string) => {
        if (s === 'SUBSCRIBED') {
          setStatus('live')
          poke() // catch up on anything missed while connecting
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('connecting')
      })
    // log-in tokens last about an hour: hand the connection a fresh one regularly
    tokenTimer = window.setInterval(() => void sendToken(), 10 * 60 * 1000)
  } catch {
    stopRealtime()
  }
}

export function stopRealtime() {
  window.clearInterval(tokenTimer)
  window.clearTimeout(pokeTimer)
  pokeTimer = 0
  try {
    if (channel) void client?.removeChannel(channel)
    client?.disconnect()
  } catch {
    /* already closed */
  }
  client = null
  channel = null
  setStatus('off')
}
