import { dataSaver, POLL_FACTOR } from './dataSaver'
import { useEffect, useRef } from 'react'

/** Runs `fn` now and then every `ms` while the page is visible. Errors are left to `fn` to handle. */
export function usePolling(fn: () => Promise<void> | void, ms: number, enabled = true, fixed = false) {
  const latest = useRef(fn)
  useEffect(() => {
    latest.current = fn
  })

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let running = false
    let timer: number | undefined

    const tick = async () => {
      if (stopped || running) return
      running = true
      if (document.visibilityState === 'visible') {
        try {
          await latest.current()
        } catch {
          // the caller shows its own errors
        }
      }
      running = false
      if (!stopped) timer = window.setTimeout(() => void tick(), fixed || !dataSaver() ? ms : ms * POLL_FACTOR)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer)
        void tick()
      }
    }
    void tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ms, enabled])
}
