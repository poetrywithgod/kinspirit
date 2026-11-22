const DAY = 24 * 60 * 60 * 1000

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** "14:05" today, "Mon" this week, otherwise "12 Nov". */
export function shortWhen(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return clock(iso)
  if (now.getTime() - d.getTime() < 6 * DAY) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export function fmtDur(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00'
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
