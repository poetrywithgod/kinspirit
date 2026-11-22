// On-device storage (IndexedDB). One database per account, so two people sharing a phone never mix files.
import { myId } from './api'

export type AudioMeta = {
  id: string // the chat message id
  name: string
  from: string
  conversation_id: string
  size: number
  duration: number
  added_at: number
}

let dbp: Promise<IDBDatabase> | null = null
let dbUser = ''

function open(): Promise<IDBDatabase> {
  const uid = myId()
  if (!dbp || dbUser !== uid) {
    dbUser = uid
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(`kinspirit-${uid}`, 3)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs')
        if (!db.objectStoreNames.contains('voice')) db.createObjectStore('voice')
        if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        dbp = null
        reject(req.error)
      }
    })
  }
  return dbp
}

function run<T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => IDBRequest | null): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(stores, mode)
        const req = fn(tx)
        tx.oncomplete = () => resolve(req ? req.result : (undefined as T))
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export const listAudio = async (): Promise<AudioMeta[]> =>
  (await run<AudioMeta[]>(['audio'], 'readonly', (tx) => tx.objectStore('audio').getAll())).sort(
    (a, b) => b.added_at - a.added_at,
  )

export const getAudioBlob = (id: string) =>
  run<Blob | undefined>(['blobs'], 'readonly', (tx) => tx.objectStore('blobs').get(id))

export const saveAudio = (meta: AudioMeta, blob: Blob) =>
  run<unknown>(['audio', 'blobs'], 'readwrite', (tx) => {
    tx.objectStore('blobs').put(blob, meta.id)
    return tx.objectStore('audio').put(meta)
  })

export const renameAudio = async (id: string, name: string) => {
  const all = await listAudio()
  const m = all.find((x) => x.id === id)
  if (m) await run<unknown>(['audio'], 'readwrite', (tx) => tx.objectStore('audio').put({ ...m, name }))
}

export const deleteAudio = (id: string) =>
  run<unknown>(['audio', 'blobs'], 'readwrite', (tx) => {
    tx.objectStore('blobs').delete(id)
    return tx.objectStore('audio').delete(id)
  })

// Voice notes: kept on this device so they can be replayed offline.
export const getVoice = (id: string) => run<Blob | undefined>(['voice'], 'readonly', (tx) => tx.objectStore('voice').get(id))
export const saveVoice = (id: string, blob: Blob) =>
  run<unknown>(['voice'], 'readwrite', (tx) => tx.objectStore('voice').put(blob, id))
export const listVoiceIds = () => run<IDBValidKey[]>(['voice'], 'readonly', (tx) => tx.objectStore('voice').getAllKeys())

// ---- photos, videos and files kept on the device ----
export type MediaRecord = { id: string; name: string; type: string; size: number; added_at: number; blob: Blob }

export const saveMediaRecord = (rec: MediaRecord) =>
  run<unknown>(['media'], 'readwrite', (tx) => tx.objectStore('media').put(rec)).then(() => undefined)

export const getMediaRecord = (id: string) =>
  run<MediaRecord | undefined>(['media'], 'readonly', (tx) => tx.objectStore('media').get(id))

export const listMediaIds = () =>
  run<IDBValidKey[]>(['media'], 'readonly', (tx) => tx.objectStore('media').getAllKeys()).then((k) => k.map(String))

export const deleteMediaRecord = (id: string) =>
  run<unknown>(['media'], 'readwrite', (tx) => tx.objectStore('media').delete(id)).then(() => undefined)
