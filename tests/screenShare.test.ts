// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canShareScreen } from '../src/call'

const setUA = (ua: string, display: boolean) => {
  vi.stubGlobal('navigator', { userAgent: ua, mediaDevices: display ? { getDisplayMedia: () => Promise.resolve() } : {} })
}

describe('screen sharing support', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('is on for a desktop browser', () => {
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', true)
    expect(canShareScreen()).toBe(true)
  })
  it('is off on Android and iPhone (they can only watch)', () => {
    setUA('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile', true)
    expect(canShareScreen()).toBe(false)
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari', true)
    expect(canShareScreen()).toBe(false)
  })
  it('is off when the browser has no screen capture', () => {
    setUA('Mozilla/5.0 (Windows NT 10.0) Firefox/120', false)
    expect(canShareScreen()).toBe(false)
  })
})
