import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '../src/api'

const calls: { fn: string; arg: unknown }[] = []
const local = new Map<string, Blob>()

vi.mock('../src/api', () => {
  class ApiError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }
  const rec = (fn: string) => async (arg: unknown) => void calls.push({ fn, arg })
  return {
    ApiError,
    MAX_MEDIA_BYTES: 50 * 1024 * 1024,
    downloadAudioFile: vi.fn(async () => {
      throw new ApiError('gone', 'gone')
    }),
    sendMessage: rec('sendMessage'),
    sendMedia: rec('sendMedia'),
    sendAudio: rec('sendAudio'),
    sendVoice: rec('sendVoice'),
  }
})
vi.mock('../src/mediaStore', () => ({
  getMediaBlob: async (id: string) => local.get('media:' + id),
  keepOwnMedia: async (id: string) => void calls.push({ fn: 'keepOwnMedia', arg: id }),
  saveReceivedMedia: async () => {
    throw new Error('gone')
  },
}))
vi.mock('../src/localdb', () => ({
  getVoice: async (id: string) => local.get('voice:' + id),
  getAudioBlob: async (id: string) => local.get('audio:' + id),
  saveVoice: async (id: string) => void calls.push({ fn: 'saveVoice', arg: id }),
}))
vi.mock('../src/library', () => ({ keepOwnAudio: async (id: string) => void calls.push({ fn: 'keepOwnAudio', arg: id }) }))

const { forwardOne, canForward, previewOf } = await import('../src/forwardMedia')

const msg = (o: Partial<Message>): Message => ({ id: 'm1', conversation_id: 'c1', sender_id: 'u', body: 'hi', created_at: '2026-11-27T10:00:00Z', ...o })

describe('forwarding', () => {
  beforeEach(() => {
    calls.length = 0
    local.clear()
  })

  it('forwards text and stickers as messages', async () => {
    await forwardOne(msg({ body: 'hello' }), 'c2')
    await forwardOne(msg({ kind: 'sticker', body: '🙂' }), 'c2')
    expect(calls.map((c) => c.fn)).toEqual(['sendMessage', 'sendMessage'])
    expect((calls[1].arg as { kind: string }).kind).toBe('sticker')
  })

  it('sends the photo that is on this phone and keeps a copy for the sender', async () => {
    local.set('media:m1', new Blob(['x'], { type: 'image/jpeg' }))
    await forwardOne(msg({ kind: 'image', file_name: 'a.jpg', file_type: 'image/jpeg', media_w: 10, media_h: 20 }), 'c2')
    expect(calls.map((c) => c.fn)).toEqual(['sendMedia', 'keepOwnMedia'])
    const a = calls[0].arg as { kind: string; name: string; width: number; height: number; conversation_id: string }
    expect([a.kind, a.name, a.width, a.height, a.conversation_id]).toEqual(['image', 'a.jpg', 10, 20, 'c2'])
  })

  it('keeps the loudness picture of a voice note', async () => {
    local.set('voice:m1', new Blob(['v'], { type: 'audio/mp4' }))
    await forwardOne(msg({ kind: 'voice', body: 'Voice note~abc', duration: 7 }), 'c2')
    expect(calls.map((c) => c.fn)).toEqual(['sendVoice', 'saveVoice'])
    expect(calls[0].arg).toMatchObject({ wave: '~abc', seconds: 7 })
  })

  it('sends saved audio files as audio', async () => {
    local.set('audio:m1', new Blob(['a'], { type: 'audio/mpeg' }))
    await forwardOne(msg({ kind: 'audio', file_name: 'song.mp3', body: 'song.mp3' }), 'c2')
    expect(calls.map((c) => c.fn)).toEqual(['sendAudio', 'keepOwnAudio'])
  })

  it('says so when the file is gone from the phone and the server', async () => {
    await expect(forwardOne(msg({ kind: 'file', file_name: 'x.pdf', file_path: 'p' }), 'c2')).rejects.toMatchObject({ code: 'gone' })
    expect(calls).toHaveLength(0)
  })

  it('knows what cannot be forwarded', () => {
    expect(canForward(msg({}))).toBe(true)
    expect(canForward(msg({ kind: 'call' }))).toBe(false)
    expect(canForward(msg({ deleted_at: '2026-11-27T10:00:00Z' }))).toBe(false)
    expect(canForward(msg({ status: 'failed' }))).toBe(false)
  })

  it('previews each kind', () => {
    expect(previewOf(msg({ kind: 'voice' }))).toContain('Voice note')
    expect(previewOf(msg({ kind: 'image', file_name: 'a.jpg' }))).toContain('a.jpg')
  })
})
