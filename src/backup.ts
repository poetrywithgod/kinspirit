/**
 * Backup and restore of the files saved on this phone (audio, voice notes, photos, videos, documents).
 * Text messages stay on Kinspirit's server, so only the device's own files need a backup.
 *
 * The backup is one file the person keeps wherever they like (Downloads, Google Drive, a computer).
 * Layout: "KINBKP01" + 4 bytes manifest length + manifest (JSON) + every file one after the other.
 * The file is assembled from Blob pieces, so big libraries do not have to fit in memory.
 */
import { myId } from './api'
import {
  getAudioBlob,
  getMediaRecord,
  getVoice,
  listAudio,
  listMediaIds,
  listVoiceIds,
  saveAudio,
  saveMediaRecord,
  saveVoice,
  type AudioMeta,
} from './localdb'
import { currentSession } from './supabase'

const MAGIC = 'KINBKP01'

type Entry =
  | { store: 'audio'; id: string; size: number; meta: AudioMeta; type: string }
  | { store: 'voice'; id: string; size: number; type: string }
  | { store: 'media'; id: string; size: number; type: string; name: string; added_at: number }

type Manifest = { v: 1; app: 'kinspirit'; user: string; username: string; created: number; entries: Entry[] }

export type Counts = { audio: number; voice: number; media: number }

export async function countSaved(): Promise<Counts> {
  const [a, v, m] = await Promise.all([listAudio(), listVoiceIds(), listMediaIds()])
  return { audio: a.length, voice: v.length, media: m.length }
}

/** Builds the backup file from everything saved on this phone. */
export async function createBackup(onProgress: (done: number, total: number) => void): Promise<{ blob: Blob; count: number }> {
  const [audio, voiceIds, mediaIds] = await Promise.all([listAudio(), listVoiceIds(), listMediaIds()])
  const total = audio.length + voiceIds.length + mediaIds.length
  const entries: Entry[] = []
  const parts: Blob[] = []
  let done = 0
  const step = () => onProgress(++done, total)

  for (const meta of audio) {
    const b = await getAudioBlob(meta.id)
    if (b) {
      entries.push({ store: 'audio', id: meta.id, size: b.size, meta, type: b.type })
      parts.push(b)
    }
    step()
  }
  for (const key of voiceIds) {
    const id = String(key)
    const b = await getVoice(id)
    if (b) {
      entries.push({ store: 'voice', id, size: b.size, type: b.type })
      parts.push(b)
    }
    step()
  }
  for (const id of mediaIds) {
    const r = await getMediaRecord(id)
    if (r?.blob) {
      entries.push({ store: 'media', id, size: r.blob.size, type: r.type || r.blob.type, name: r.name, added_at: r.added_at })
      parts.push(r.blob)
    }
    step()
  }

  const manifest: Manifest = { v: 1, app: 'kinspirit', user: myId(), username: currentSession()?.user.email ?? '', created: Date.now(), entries }
  const json = new TextEncoder().encode(JSON.stringify(manifest))
  const head = new Uint8Array(MAGIC.length + 4)
  head.set(new TextEncoder().encode(MAGIC), 0)
  new DataView(head.buffer).setUint32(MAGIC.length, json.length)
  return { blob: new Blob([head, json, ...parts], { type: 'application/octet-stream' }), count: entries.length }
}

export type RestoreResult = { restored: number; skipped: number }

/** Puts the files of a backup back on this phone. Files that are already here are left alone. */
export async function restoreBackup(file: File, onProgress: (done: number, total: number) => void): Promise<RestoreResult> {
  const head = new Uint8Array(await file.slice(0, MAGIC.length + 4).arrayBuffer())
  if (new TextDecoder().decode(head.slice(0, MAGIC.length)) !== MAGIC) throw new Error('That is not a Kinspirit backup file.')
  const mlen = new DataView(head.buffer).getUint32(MAGIC.length)
  if (mlen <= 0 || mlen > 50_000_000) throw new Error('This backup file looks damaged.')
  let manifest: Manifest
  try {
    manifest = JSON.parse(new TextDecoder().decode(await file.slice(MAGIC.length + 4, MAGIC.length + 4 + mlen).arrayBuffer())) as Manifest
  } catch {
    throw new Error('This backup file looks damaged.')
  }
  if (manifest.app !== 'kinspirit' || manifest.v !== 1 || !Array.isArray(manifest.entries)) throw new Error('That is not a Kinspirit backup file.')
  if (manifest.user !== myId()) throw new Error('This backup belongs to a different account. Log in with that account to restore it.')

  const [audio, voiceIds, mediaIds] = await Promise.all([listAudio(), listVoiceIds(), listMediaIds()])
  const have = {
    audio: new Set(audio.map((a) => a.id)),
    voice: new Set(voiceIds.map(String)),
    media: new Set(mediaIds),
  }
  let offset = MAGIC.length + 4 + mlen
  let restored = 0
  let skipped = 0
  let done = 0
  for (const e of manifest.entries) {
    const start = offset
    offset += e.size
    if (offset > file.size) throw new Error('This backup file is incomplete. Try saving it again.')
    if (have[e.store].has(e.id)) {
      skipped++
    } else {
      const blob = file.slice(start, offset, e.type || undefined)
      if (e.store === 'audio') await saveAudio(e.meta, blob)
      else if (e.store === 'voice') await saveVoice(e.id, blob)
      else await saveMediaRecord({ id: e.id, name: e.name, type: e.type, size: e.size, added_at: e.added_at, blob })
      restored++
    }
    onProgress(++done, manifest.entries.length)
  }
  return { restored, skipped }
}
