// Kinspirit calls: gives people a pass into a LiveKit room and runs host controls.
// Secrets needed (Edge Functions -> Secrets): LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
// Turn OFF "Enforce JWT verification" for this function: it checks the signed-in user itself below.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { AccessToken, RoomServiceClient, TrackType } from 'npm:livekit-server-sdk@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_PEOPLE = 150

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('LIVEKIT_URL')
    const key = Deno.env.get('LIVEKIT_API_KEY')
    const secret = Deno.env.get('LIVEKIT_API_SECRET')
    if (!url || !key || !secret) return json({ error: 'Calls are not set up on the server yet.' }, 500)

    // Who is asking?
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: u } = await sb.auth.getUser()
    if (!u?.user) return json({ error: 'Please log in again.' }, 401)
    const me = u.user.id

    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')
    const cid = String(body.cid ?? '')

    // Are they in this chat, and are they a host (group admin)?
    const { data: info, error: infoErr } = await sb.rpc('call_info', { cid })
    if (infoErr || !info?.[0]) return json({ error: 'You are not part of this chat.' }, 403)
    const role: 'host' | 'member' = info[0].role === 'host' ? 'host' : 'member'
    const username: string = info[0].username

    const room = `kin-${cid}`
    const svc = new RoomServiceClient(url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), key, secret)

    const participants = async () => {
      try {
        return await svc.listParticipants(room)
      } catch {
        return []
      }
    }
    const roleOf = (meta?: string) => {
      try {
        return JSON.parse(meta || '{}').role as string
      } catch {
        return ''
      }
    }

    if (action === 'status') {
      const list = await participants()
      return json({ active: list.length > 0, count: list.length })
    }

    if (action === 'join') {
      let locked = false
      try {
        const found = await svc.listRooms([room])
        locked = JSON.parse(found[0]?.metadata || '{}').locked === true
        if (!found[0]) await svc.createRoom({ name: room, maxParticipants: MAX_PEOPLE, emptyTimeout: 120, metadata: '{}' })
      } catch {
        // the room is created automatically on first join if this fails
      }
      const at = new AccessToken(key, secret, {
        identity: me,
        name: username,
        metadata: JSON.stringify({ role }),
        ttl: '6h',
      })
      at.addGrant({
        room,
        roomJoin: true,
        canPublish: !(locked && role !== 'host'),
        canSubscribe: true,
        canPublishData: true,
      })
      return json({ url, token: await at.toJwt(), role, locked })
    }

    // Everything below is for hosts only.
    if (role !== 'host') return json({ error: 'Only hosts can do that.' }, 403)

    if (action === 'mute_all' || action === 'lock_all' || action === 'unlock_all') {
      const list = (await participants()).filter((p) => p.identity !== me && roleOf(p.metadata) !== 'host')
      if (action === 'lock_all') await svc.updateRoomMetadata(room, JSON.stringify({ locked: true }))
      if (action === 'unlock_all') await svc.updateRoomMetadata(room, JSON.stringify({ locked: false }))
      for (const p of list) {
        if (action === 'unlock_all') {
          await svc.updateParticipant(room, p.identity, undefined, { canPublish: true, canSubscribe: true, canPublishData: true })
          continue
        }
        if (action === 'lock_all') {
          await svc.updateParticipant(room, p.identity, undefined, { canPublish: false, canSubscribe: true, canPublishData: true })
        }
        for (const t of p.tracks) {
          if (t.type === TrackType.AUDIO && !t.muted) await svc.mutePublishedTrack(room, p.identity, t.sid, true)
        }
      }
      return json({ ok: true, count: list.length })
    }

    if (action === 'remove') {
      const who = String(body.identity ?? '')
      if (!who || who === me) return json({ error: 'Choose someone else to remove.' }, 400)
      await svc.removeParticipant(room, who)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: 'Something went wrong with the call. Try again.' }, 500)
  }
})
