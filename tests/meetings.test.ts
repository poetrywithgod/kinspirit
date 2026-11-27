// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { captureMeeting, meetingLink, pendingMeeting, clearPendingMeeting } from '../src/invite'

const ID = '3f2b8c1e-5a4d-4e7b-9c10-0123456789ab'

describe('meeting links', () => {
  beforeEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
  })

  it('builds a link from the meeting id', () => {
    expect(meetingLink(ID)).toBe(`${location.origin}/m/${ID}`)
  })

  it('remembers a meeting link and cleans the address bar', () => {
    history.replaceState(null, '', `/m/${ID}`)
    captureMeeting()
    expect(pendingMeeting()).toBe(ID)
    expect(location.pathname).toBe('/')
    clearPendingMeeting()
    expect(pendingMeeting()).toBeNull()
  })

  it('ignores addresses that are not a meeting id', () => {
    history.replaceState(null, '', '/m/not-a-meeting')
    captureMeeting()
    expect(pendingMeeting()).toBeNull()
    history.replaceState(null, '', `/m/${ID}/extra`)
    captureMeeting()
    expect(pendingMeeting()).toBeNull()
  })
})
