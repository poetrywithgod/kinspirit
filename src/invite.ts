// Profile links: https://kinspirit.vercel.app/u/<username>
const KEY = 'kinspirit.invite'
const NAME = /^[a-z0-9_]{3,20}$/

export const profileLink = (username: string) => `${location.origin}/u/${username}`

/** Called once at start: remembers who the link was for, so it survives signing up or logging in. */
export function captureInvite(): void {
  try {
    const m = location.pathname.match(/^\/u\/([A-Za-z0-9_]+)\/?$/)
    const name = (m?.[1] ?? new URLSearchParams(location.search).get('u') ?? '').toLowerCase()
    if (NAME.test(name)) {
      localStorage.setItem(KEY, name)
      history.replaceState(null, '', '/')
    }
  } catch {
    /* storage blocked: the link just opens the app */
  }
}

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearInvite(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export async function shareProfile(username: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = profileLink(username)
  const text = `Chat with me on Kinspirit: ${url}`
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Kinspirit', text, url })
      return 'shared'
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed'
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

// ---- meeting links: https://kinspirit.vercel.app/m/<meeting id> ----
const MKEY = 'kinspirit.meeting'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const meetingLink = (id: string) => `${location.origin}/m/${id}`

/** Called once at start: remembers which meeting the link was for, so it survives signing up or logging in. */
export function captureMeeting(): void {
  try {
    const m = location.pathname.match(/^\/m\/([0-9a-fA-F-]{36})\/?$/)
    if (m && UUID.test(m[1])) {
      localStorage.setItem(MKEY, m[1].toLowerCase())
      history.replaceState(null, '', '/')
    }
  } catch {
    /* storage blocked: the link just opens the app */
  }
}
export function pendingMeeting(): string | null {
  try {
    return localStorage.getItem(MKEY)
  } catch {
    return null
  }
}
export function clearPendingMeeting(): void {
  try {
    localStorage.removeItem(MKEY)
  } catch {
    /* ignore */
  }
}

export async function shareMeeting(title: string, whenText: string, id: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = meetingLink(id)
  const text = `Join my Kinspirit meeting "${title}" (${whenText}): ${url}`
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url })
      return 'shared'
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed'
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
