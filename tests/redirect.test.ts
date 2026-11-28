// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { auth } from '../src/supabase'

const urls: string[] = []
const fetchOk = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(String(url))
      return new Response(JSON.stringify({ identities: [{}] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }),
  )

describe('email confirmation link', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    urls.length = 0
  })

  it('asks Supabase to send people back to this app when they sign up', async () => {
    fetchOk()
    await auth.signUp('a@b.co', 'secret123', {})
    expect(urls[0]).toContain('/auth/v1/signup?redirect_to=' + encodeURIComponent(window.location.origin))
  })

  it('does the same when the email is sent again', async () => {
    fetchOk()
    await auth.resendSignupCode('a@b.co')
    expect(urls[0]).toContain('/auth/v1/resend?redirect_to=' + encodeURIComponent(window.location.origin))
  })
})
