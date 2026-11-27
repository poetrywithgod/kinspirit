// Forwarding a message into another chat. Photos, videos, files, audio and voice notes live on the phones,
// so the copy that is on THIS phone is sent again to the other chat (nothing is copied on the server).
import { ApiError, MAX_MEDIA_BYTES, downloadAudioFile, sendAudio, sendMedia, sendMessage, sendVoice, type Message } from './api'
import { keepOwnAudio } from './library'
import { getAudioBlob, getVoice, saveVoice } from './localdb'
import { getMediaBlob, keepOwnMedia, saveReceivedMedia } from './mediaStore'

export const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
      )

/** Calls and deleted messages cannot be forwarded. */
export const canForward = (m: Message) => !m.deleted_at && m.kind !== 'call' && m.status !== 'sending' && m.status !== 'failed'

const GONE = 'That file is not on this phone and is no longer on the server, so it cannot be forwarded.'

/** The file of a message: my copy on this phone, or (if the server still has it) a fresh download. */
async function fileOf(m: Message): Promise<Blob> {
  let blob: Blob | undefined
  if (m.kind === 'voice') blob = await getVoice(m.id).catch(() => undefined)
  else if (m.kind === 'audio') blob = await getAudioBlob(m.id).catch(() => undefined)
  else blob = await getMediaBlob(m.id)
  if (!blob && m.file_path) {
    try {
      blob = m.kind === 'voice' || m.kind === 'audio' ? await downloadAudioFile(m.file_path) : await saveReceivedMedia(m)
    } catch {
      blob = undefined
    }
  }
  if (!blob) throw new ApiError('gone', GONE)
  if (blob.size > MAX_MEDIA_BYTES) throw new ApiError('too_big', 'That file is too big to forward (50 MB at most).')
  return blob
}

/** Sends a copy of `m` into chat `cid`. Throws an ApiError the person can read. */
export async function forwardOne(m: Message, cid: string): Promise<void> {
  const id = newId()
  const kind = m.kind ?? 'text'
  if (kind === 'text' || kind === 'sticker') {
    return sendMessage({ id, conversation_id: cid, body: m.body, ...(kind === 'sticker' ? { kind: 'sticker' as const } : {}) })
  }
  const blob = await fileOf(m)
  const name = m.file_name || m.body || 'File'
  const type = m.file_type || blob.type || 'application/octet-stream'
  if (kind === 'voice') {
    const wave = m.body.startsWith('Voice note') ? m.body.slice('Voice note'.length) : ''
    await sendVoice({ id, conversation_id: cid, blob, seconds: m.duration ?? 1, ...(wave ? { wave } : {}) })
    await saveVoice(id, blob).catch(() => undefined)
    return
  }
  if (kind === 'audio') {
    const file = new File([blob], name, { type })
    await sendAudio({ id, conversation_id: cid, file })
    await keepOwnAudio(id, file, cid).catch(() => undefined)
    return
  }
  await sendMedia({
    id,
    conversation_id: cid,
    kind: kind === 'image' || kind === 'video' ? kind : 'file',
    file: blob,
    name,
    type,
    ...(m.media_w ? { width: m.media_w, height: m.media_h ?? undefined } : {}),
    ...(m.duration ? { duration: m.duration } : {}),
  })
  await keepOwnMedia(id, blob, name, type).catch(() => undefined)
}

export const previewOf = (m: Message): string => {
  switch (m.kind) {
    case 'sticker':
      return m.body
    case 'voice':
      return '🎤 Voice note'
    case 'audio':
      return `🎵 ${m.file_name || m.body}`
    case 'image':
      return `📷 ${m.file_name || 'Photo'}`
    case 'video':
      return `🎥 ${m.file_name || 'Video'}`
    case 'file':
      return `📄 ${m.file_name || m.body}`
    default:
      return m.body.slice(0, 140)
  }
}
