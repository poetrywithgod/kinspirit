// Plays voice notes, one at a time. Separate from the music player, but starting a voice note pauses the music.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { ApiError, audioSaved, deleteServerFile, downloadAudioFile, type Message } from './api'
import { getVoice, listVoiceIds, saveVoice } from './localdb'
import { toggle as toggleMusic } from './player'

type V = { id: string; playing: boolean; loading: boolean; time: number; duration: number; rate: number; errorId: string; error: string }
let st: V = { id: '', playing: false, loading: false, time: 0, duration: 0, rate: 1, errorId: '', error: '' }
const subs = new Set<() => void>()
const set = (p: Partial<V>) => {
  st = { ...st, ...p }
  subs.forEach((f) => f())
}
const idSubs = new Set<() => void>()

let el: HTMLAudioElement | null = null
let url = ''

function audio(): HTMLAudioElement {
  if (el) return el
  const a = new Audio()
  a.addEventListener('timeupdate', () => set({ time: a.currentTime, duration: Number.isFinite(a.duration) && a.duration > 0 ? a.duration : st.duration }))
  a.addEventListener('play', () => set({ playing: true }))
  a.addEventListener('pause', () => set({ playing: false }))
  a.addEventListener('ended', () => set({ playing: false, time: 0 }))
  el = a
  return a
}

/** Downloads a received voice note onto this device and tells the server (which clears its copy once everyone has it). */
export async function saveReceivedVoice(m: Message): Promise<Blob> {
  if (!m.file_path) throw new ApiError('gone', 'This voice note is no longer available.')
  const blob = await downloadAudioFile(m.file_path)
  await saveVoice(m.id, blob)
  idSubs.forEach((f) => f())
  const path = m.file_path
  void audioSaved(m.id)
    .then((all) => (all ? deleteServerFile(path) : undefined))
    .catch(() => {})
  return blob
}

export async function playVoice(m: Message) {
  const a = audio()
  if (st.id === m.id && a.src) {
    if (a.paused) {
      void toggleMusic(false)
      await a.play().catch(() => {})
    } else a.pause()
    return
  }
  a.pause()
  set({ id: m.id, playing: false, loading: true, time: 0, duration: m.duration ?? 0, errorId: '', error: '' })
  let blob = await getVoice(m.id).catch(() => undefined)
  if (!blob) {
    if (!m.file_path) return set({ id: '', loading: false, errorId: m.id, error: 'This voice note is no longer available.' })
    try {
      blob = await saveReceivedVoice(m)
    } catch (e) {
      return set({ id: '', loading: false, errorId: m.id, error: e instanceof ApiError ? e.message : 'Could not load the voice note.' })
    }
  }
  if (st.id !== m.id) return // the person tapped another one meanwhile
  if (url) URL.revokeObjectURL(url)
  url = URL.createObjectURL(blob)
  a.src = url
  a.playbackRate = st.rate
  void toggleMusic(false)
  set({ loading: false })
  await a.play().catch(() => set({ playing: false, errorId: m.id, error: 'Could not play this voice note.' }))
}

/** Jump to a point in the voice note that is playing (0..1). */
export function seekVoice(fraction: number) {
  if (!el || !el.src) return
  const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : st.duration
  if (d > 0) {
    el.currentTime = Math.max(0, Math.min(1, fraction)) * d
    set({ time: el.currentTime })
  }
}

export function cycleRate() {
  const rate = st.rate === 1 ? 1.5 : st.rate === 1.5 ? 2 : 1
  if (el) el.playbackRate = rate
  set({ rate })
}

export function stopVoice() {
  if (el) {
    el.pause()
    el.removeAttribute('src')
    el.load()
  }
  set({ id: '', playing: false, loading: false, time: 0, duration: 0, error: '', errorId: '' })
}

/** Keeps the sender's own copy so it can be replayed any time. */
export async function keepOwnVoice(id: string, blob: Blob) {
  await saveVoice(id, blob)
  idSubs.forEach((f) => f())
}

export const useVoice = (): V =>
  useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => st,
  )

/** Ids of the voice notes saved on this device. */
export function useVoiceIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    let dead = false
    const load = () =>
      listVoiceIds()
        .then((k) => !dead && setIds(new Set(k.map(String))))
        .catch(() => {})
    void load()
    idSubs.add(load)
    return () => {
      dead = true
      idSubs.delete(load)
    }
  }, [])
  return ids
}
