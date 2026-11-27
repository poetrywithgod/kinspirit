// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORE_KEY, reloadSession } from '../src/supabase'

const session = { access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'me', email: 'me@x.com' } }
let calls: { url: string; init?: RequestInit }[] = []

function fetchReturns(status: number, body: unknown) {
  calls = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  })
}

const api = await import('../src/api')

describe('talking to the server', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(STORE_KEY, JSON.stringify(session))
    reloadSession() // a logged-in person
  })

  it('searchMessages keeps filter characters out of the query', async () => {
    fetchReturns(200, [])
    await api.searchMessages('c1', 'a,b)(*%\\c')
    const url = decodeURIComponent(calls[0].url)
    expect(url).toContain('or=(body.ilike.*a b c*,file_name.ilike.*a b c*)')
    expect(url).not.toMatch(/ilike\.\*[^*]*[,()%\\]/)
  })

  it('searchMessages needs at least two letters', async () => {
    fetchReturns(200, [])
    expect(await api.searchMessages('c1', 'a')).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('changeUsername rejects bad names before asking the server', async () => {
    fetchReturns(200, true)
    await expect(api.changeUsername('ab')).rejects.toMatchObject({ code: 'bad_username' })
    await expect(api.changeUsername('has space')).rejects.toMatchObject({ code: 'bad_username' })
    expect(calls).toHaveLength(0)
  })

  it('changeUsername explains the 7-day limit', async () => {
    calls = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      if (String(url).includes('username_available')) return new Response('true', { status: 200 })
      return new Response(JSON.stringify({ code: 'P0001', message: 'username_recently_changed' }), { status: 400 })
    })
    await expect(api.changeUsername('Ada_99')).rejects.toMatchObject({ code: 'username_recent' })
  })

  it('wrong password on delete stops before anything is deleted', async () => {
    fetchReturns(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
    await expect(api.deleteAccount('nope')).rejects.toMatchObject({ code: 'invalid_credentials' })
    expect(calls.every((c) => !c.url.includes('delete_my_account'))).toBe(true)
  })
})
