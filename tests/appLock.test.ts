// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { disableLock, enableLock, lockEnabledFor, unlockWithDevice } from '../src/appLock'

const credentials = (create: unknown, get: unknown) => {
  Object.defineProperty(navigator, 'credentials', { configurable: true, value: { create, get } })
}
const denied = () => Promise.reject(new DOMException('cancelled', 'NotAllowedError'))

describe('fingerprint / face lock', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('is off until it is switched on, and only for the person who switched it on', async () => {
    expect(lockEnabledFor('u1')).toBe(false)
    credentials(() => Promise.resolve({ rawId: new Uint8Array([1, 2, 3, 250]).buffer }), undefined)
    expect(await enableLock('u1', 'ada')).toBe('ok')
    expect(lockEnabledFor('u1')).toBe(true)
    expect(lockEnabledFor('u2')).toBe(false)
    expect(lockEnabledFor(undefined)).toBe(false)
  })

  it('does not switch on when the person cancels the phone prompt', async () => {
    credentials(denied, undefined)
    expect(await enableLock('u1', 'ada')).toBe('cancelled')
    expect(lockEnabledFor('u1')).toBe(false)
  })

  it('reports a real failure differently from a cancel', async () => {
    credentials(() => Promise.reject(new DOMException('no sensor', 'NotSupportedError')), undefined)
    expect(await enableLock('u1', 'ada')).toBe('failed')
  })

  it('unlocks only when the phone confirms, asking for the saved credential', async () => {
    const get = vi.fn().mockResolvedValue({ id: 'x' })
    credentials(() => Promise.resolve({ rawId: new Uint8Array([9, 8, 7]).buffer }), get)
    await enableLock('u1', 'ada')
    expect(await unlockWithDevice()).toBe('ok')
    const opts = get.mock.calls[0][0].publicKey
    expect(opts.userVerification).toBe('required')
    expect(Array.from(new Uint8Array(opts.allowCredentials[0].id))).toEqual([9, 8, 7])

    credentials(() => undefined, denied)
    expect(await unlockWithDevice()).toBe('cancelled')
  })

  it('switching off removes the lock', async () => {
    credentials(() => Promise.resolve({ rawId: new Uint8Array([1]).buffer }), undefined)
    await enableLock('u1', 'ada')
    disableLock()
    expect(lockEnabledFor('u1')).toBe(false)
  })
})
