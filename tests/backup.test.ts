import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let uid = 'user-1'
vi.mock('../src/api', () => ({ myId: () => uid }))
vi.mock('../src/supabase', () => ({ currentSession: () => ({ user: { email: 't@x.com' } }) }))

const { createBackup, restoreBackup, countSaved } = await import('../src/backup')
const { saveAudio, saveVoice, saveMediaRecord } = await import('../src/localdb')

const bytes = (n: number, v: number, type: string) => new Blob([new Uint8Array(n).fill(v)], { type })
let n = 0
// Empties everything saved on the "phone" (the open database stays, like a freshly reset app).
async function wipe() {
  const dbs = await indexedDB.databases()
  if (!dbs.some((d) => d.name === `kinspirit-${uid}`)) return
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const q = indexedDB.open(`kinspirit-${uid}`)
    q.onsuccess = () => res(q.result)
    q.onerror = () => rej(q.error)
  })
  const names = [...db.objectStoreNames]
  const tx = db.transaction(names, 'readwrite')
  names.forEach((s) => tx.objectStore(s).clear())
  await new Promise<void>((res) => (tx.oncomplete = () => res()))
  db.close()
}

async function seed() {
  await saveAudio({ id: 'a1', name: 'song.mp3', from: 'u2', conversation_id: 'c1', size: 1000, duration: 5, added_at: 1 } as never, bytes(1000, 1, 'audio/mpeg'))
  await saveVoice('v1', bytes(500, 2, 'audio/webm'))
  await saveMediaRecord({ id: 'm1', name: 'pic.jpg', type: 'image/jpeg', size: 300, added_at: 2, blob: bytes(300, 3, 'image/jpeg') } as never)
}

describe('backup and restore', () => {
  beforeEach(async () => {
    uid = `user-${++n}` // a fresh phone for every test
  })

  it('brings every saved file back after the phone was wiped', async () => {
    await seed()
    expect(await countSaved()).toEqual({ audio: 1, voice: 1, media: 1 })
    const { blob, count } = await createBackup(() => {})
    expect(count).toBe(3)
    await wipe()
    expect(await countSaved()).toEqual({ audio: 0, voice: 0, media: 0 })

    const r = await restoreBackup(new File([blob], 'x.kinbak'), () => {})
    expect(r).toEqual({ restored: 3, skipped: 0 })
    expect(await countSaved()).toEqual({ audio: 1, voice: 1, media: 1 })
  })

  it('leaves files that are already on the phone alone', async () => {
    await seed()
    const { blob } = await createBackup(() => {})
    const r = await restoreBackup(new File([blob], 'x.kinbak'), () => {})
    expect(r).toEqual({ restored: 0, skipped: 3 })
  })

  it('refuses a backup that belongs to another account', async () => {
    await seed()
    const { blob } = await createBackup(() => {})
    uid = 'someone-else'
    await expect(restoreBackup(new File([blob], 'x.kinbak'), () => {})).rejects.toThrow(/different account/)
  })

  it('refuses files that are not backups', async () => {
    await expect(restoreBackup(new File([new Uint8Array(50)], 'junk'), () => {})).rejects.toThrow(/not a Kinspirit backup/)
  })

  it('refuses a backup that was cut short', async () => {
    await seed()
    const { blob } = await createBackup(() => {})
    await wipe()
    await expect(restoreBackup(new File([blob.slice(0, blob.size - 100)], 'cut'), () => {})).rejects.toThrow(/incomplete/)
  })

  it('says so when there is nothing to back up', async () => {
    const { count } = await createBackup(() => {})
    expect(count).toBe(0)
  })
})
