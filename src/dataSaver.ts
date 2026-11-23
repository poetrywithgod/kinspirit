import { useSyncExternalStore } from 'react'

/** Data saver: less automatic downloading, smaller uploads, calmer background checking. */
const KEY = 'kinspirit.datasaver'
const subs = new Set<() => void>()
let on = false
try {
  on = localStorage.getItem(KEY) === 'on'
} catch {
  /* storage blocked */
}

export const dataSaver = () => on

export function setDataSaver(v: boolean) {
  on = v
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off')
  } catch {
    /* storage blocked */
  }
  subs.forEach((f) => f())
}

export const useDataSaver = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => on,
  )

/** How much slower background checks run when saving data. */
export const POLL_FACTOR = 3
