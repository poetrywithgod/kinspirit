// Photos, videos and files kept on this device. Once saved they stay until the person deletes them.
import { useSyncExternalStore } from 'react'
import { audioSaved, deleteServerFile, downloadAudioFile, myId, type Message } from './api'
import { getMediaRecord, listMediaIds, saveMediaRecord } from './localdb'

let ids = new Set<string>()
let started = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

function start() {
  if (started) return
  started = true
  void listMediaIds()
    .then((l) => {
      ids = new Set([...ids, ...l])
      emit()
    })
    .catch(() => undefined)
}

/** Which photos, videos and files are on this phone (by message id). */
export const useMediaIds = (): Set<string> =>
  useSyncExternalStore(
    (f) => {
      start()
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => ids,
  )

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('kinspirit-media') : null
if (channel) {
  channel.onmessage = (e: MessageEvent<{ uid: string; id: string }>) => {
    if (e.data?.uid !== myId() || ids.has(e.data.id)) return
    ids = new Set(ids).add(e.data.id)
    emit()
  }
}

const remember = (id: string) => {
  ids = new Set(ids).add(id)
  emit()
  try {
    channel?.postMessage({ uid: myId(), id })
  } catch {
    // another window will catch up on its next start
  }
}

export const getMediaBlob = async (id: string): Promise<Blob | undefined> => (await getMediaRecord(id).catch(() => undefined))?.blob

/** The sender keeps their own copy, so a sent photo never becomes unavailable. */
export async function keepOwnMedia(id: string, blob: Blob, name: string, type: string) {
  await saveMediaRecord({ id, name, type, size: blob.size, added_at: Date.now(), blob })
  remember(id)
}

const inflight = new Map<string, Promise<Blob>>()

/** Downloads a received photo, video or file onto this phone, with its own name and format. */
export function saveReceivedMedia(m: Message): Promise<Blob> {
  const running = inflight.get(m.id)
  if (running) return running
  const job = (async () => {
    if (!m.file_path) throw new Error('gone')
    const raw = await downloadAudioFile(m.file_path)
    const type = m.file_type || raw.type || 'application/octet-stream'
    const blob = raw.type === type ? raw : new Blob([raw], { type })
    await saveMediaRecord({ id: m.id, name: m.file_name || m.body, type, size: blob.size, added_at: Date.now(), blob })
    remember(m.id)
    const path = m.file_path
    void audioSaved(m.id)
      .then((all) => (all ? deleteServerFile(path) : undefined))
      .catch(() => undefined)
    return blob
  })().finally(() => inflight.delete(m.id))
  inflight.set(m.id, job)
  return job
}

/** Hands a saved file to the person under its original name. */
export function downloadToDevice(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}
