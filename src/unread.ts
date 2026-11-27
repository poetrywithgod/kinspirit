import { useSyncExternalStore } from 'react'
import type { Conversation } from './api'

/**
 * The chat list, shared by the whole app: the Chats tab shows it and the bottom bar adds up the unread
 * messages. One refresh loop (in AppShell) fills it, so the list is never fetched twice.
 */
type State = { rows: Conversation[] | null; error: string }
let state: State = { rows: null, error: '' }
const subs = new Set<() => void>()
let refresher: (() => void) | null = null

const emit = () => subs.forEach((f) => f())
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => void subs.delete(f)
}

export function publishConversations(rows: Conversation[]) {
  state = { rows, error: '' }
  emit()
}
export function publishConversationsError(error: string) {
  state = { ...state, error }
  emit()
}
export function clearConversations() {
  state = { rows: null, error: '' }
  emit()
}

/** I just read this chat: drop its counter right away instead of waiting for the next refresh. */
export function markChatReadLocally(cid: string) {
  if (!state.rows?.some((c) => c.id === cid && (c.unread > 0 || c.mentioned))) return
  state = { ...state, rows: state.rows.map((c) => (c.id === cid ? { ...c, unread: 0, mentioned: false } : c)) }
  emit()
}

export const setConversationsRefresher = (fn: (() => void) | null) => {
  refresher = fn
}
export const refreshConversations = () => refresher?.()

export const useConversationState = (): State => useSyncExternalStore(subscribe, () => state)

let lastTotal = 0
/** All unread messages across my chats. */
export const totalOf = () => {
  const rows = state.rows
  if (!rows) return lastTotal
  lastTotal = rows.reduce((n, c) => n + Math.max(0, c.unread), 0)
  return lastTotal
}
/** All unread messages across my chats (for the Chats icon). */
export const useUnreadTotal = (): number => useSyncExternalStore(subscribe, totalOf)
