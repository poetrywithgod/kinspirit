// Lets any screen (a profile, a group member list…) open a private chat with someone, or call them.
// The app shell registers how a chat is shown; everyone else just asks.
import { ApiError, startChat, type Person } from './api'
import { startCall } from './call'
import type { ChatTarget } from './app/ChatsTab'

type Opener = (chat: ChatTarget) => void
let opener: Opener | null = null

export function registerChatOpener(fn: Opener | null) {
  opener = fn
}

export const directTarget = (id: string, p: Person): ChatTarget => ({
  id,
  name: `@${p.username}`,
  avatar: p.avatar_url,
  kind: 'direct',
  userId: p.id,
})

/** Opens my private chat with `p` (made first if there is none). With `call`, the call starts straight away. */
export async function openDirect(p: Person, opts: { call?: boolean } = {}): Promise<void> {
  let id: string
  try {
    id = await startChat(p.id)
  } catch (e) {
    throw e instanceof ApiError ? e : new ApiError('network', 'Could not open the chat. Check your internet and try again.')
  }
  const target = directTarget(id, p)
  opener?.(target)
  if (opts.call) void startCall({ id, name: target.name, kind: 'direct' })
}
