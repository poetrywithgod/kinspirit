import { dataSaver, POLL_FACTOR } from './dataSaver'
import { useEffect, useRef } from 'react'
import { liveStatus, onPoke } from './realtime'

/** Runs `fn` now and then every `ms` while the page is visible. Errors are left to `fn` to handle. */
const LIVE_SLOWDOWN = 5 // while live updates work, the timer is only a safety net

/** `live`: also run at once when the server reports a change, and check less often while live updates work. */
export function usePolling(fn: () => Promise<void> | void, ms: number, enabled = true, fixed = false, live = false) {
  const latest = useRef(fn)
  useEffect(() => {
    latest.current = fn
  })

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let running = false
    let again = false // a change was reported while a refresh was already running
    let timer: number | undefined

    const tick = async () => {
      if (stopped) return
      if (running) {
        again = true
        return
      }
      running = true
      if (document.visibilityState === 'visible') {
        try {
          await latest.current()
        } catch {
          // the caller shows its own errors
        }
      }
      running = false
      if (!stopped && again) {
        again = false
        timer = window.setTimeout(() => void tick(), 0)
      } else if (!stopped) {
        const base = live && liveStatus() === 'live' ? ms * LIVE_SLOWDOWN : ms
        timer = window.setTimeout(() => void tick(), fixed || !dataSaver() ? base : base * POLL_FACTOR)
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer)
        void tick()
      }
    }
    void tick()
    document.addEventListener('visibilitychange', onVisible)
    const offPoke = live
      ? onPoke(() => {
          window.clearTimeout(timer)
          void tick()
        })
      : undefined
    return () => {
      offPoke?.()
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ms, enabled])
}
