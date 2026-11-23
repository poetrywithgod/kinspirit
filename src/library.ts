// The audio library on this device: what was saved, what was removed, and downloading from the server.
import { useEffect, useState } from 'react'
import { ApiError, audioSaved, deleteServerFile, downloadAudioFile, myId, type Message } from './api'
import { deleteAudio, listAudio, renameAudio, saveAudio, type AudioMeta } from './localdb'
import { forget, renameInQueue } from './player'
import { withAudioType } from './mime'
import { dataSaver } from './dataSaver'

const subs = new Set<() => void>()
const notify = () => subs.forEach((f) => f())
export const onLibraryChange = (f: () => void) => {
  subs.add(f)
  return () => void subs.delete(f)
}

const goneKey = () => `kinspirit.audio.gone.${myId()}`
function goneSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(goneKey()) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
export function markGone(id: string) {
  try {
    const s = goneSet()
    s.add(id)
    localStorage.setItem(goneKey(), JSON.stringify([...s].slice(-1000)))
  } catch {
    // storage blocked
  }
}
export const isGone = (id: string) => goneSet().has(id)

export function probeDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const a = new Audio()
    const done = (d: number) => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(d) ? d : 0)
    }
    a.preload = 'metadata'
    a.onloadedmetadata = () => done(a.duration)
    a.onerror = () => done(0)
    setTimeout(() => done(0), 6000)
    a.src = url
  })
}

/** Saves a friend's audio file on this device, then clears it from the server. */
export async function downloadAudio(m: Message, from: string): Promise<void> {
  if (!m.file_path) throw new ApiError('gone', 'This file is no longer available.')
  try {
    const blob = withAudioType(await downloadAudioFile(m.file_path), m.file_name || m.body)
    const duration = await probeDuration(blob)
    await saveAudio(
      {
        id: m.id,
        name: m.file_name || m.body,
        from,
        conversation_id: m.conversation_id,
        size: blob.size,
        duration,
        added_at: Date.now(),
      },
      blob,
    )
  } catch (e) {
    if (e instanceof ApiError && e.code === 'gone') {
      markGone(m.id)
      notify()
    }
    throw e
  }
  notify()
  // The server copy goes only after every receiver has saved it (matters in groups).
  const path = m.file_path
  void audioSaved(m.id)
    .then((all) => (all ? deleteServerFile(path) : undefined))
    .catch(() => {})
}

/** Keeps the sender's own copy of an audio file, so it never becomes unavailable. */
export async function keepOwnAudio(id: string, file: File, conversation_id: string) {
  const blob = withAudioType(file, file.name)
  const duration = await probeDuration(blob)
  await saveAudio({ id, name: file.name, from: '', conversation_id, size: file.size, duration, added_at: Date.now() }, blob)
  notify()
}

const autoKey = (what = 'audio') => `kinspirit.autosave.${what}.${myId()}`
const readFlag = (what: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(autoKey(what))
    return v === null ? fallback : v === 'on'
  } catch {
    return fallback
  }
}
const writeFlag = (what: string, on: boolean) => {
  try {
    localStorage.setItem(autoKey(what), on ? 'on' : 'off')
  } catch {
    // storage blocked
  }
}
/** Photos are small after shrinking, so they are saved automatically unless switched off. */
export const autoSavePhotos = () => !dataSaver() && readFlag('photos', true)
export const setAutoSavePhotos = (on: boolean) => writeFlag('photos', on)
/** Videos and documents can be big, so they wait for a tap unless switched on. */
export const autoSaveBig = () => !dataSaver() && readFlag('big', false)
export const setAutoSaveBig = (on: boolean) => writeFlag('big', on)
/** Audio files (not voice notes) are saved automatically unless the person switches it off to save data. */
export const autoSaveAudio = (): boolean => {
  if (dataSaver()) return false
  try {
    return localStorage.getItem(autoKey()) !== 'off'
  } catch {
    return true
  }
}
export const setAutoSaveAudio = (on: boolean) => {
  try {
    localStorage.setItem(autoKey(), on ? 'on' : 'off')
  } catch {
    // storage blocked
  }
}

export async function removeAudio(id: string) {
  forget(id)
  await deleteAudio(id)
  markGone(id)
  notify()
}

export async function renameLocalAudio(id: string, name: string) {
  await renameAudio(id, name)
  renameInQueue(id, name)
  notify()
}

export function useLibrary(): AudioMeta[] | null {
  const [items, setItems] = useState<AudioMeta[] | null>(null)
  useEffect(() => {
    let dead = false
    const load = () =>
      listAudio()
        .then((r) => !dead && setItems(r))
        .catch(() => !dead && setItems([]))
    void load()
    const off = onLibraryChange(() => void load())
    return () => {
      dead = true
      off()
    }
  }, [])
  return items
}

/** Saves a file made on this device (like a call recording) into the Audio library. */
export async function addLocalAudio(meta: AudioMeta, blob: Blob) {
  await saveAudio(meta, blob)
  notify()
}
