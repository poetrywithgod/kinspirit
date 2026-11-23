// Kinspirit push notifications: called by the database after every new message.
// Secrets (Edge Functions -> Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com), PUSH_SECRET.
// Turn OFF "Enforce JWT verification" for this function: it checks PUSH_SECRET itself below.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get('PUSH_SECRET')
    if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('no', { status: 401 })
    const pub = Deno.env.get('VAPID_PUBLIC_KEY')
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')
    if (!pub || !priv) return new Response('not set up', { status: 500 })
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@kinspirit.app', pub, priv)

    const { message_id } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: m } = await sb
      .from('messages')
      .select('id, conversation_id, sender_id, kind, body, file_name, deleted_at')
      .eq('id', message_id)
      .maybeSingle()
    if (!m || m.deleted_at) return new Response('skip')

    const [{ data: convo }, { data: sender }, { data: members }, { data: blockers }] = await Promise.all([
      sb.from('conversations').select('kind, title').eq('id', m.conversation_id).maybeSingle(),
      sb.from('profiles').select('username').eq('id', m.sender_id).maybeSingle(),
      sb.from('conversation_members').select('user_id').eq('conversation_id', m.conversation_id).neq('user_id', m.sender_id),
      sb.from('blocks').select('blocker').eq('blocked', m.sender_id),
    ])
    const blocked = new Set((blockers ?? []).map((b) => b.blocker))
    const to = (members ?? []).map((x) => x.user_id).filter((id) => !blocked.has(id))
    if (!to.length) return new Response('nobody')

    const { data: subs } = await sb.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', to)
    if (!subs?.length) return new Response('no devices')

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

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: isCall ? 45 : 86400, urgency: isCall ? 'high' : 'normal' },
          )
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }),
    )
    return new Response('ok')
  } catch (e) {
    return new Response(String(e), { status: 500 })
  }
})
