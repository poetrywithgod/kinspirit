// One music player for the whole app. It lives outside React, so changing tabs or opening a chat never stops it.
import { useSyncExternalStore } from 'react'
import { getAudioBlob, listAudio, type AudioMeta } from './localdb'
import { withAudioType } from './mime'

export type Track = { id: string; title: string; artist: string }
export type Repeat = 'off' | 'all' | 'one'
export type PlayerState = {
  queue: Track[]
  index: number
  playing: boolean
  loading: boolean
  time: number
  duration: number
  shuffle: boolean
  repeat: Repeat
  error: string
}

let state: PlayerState = {
  queue: [],
  index: -1,
  playing: false,
  loading: false,
  time: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  error: '',
}
const subs = new Set<() => void>()
function set(p: Partial<PlayerState>) {
  state = { ...state, ...p }
  subs.forEach((f) => f())
}

let el: HTMLAudioElement | null = null
let objectUrl = ''
let loadToken = 0

// Phones only let a page start sound straight after a tap. Our play() has to read the file first,
// which takes a moment, so the player is "unlocked" at the moment of the tap with a silent clip.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
const isSilent = () => !!el && el.src.startsWith('data:')
const hasTrack = () => !!el && !!el.src && !isSilent()
function unlock() {
  const a = audio()
  if (a.src) return
  a.src = SILENCE
  void a.play().catch(() => undefined)
}

function audio(): HTMLAudioElement {
  if (el) return el
  const a = new Audio()
  a.preload = 'auto'
  a.addEventListener('timeupdate', () => {
    if (isSilent()) return
    set({ time: a.currentTime, duration: Number.isFinite(a.duration) ? a.duration : state.duration })
    syncPosition()
  })
  a.addEventListener('durationchange', () => set({ duration: Number.isFinite(a.duration) ? a.duration : 0 }))
  a.addEventListener('play', () => !isSilent() && set({ playing: true }))
  a.addEventListener('pause', () => !isSilent() && set({ playing: false }))
  a.addEventListener('error', () => {
    if (isSilent() || !a.src) return
    set({ loading: false, playing: false, error: "This audio can't be played on this phone. Its format may not be supported (try MP3 or M4A)." })
  })
  a.addEventListener('ended', () => {
    if (isSilent()) return
    if (state.repeat === 'one') {
      a.currentTime = 0
      void a.play()
    } else next(true)
  })
  el = a
  setupMediaSession()
  return a
}

function syncPosition() {
  if (!('mediaSession' in navigator) || !el || !Number.isFinite(el.duration) || el.duration <= 0) return
  try {
    navigator.mediaSession.setPositionState({ duration: el.duration, position: Math.min(el.currentTime, el.duration), playbackRate: 1 })
  } catch {
    // some browsers reject odd values
  }
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  const on = (a: MediaSessionAction, f: MediaSessionActionHandler) => {
    try {
      ms.setActionHandler(a, f)
    } catch {
      // not supported here
    }
  }
  on('play', () => void toggle(true))
  on('pause', () => void toggle(false))
  on('previoustrack', () => void prev())
  on('nexttrack', () => next(false))
  on('seekto', (d) => d.seekTime !== undefined && seek(d.seekTime))
  on('seekbackward', (d) => seek((el?.currentTime ?? 0) - (d.seekOffset ?? 10)))
  on('seekforward', (d) => seek((el?.currentTime ?? 0) + (d.seekOffset ?? 10)))
}

async function load(index: number, autoplay = true) {
  const t = state.queue[index]
  if (!t) return
  const token = ++loadToken
  set({ index, loading: true, error: '', time: 0, duration: 0 })
  const raw = await getAudioBlob(t.id).catch(() => undefined)
  if (token !== loadToken) return
  const blob = raw && withAudioType(raw, t.title)
  if (!blob) {
    set({ loading: false, playing: false, error: 'This file is not on this device any more.' })
    return
  }
  const a = audio()
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(blob)
  a.src = objectUrl
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: 'Kinspirit' })
  }
  set({ loading: false })
  if (autoplay)
    await a.play().catch((e: unknown) =>
      set({
        playing: false,
        error:
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Tap play once more to start.'
            : e instanceof DOMException && e.name === 'NotSupportedError'
            ? "This audio can't be played on this phone. Its format may not be supported (try MP3 or M4A)."
            : 'Could not play this file.',
      }),
    )
}

const toTrack = (m: AudioMeta): Track => ({ id: m.id, title: m.name, artist: m.from ? `@${m.from}` : 'You' })

/** Plays `id`, with everything in `list` (or the whole library) as the queue. */
export async function play(id: string, list?: AudioMeta[]) {
  unlock()
  const metas = list ?? (await listAudio())
  const queue = metas.map(toTrack)
  const index = queue.findIndex((t) => t.id === id)
  if (index < 0) return
  if (state.queue[state.index]?.id === id && hasTrack()) {
    set({ queue, index })
    return void toggle(true)
  }
  set({ queue, index })
  await load(index)
}

export async function toggle(want?: boolean) {
  const a = audio()
  if (state.index < 0) return
  const shouldPlay = want ?? a.paused
  if (shouldPlay) {
    if (!hasTrack()) return load(state.index)
    await a.play().catch(() => {})
  } else a.pause()
}

export function next(fromEnd: boolean) {
  const n = state.queue.length
  if (!n) return
  let i: number
  if (state.shuffle && n > 1) {
    do i = Math.floor(Math.random() * n)
    while (i === state.index)
  } else {
    i = state.index + 1
    if (i >= n) {
      if (state.repeat === 'all' || !fromEnd) i = 0
      else {
        audio().pause()
        audio().currentTime = 0
        set({ playing: false, time: 0 })
        return
      }
    }
  }
  void load(i)
}

export async function prev() {
  const a = audio()
  if (a.currentTime > 3 || state.queue.length < 2) {
    a.currentTime = 0
    return
  }
  void load(state.index <= 0 ? state.queue.length - 1 : state.index - 1)
}

export function seek(t: number) {
  const a = audio()
  if (!Number.isFinite(a.duration)) return
  a.currentTime = Math.max(0, Math.min(t, a.duration))
  set({ time: a.currentTime })
}

export const toggleShuffle = () => set({ shuffle: !state.shuffle })
export const cycleRepeat = () => set({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' })

export function stop() {
  loadToken++
  if (el) {
    el.pause()
    el.removeAttribute('src')
    el.load()
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = ''
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
  set({ queue: [], index: -1, playing: false, loading: false, time: 0, duration: 0, error: '' })
}

/** A file was deleted from the library: drop it from the queue, stopping if it was playing. */
export function forget(id: string) {
  const cur = state.queue[state.index]?.id
  if (cur === id) {
    const rest = state.queue.filter((t) => t.id !== id)
    if (!rest.length) return stop()
    const i = Math.min(state.index, rest.length - 1)
    const wasPlaying = state.playing
    set({ queue: rest })
    void load(i, wasPlaying)
  } else {
    const queue = state.queue.filter((t) => t.id !== id)
    set({ queue, index: queue.findIndex((t) => t.id === cur) })
  }
}

export function renameInQueue(id: string, title: string) {
  set({ queue: state.queue.map((t) => (t.id === id ? { ...t, title } : t)) })
  if (state.queue[state.index]?.id === id && 'mediaSession' in navigator && navigator.mediaSession.metadata) {
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: state.queue[state.index].artist, album: 'Kinspirit' })
  }
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => state,
  )
}

export const currentTrack = (s: PlayerState): Track | undefined => s.queue[s.index]
