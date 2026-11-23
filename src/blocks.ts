import { useSyncExternalStore } from 'react'
import { blockUserRpc, myBlocks, unblockUserRpc, type Person } from './api'

/** The people I have blocked, kept in memory and mirrored to the server. */
let list: Person[] = []
let loaded = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export async function refreshBlocks(): Promise<void> {
  try {
    list = await myBlocks()
    loaded = true
    emit()
  } catch {
    /* keep what we have */
  }
}

export async function blockPerson(p: Person): Promise<void> {
  await blockUserRpc(p.id)
  if (!list.some((x) => x.id === p.id)) list = [p, ...list]
  emit()
}

export async function unblockPerson(id: string): Promise<void> {
  await unblockUserRpc(id)
  list = list.filter((x) => x.id !== id)
  emit()
}

export function useBlocks(): { blocked: Person[]; loaded: boolean; isBlocked: (id?: string) => boolean } {
  const snap = useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => list,
  )
  return { blocked: snap, loaded, isBlocked: (id) => !!id && snap.some((x) => x.id === id) }
}

export function clearBlocks() {
  list = []
  loaded = false
  emit()
}
