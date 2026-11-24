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
