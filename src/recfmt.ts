import { useSyncExternalStore } from 'react'

/** Call recording formats. Opus is the smallest, AAC plays on every phone, MP3 plays everywhere. */
export type RecFormat = 'opus' | 'aac' | 'mp3'
const KEY = 'kinspirit.recformat'
const subs = new Set<() => void>()
let fmt: RecFormat = 'opus'
try {
  const v = localStorage.getItem(KEY)
  if (v === 'opus' || v === 'aac' || v === 'mp3') fmt = v
} catch {
  /* storage blocked */
}

export const getRecFormat = () => fmt
export function setRecFormat(v: RecFormat) {
  fmt = v
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* storage blocked */
  }
  subs.forEach((f) => f())
}
export const useRecFormat = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => fmt,
  )

const can = (t: string) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)
const OPUS = ['audio/webm;codecs=opus', 'audio/webm']
const AAC = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4']

/** What this phone can record. MP3 works on every phone that can record at all. */
export const recSupport = (): Record<RecFormat, boolean> => ({
  opus: OPUS.some(can),
  aac: AAC.some(can),
  mp3: typeof AudioContext !== 'undefined',
})

export const RECORDER_TYPES: Record<'opus' | 'aac', string[]> = { opus: OPUS, aac: AAC }
export const EXTENSION: Record<RecFormat, string> = { opus: 'webm', aac: 'm4a', mp3: 'mp3' }
export const LABEL: Record<RecFormat, string> = { opus: 'Opus', aac: 'AAC', mp3: 'MP3' }

/** The format to really use: the chosen one, or the nearest one this phone can do. */
export function resolveRecFormat(want: RecFormat): RecFormat | null {
  const s = recSupport()
  if (s[want]) return want
  return (['aac', 'opus', 'mp3'] as RecFormat[]).find((f) => s[f]) ?? null
}
