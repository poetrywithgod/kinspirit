import { beforeEach, describe, expect, it } from 'vitest'
import type { Conversation } from '../src/api'
import { clearConversations, markChatReadLocally, publishConversations, totalOf } from '../src/unread'

const chat = (id: string, unread: number, mentioned = false) => ({ id, unread, mentioned }) as unknown as Conversation

describe('unread counter on the Chats icon', () => {
  beforeEach(() => clearConversations())

  it('adds up the unread messages of all chats', () => {
    publishConversations([chat('a', 2), chat('b', 0), chat('c', 5)])
    expect(totalOf()).toBe(7)
  })
  it('ignores bad (negative) numbers', () => {
    publishConversations([chat('a', -3), chat('b', 4)])
    expect(totalOf()).toBe(4)
  })
  it('drops a chat to zero as soon as it is read', () => {
    publishConversations([chat('a', 2, true), chat('b', 5)])
    markChatReadLocally('a')
    expect(totalOf()).toBe(5)
  })
  it('keeps the last number while the list reloads', () => {
    publishConversations([chat('a', 3)])
    expect(totalOf()).toBe(3)
    clearConversations()
    expect(totalOf()).toBe(3)
  })
})
