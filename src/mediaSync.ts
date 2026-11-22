// Saves incoming media onto this phone as soon as it arrives, without waiting for a tap.
// Once a file lives on the device it stays there until the person deletes it, even after the
// server has cleared its own copy. New kinds of media (pictures, video, documents) plug in here.
import { ApiError, listIncomingMedia, usernames, type Message } from './api'
import { autoSaveAudio, autoSaveBig, autoSavePhotos, downloadAudio, isGone, markGone } from './library'
import { getVoice, listAudio, listMediaIds } from './localdb'
import { saveReceivedMedia } from './mediaStore'
import { saveReceivedVoice } from './voice'

let running = false
const failures = new Map<string, number>() // message id -> failed attempts this session

async function saved(m: Message): Promise<boolean> {
  if (m.kind === 'voice') return !!(await getVoice(m.id).catch(() => undefined))
  return (await listAudio().catch(() => [])).some((x) => x.id === m.id)
}

export async function syncIncomingMedia(): Promise<void> {
  if (running) return
  running = true
  try {
    const rows = await listIncomingMedia()
    const names = await usernames([...new Set(rows.map((r) => r.sender_id))]).catch(() => new Map<string, string>())
    const audioIds = new Set((await listAudio().catch(() => [])).map((x) => x.id))
    const mediaIds = new Set(await listMediaIds().catch(() => [] as string[]))
    for (const m of rows) {
      if (isGone(m.id) || (failures.get(m.id) ?? 0) >= 3) continue
      if (m.kind === 'audio' && (audioIds.has(m.id) || !autoSaveAudio())) continue
      if (m.kind === 'image' && (mediaIds.has(m.id) || !autoSavePhotos())) continue
      if ((m.kind === 'video' || m.kind === 'file') && (mediaIds.has(m.id) || !autoSaveBig())) continue
      if (m.kind === 'voice' && (await saved(m))) continue
      try {
        if (m.kind === 'voice') await saveReceivedVoice(m)
        else if (m.kind === 'image' || m.kind === 'video' || m.kind === 'file') await saveReceivedMedia(m)
        else await downloadAudio(m, names.get(m.sender_id) ?? 'a friend')
      } catch (e) {
        if (e instanceof ApiError && e.code === 'gone') markGone(m.id)
        else failures.set(m.id, (failures.get(m.id) ?? 0) + 1)
        if (e instanceof ApiError && (e.code === 'network' || e.code === 'no_session')) break
      }
    }
  } finally {
    running = false
  }
}
