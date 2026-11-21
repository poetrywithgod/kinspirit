import { useCallback, useEffect, useState } from 'react'

export function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((l) => l - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  const restart = useCallback(() => setLeft(seconds), [seconds])
  return [left, restart] as const
}
