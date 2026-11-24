// Kinspirit push notifications.
//  1. The database calls this after every new message (header x-push-secret must equal PUSH_SECRET).
//  2. The app's "Send me a test notification" button calls it with the person's login (body {"test": true}).
// Secrets (Edge Functions -> Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com), PUSH_SECRET.
// Turn OFF "Verify JWT" for this function: it does its own checks below.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Sub = { endpoint: string; p256dh: string; auth: string }

async function sendAll(sb: ReturnType<typeof createClient>, subs: Sub[], payload: string, urgent: boolean) {
  const failed: { status: number | null; message: string }[] = []
  let sent = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: urgent ? 45 : 86400, urgency: urgent ? 'high' : 'normal' },
        )
        sent++
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string }
        console.error('push failed', err.statusCode, err.body ?? err.message)
        failed.push({ status: err.statusCode ?? null, message: String(err.body ?? err.message ?? '').slice(0, 200) })
        if (err.statusCode === 404 || err.statusCode === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    }),
  )
  return { sent, failed }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))
    const isTest = body?.test === true
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const pub = Deno.env.get('VAPID_PUBLIC_KEY')?.trim()
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')?.trim()
    if (!pub || !priv) return json({ ok: false, step: 'vapid-missing', message: 'VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is not set.' }, 500)
    try {
      webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')?.trim() || 'mailto:admin@kinspirit.app', pub, priv)
    } catch (e) {
      return json({ ok: false, step: 'vapid-invalid', message: String((e as Error).message) }, 500)
    }

    // ---- Test: send a notification to the person who asked ----
    if (isTest) {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data: u } = await sb.auth.getUser(token)
      if (!u?.user) return json({ ok: false, step: 'not-signed-in', message: 'Please log in again.' }, 401)
      const { data: subs, error } = await sb.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', u.user.id)
      if (error) return json({ ok: false, step: 'database', message: error.message }, 500)
      if (!subs?.length) return json({ ok: false, step: 'no-device', message: 'No device is registered for you.' })
      const r = await sendAll(sb, subs, JSON.stringify({ title: 'Kinspirit', body: 'Notifications are working 🎉', test: true }), false)
      return json({ ok: r.sent > 0, step: 'sent', devices: subs.length, ...r })
    }

    // ---- New message: sent by the database ----
    const secret = Deno.env.get('PUSH_SECRET')
    if (!secret || req.headers.get('x-push-secret') !== secret) return json({ ok: false, step: 'secret', message: 'wrong secret' }, 401)

    const { data: m, error: mErr } = await sb
      .from('messages')
      .select('id, conversation_id, sender_id, kind, body, file_name, deleted_at')
      .eq('id', body.message_id)
      .maybeSingle()
    if (mErr) {
      console.error('message lookup failed', mErr.message)
      return json({ ok: false, step: 'database', message: mErr.message }, 500)
    }
    if (!m || m.deleted_at) return json({ ok: true, step: 'skip' })

    const [{ data: convo }, { data: sender }, { data: members }, { data: blockers }] = await Promise.all([
      sb.from('conversations').select('kind, title').eq('id', m.conversation_id).maybeSingle(),
      sb.from('profiles').select('username').eq('id', m.sender_id).maybeSingle(),
      sb.from('conversation_members').select('user_id').eq('conversation_id', m.conversation_id).neq('user_id', m.sender_id),
      sb.from('blocks').select('blocker').eq('blocked', m.sender_id),
    ])
    const blocked = new Set((blockers ?? []).map((b) => b.blocker))
    const to = (members ?? []).map((x) => x.user_id).filter((id) => !blocked.has(id))
    if (!to.length) return json({ ok: true, step: 'nobody' })

    const { data: subs } = await sb.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', to)
    if (!subs?.length) return json({ ok: true, step: 'no-devices' })

    const who = '@' + (sender?.username ?? 'someone')
    const isCall = m.kind === 'call'
    const what =
      isCall ? 'Incoming call'
      : m.kind === 'voice' ? '🎤 Voice note'
      : m.kind === 'audio' ? '🎵 ' + (m.body ?? 'Audio')
      : m.kind === 'sticker' ? '🙂 Sticker'
      : m.kind === 'image' ? '📷 Photo'
      : m.kind === 'video' ? '🎥 Video'
      : m.kind === 'file' ? '📄 ' + (m.file_name ?? 'File')
      : String(m.body ?? '').slice(0, 120)
    const group = convo?.kind === 'group'
    const payload = JSON.stringify({
      title: isCall ? `${who} is calling` : group ? (convo?.title ?? 'Group') : who,
      body: group && !isCall ? `${who}: ${what}` : isCall ? (group ? (convo?.title ?? 'Group call') : 'Kinspirit call') : what,
      cid: m.conversation_id,
      call: isCall,
    })
    const r = await sendAll(sb, subs, payload, isCall)
    console.log('push', m.id, 'devices', subs.length, 'sent', r.sent, 'failed', r.failed.length)
    return json({ ok: true, step: 'sent', devices: subs.length, ...r })
  } catch (e) {
    console.error('send-push crashed', e)
    return json({ ok: false, step: 'crash', message: String(e) }, 500)
  }
})
