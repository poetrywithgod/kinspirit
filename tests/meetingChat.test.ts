import { describe, expect, it } from 'vitest'
import { mergeMessages } from '../src/meetingChat'
import type { MeetingMessage } from '../src/api'

const msg = (id: string, at: string): MeetingMessage => ({ id, sender_id: 'u', username: 'ada', avatar_url: null, body: id, created_at: at })

describe('meeting chat merge', () => {
  it('adds new messages in time order', () => {
    const a = [msg('1', '2026-11-27T10:00:00Z')]
    const out = mergeMessages(a, [msg('3', '2026-11-27T10:02:00Z'), msg('2', '2026-11-27T10:01:00Z')])
    expect(out.map((m) => m.id)).toEqual(['1', '2', '3'])
  })
  it('skips messages it already has (polls overlap)', () => {
    const a = [msg('1', '2026-11-27T10:00:00Z')]
    expect(mergeMessages(a, [msg('1', '2026-11-27T10:00:00Z')])).toBe(a)
  })
  it('keeps the same list when nothing is new', () => {
    const a = [msg('1', '2026-11-27T10:00:00Z')]
    expect(mergeMessages(a, [])).toBe(a)
  })
})
