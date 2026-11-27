import { beforeEach, describe, expect, it, vi } from 'vitest'

const started: unknown[] = []
vi.mock('../src/api', () => {
  class ApiError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }
  return {
    ApiError,
    startChat: vi.fn(async (id: string) => {
      if (id === 'bad') throw new Error('boom')
      return 'chat-' + id
    }),
  }
})
vi.mock('../src/call', () => ({ startCall: vi.fn(async (t: unknown) => void started.push(t)) }))

const { openDirect, registerChatOpener, directTarget } = await import('../src/openChat')
const ada = { id: 'ada1', username: 'ada', avatar_url: null }

describe('openDirect', () => {
  beforeEach(() => {
    started.length = 0
    registerChatOpener(null)
  })

  it('opens a private chat with the person', async () => {
    const opened: unknown[] = []
    registerChatOpener((c) => opened.push(c))
    await openDirect(ada)
    expect(opened).toEqual([directTarget('chat-ada1', ada)])
    expect(started).toHaveLength(0)
  })

  it('starts the call after opening the chat', async () => {
    const opened: unknown[] = []
    registerChatOpener((c) => opened.push(c))
    await openDirect(ada, { call: true })
    expect(opened).toHaveLength(1)
    expect(started).toEqual([{ id: 'chat-ada1', name: '@ada', kind: 'direct' }])
  })

  it('turns a network failure into a readable error and calls nobody', async () => {
    await expect(openDirect({ ...ada, id: 'bad' }, { call: true })).rejects.toMatchObject({ code: 'network' })
    expect(started).toHaveLength(0)
  })
})
