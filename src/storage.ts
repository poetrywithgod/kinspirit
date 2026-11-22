// Asks the browser to treat Kinspirit's saved files as permanent, so they are not cleared when the phone runs low on space.
import { listAudio, listVoiceIds } from './localdb'

export type StorageInfo = { persisted: boolean | null; used: number; files: number; installed: boolean }

export async function protectStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export async function storageInfo(): Promise<StorageInfo> {
  let persisted: boolean | null = null
  let used = 0
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? null
    used = (await navigator.storage?.estimate?.())?.usage ?? 0
  } catch {
    // not supported here
  }
  const [a, v] = await Promise.all([listAudio().catch(() => []), listVoiceIds().catch(() => [])])
  const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return { persisted, used, files: a.length + v.length, installed }
}
