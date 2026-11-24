// Receiving files shared to Kinspirit from the phone's Files, Music or Gallery apps (the "Share" menu).
// The service worker (src/sw.js) parks the shared files in a cache; the app picks them up here.
const CACHE = 'kinspirit-share'

export const hasShared = () => new URLSearchParams(location.search).has('share')

export async function takeShared(): Promise<File[]> {
  try {
    const cache = await caches.open(CACHE)
    const keys = await cache.keys()
    const out: File[] = []
    for (const k of keys) {
      const res = await cache.match(k)
      if (!res) continue
      const name = decodeURIComponent(res.headers.get('X-Name') ?? 'shared-file')
      const blob = await res.blob()
      out.push(new File([blob], name, { type: res.headers.get('Content-Type') ?? blob.type }))
      await cache.delete(k)
    }
    return out
  } catch {
    return []
  }
}
