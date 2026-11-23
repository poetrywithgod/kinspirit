// Kinspirit clean-up: deletes server copies of chat files that are old or belong to deleted messages.
// People keep their own copies on their phones; this only frees the server's storage.
// Secrets: PUSH_SECRET (same one send-push uses). Optional: RETENTION_DAYS (default 30).
// Turn OFF "Enforce JWT verification" for this function: it checks PUSH_SECRET itself.
// Test without deleting anything: send {"dry": true}.
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get('PUSH_SECRET')
    if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('no', { status: 401 })
    const body = await req.json().catch(() => ({}))
    const dry = body?.dry === true
    const days = Math.max(1, Number(Deno.env.get('RETENTION_DAYS') ?? 30))
    const cutoff = new Date(Date.now() - days * 86400000).toISOString()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    let removed = 0
    let failed = 0
    let found = 0
    for (let round = 0; round < 10; round++) {
      const { data: rows, error } = await sb
        .from('messages')
        .select('id, file_path')
        .not('file_path', 'is', null)
        .or(`created_at.lt.${cutoff},deleted_at.not.is.null`)
        .limit(100)
      if (error) return new Response(error.message, { status: 500 })
      if (!rows?.length) break
      found += rows.length
      if (dry) break
      const paths = rows.map((r) => r.file_path as string)
      const { error: rmErr } = await sb.storage.from('chat-files').remove(paths)
      if (rmErr) {
        failed += rows.length
        break // try again at the next run
      }
      const ids = rows.map((r) => r.id)
      const now = new Date().toISOString()
      const { error: upErr } = await sb
        .from('messages')
        .update({ file_path: null, file_removed_at: now, updated_at: now })
        .in('id', ids)
      if (upErr) return new Response(upErr.message, { status: 500 })
      removed += rows.length
    }
    return Response.json({ days, dry, found, removed, failed })
  } catch (e) {
    return new Response(String(e), { status: 500 })
  }
})
