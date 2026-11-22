-- Kinspirit database setup. Paste ALL of this into the Supabase dashboard:
-- SQL Editor > New query > paste > Run. It is safe to run more than once,
-- so run the whole file again whenever a new version of the app asks for it.

-- 1. Profiles: one row per person -------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  phone          text,
  phone_verified boolean not null default false,
  avatar_url     text,
  created_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "signed-in users can read profiles" on public.profiles;
create policy "signed-in users can read profiles"
  on public.profiles for select to authenticated using (true);

drop policy if exists "users create their own profile" on public.profiles;
create policy "users create their own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "users edit their own profile" on public.profiles;
create policy "users edit their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Newer Supabase projects do not hand out table access automatically, so grant it explicitly.
grant usage on schema public to authenticated;

-- Other people can see a username and photo, but NEVER a phone number.
revoke all on public.profiles from anon;
revoke select on public.profiles from authenticated;
grant select (id, username, avatar_url, created_at) on public.profiles to authenticated;

-- People may never set phone_verified themselves; only the server can.
revoke insert, update on public.profiles from authenticated;
grant insert (id, username, phone, avatar_url) on public.profiles to authenticated;
grant update (id, username, phone, avatar_url) on public.profiles to authenticated;

-- 2. Username check ----------------------------------------------------------
create or replace function public.username_available(u text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select lower(u) <> all (array['admin','kinspirit','support','help','root'])
     and not exists (select 1 from public.profiles where username = lower(u));
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to authenticated;

-- 3. Profile photos ----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars are public" on storage.objects;
create policy "avatars are public"
  on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists "users upload their own avatar" on storage.objects;
create policy "users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users replace their own avatar" on storage.objects;
create policy "users replace their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4. Contacts, conversations and messages --------------------------------------
create table if not exists public.contacts (
  owner      uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, contact_id),
  check (owner <> contact_id)
);

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null default 'direct' check (kind in ('direct', 'group')),
  title           text,
  created_by      uuid references public.profiles (id) on delete set null,
  direct_key      text unique,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null default 'member' check (role in ('admin', 'member')),
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 4000),
  created_at      timestamptz not null default now()
);
-- audio file columns (used by the chat list below)
alter table public.messages add column if not exists kind text not null default 'text';
alter table public.messages add column if not exists file_path text;
alter table public.messages add column if not exists file_name text;
alter table public.messages add column if not exists file_size integer;
alter table public.messages add column if not exists duration integer;

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at desc);

alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- The app reaches contacts, conversations and members only through the functions below.
revoke all on public.contacts from anon, authenticated;
revoke all on public.conversations from anon, authenticated;
revoke all on public.conversation_members from anon, authenticated;
revoke all on public.messages from anon, authenticated;

-- Am I a member of this conversation?
create or replace function public.is_member(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = cid and m.user_id = auth.uid()
  );
$$;
revoke all on function public.is_member(uuid) from public;
grant execute on function public.is_member(uuid) to authenticated;

-- Messages: members can read, and can send as themselves.
grant select on public.messages to authenticated;
grant insert (id, conversation_id, sender_id, body) on public.messages to authenticated;

drop policy if exists "members read messages" on public.messages;
create policy "members read messages"
  on public.messages for select to authenticated
  using (public.is_member(conversation_id));

drop policy if exists "members send messages" on public.messages;
create policy "members send messages"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_member(conversation_id));

-- Keep the conversation's "last message" time fresh.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- Find people by the start of a username (at least 2 letters).
create or replace function public.search_profiles(q text)
returns table (id uuid, username text, avatar_url text)
language sql
security definer
set search_path = public
stable
as $$
  with s as (select lower(regexp_replace(coalesce(q, ''), '[^a-zA-Z0-9_]', '', 'g')) as t)
  select p.id, p.username, p.avatar_url
  from public.profiles p, s
  where length(s.t) >= 2 and p.id <> auth.uid() and starts_with(p.username, s.t)
  order by p.username
  limit 20;
$$;

create or replace function public.my_contacts()
returns table (id uuid, username text, avatar_url text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.avatar_url
  from public.contacts c join public.profiles p on p.id = c.contact_id
  where c.owner = auth.uid()
  order by p.username;
$$;

create or replace function public.add_contact(other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if other is null or other = auth.uid() then raise exception 'invalid person'; end if;
  if not exists (select 1 from public.profiles where id = other) then raise exception 'person not found'; end if;
  insert into public.contacts (owner, contact_id) values (auth.uid(), other) on conflict do nothing;
end;
$$;

create or replace function public.remove_contact(other uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.contacts where owner = auth.uid() and contact_id = other;
$$;

-- Open (or create) the one-to-one chat with another person.
create or replace function public.start_direct_chat(other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  k   text;
  cid uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if other is null or other = me then raise exception 'invalid person'; end if;
  if not exists (select 1 from public.profiles where id = other) then raise exception 'person not found'; end if;

  k := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  select id into cid from public.conversations where direct_key = k;
  if cid is null then
    insert into public.conversations (kind, created_by, direct_key)
    values ('direct', me, k)
    on conflict (direct_key) do nothing
    returning id into cid;
    if cid is null then select id into cid from public.conversations where direct_key = k; end if;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (cid, me), (cid, other)
  on conflict do nothing;

  insert into public.contacts (owner, contact_id) values (me, other) on conflict do nothing;
  return cid;
end;
$$;

-- My chat list: newest first, with the last message and how many are unread.
-- Groups appear as soon as they are created, even before the first message.
drop function if exists public.my_conversations();
create or replace function public.my_conversations()
returns table (
  id uuid, kind text, title text, last_message_at timestamptz,
  other_id uuid, other_username text, other_avatar text,
  last_body text, last_sender uuid, last_sender_name text, unread integer
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.kind, c.title, c.last_message_at,
         o.user_id, p.username, p.avatar_url,
         coalesce(lm.body, 'Group created'), lm.sender_id, lp.username,
         (select count(*)::integer from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at)
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select case when m.kind = 'audio' then '🎵 ' || m.body when m.kind = 'voice' then '🎤 Voice note' when m.kind = 'call' then '📞 Call' else m.body end as body, m.sender_id
    from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  left join lateral (
    select x.user_id from public.conversation_members x
    where x.conversation_id = c.id and x.user_id <> auth.uid() and c.kind = 'direct' limit 1
  ) o on true
  left join public.profiles p on p.id = o.user_id
  left join public.profiles lp on lp.id = lm.sender_id
  where me.user_id = auth.uid() and (lm.sender_id is not null or c.kind = 'group')
  order by c.last_message_at desc;
$$;

create or replace function public.mark_read(cid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_members set last_read_at = now()
  where conversation_id = cid and user_id = auth.uid();
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'search_profiles(text)', 'my_contacts()', 'add_contact(uuid)', 'remove_contact(uuid)',
    'start_direct_chat(uuid)', 'my_conversations()', 'mark_read(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 5. Audio files in chats -----------------------------------------------------
-- Audio files wait on the server only until the receiver saves them on their device.

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'audio', 'voice', 'call'));
alter table public.messages drop constraint if exists messages_audio_check;
alter table public.messages add constraint messages_audio_check
  check (kind = 'text' or (file_path is not null and file_path like conversation_id::text || '/%'));

grant insert (id, conversation_id, sender_id, body, kind, file_path, file_name, file_size, duration)
  on public.messages to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 20971520)
on conflict (id) do update set file_size_limit = 20971520, public = false;

drop policy if exists "members read chat files" on storage.objects;
create policy "members read chat files" on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "members add chat files" on storage.objects;
create policy "members add chat files" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "members update chat files" on storage.objects;
create policy "members update chat files" on storage.objects for update to authenticated
  using (bucket_id = 'chat-files' and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "members remove chat files" on storage.objects;
create policy "members remove chat files" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-files' and public.is_member(((storage.foldername(name))[1])::uuid));

-- 6. Groups -------------------------------------------------------------------
-- Up to 2000 people. Any member can add friends; admins can remove people, rename and promote.

create or replace function public.create_group(group_title text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  t   text := btrim(coalesce(group_title, ''));
  cid uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if char_length(t) < 1 or char_length(t) > 60 then raise exception 'group name must be 1 to 60 characters'; end if;
  insert into public.conversations (kind, title, created_by) values ('group', t, me) returning id into cid;
  insert into public.conversation_members (conversation_id, user_id, role) values (cid, me, 'admin');
  insert into public.conversation_members (conversation_id, user_id)
  select p.id from public.profiles p
  where p.id = any (coalesce(member_ids, '{}'::uuid[])) and p.id <> me
  limit 1999
  on conflict do nothing;
  return cid;
end;
$$;

create or replace function public.group_members(cid uuid)
returns table (id uuid, username text, avatar_url text, role text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.avatar_url, m.role
  from public.conversation_members m
  join public.profiles p on p.id = m.user_id
  where m.conversation_id = cid and public.is_member(cid)
  order by (m.role = 'admin') desc, p.username
  limit 2000;
$$;

create or replace function public.add_group_members(cid uuid, member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if auth.uid() is null or not public.is_member(cid) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.conversations c where c.id = cid and c.kind = 'group') then
    raise exception 'not a group';
  end if;
  select count(*) into n from public.conversation_members x where x.conversation_id = cid;
  if n >= 2000 then raise exception 'this group is full'; end if;
  insert into public.conversation_members (conversation_id, user_id)
  select cid, p.id from public.profiles p
  where p.id = any (coalesce(member_ids, '{}'::uuid[]))
  limit (2000 - n)
  on conflict do nothing;
end;
$$;

create or replace function public.remove_group_member(cid uuid, who uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if not exists (select 1 from public.conversation_members x
                 where x.conversation_id = cid and x.user_id = me and x.role = 'admin') then
    raise exception 'only admins can remove people';
  end if;
  if who = me then raise exception 'use leave instead'; end if;
  delete from public.conversation_members where conversation_id = cid and user_id = who;
end;
$$;

create or replace function public.set_group_admin(cid uuid, who uuid, make_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if not exists (select 1 from public.conversation_members x
                 where x.conversation_id = cid and x.user_id = me and x.role = 'admin') then
    raise exception 'only admins can change roles';
  end if;
  if not make_admin and (select count(*) from public.conversation_members x
                         where x.conversation_id = cid and x.role = 'admin') <= 1 then
    raise exception 'a group needs at least one admin';
  end if;
  update public.conversation_members
  set role = case when make_admin then 'admin' else 'member' end
  where conversation_id = cid and user_id = who;
end;
$$;

create or replace function public.rename_group(cid uuid, new_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare t text := btrim(coalesce(new_title, ''));
begin
  if not exists (select 1 from public.conversation_members x
                 where x.conversation_id = cid and x.user_id = auth.uid() and x.role = 'admin') then
    raise exception 'only admins can rename the group';
  end if;
  if char_length(t) < 1 or char_length(t) > 60 then raise exception 'group name must be 1 to 60 characters'; end if;
  update public.conversations set title = t where id = cid and kind = 'group';
end;
$$;

-- Leaving: if nobody is left the group is deleted; if no admin is left the longest-standing member becomes one.
create or replace function public.leave_group(cid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.conversations c where c.id = cid and c.kind = 'group') then return; end if;
  delete from public.conversation_members where conversation_id = cid and user_id = auth.uid();
  if not exists (select 1 from public.conversation_members x where x.conversation_id = cid) then
    delete from public.conversations where id = cid;
  elsif not exists (select 1 from public.conversation_members x where x.conversation_id = cid and x.role = 'admin') then
    update public.conversation_members set role = 'admin'
    where conversation_id = cid
      and user_id = (select y.user_id from public.conversation_members y
                     where y.conversation_id = cid order by y.joined_at limit 1);
  end if;
end;
$$;

-- Audio files: remember who has saved a file, so the server copy is removed only after everyone has it.
create table if not exists public.message_downloads (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  primary key (message_id, user_id)
);
alter table public.message_downloads enable row level security;
revoke all on public.message_downloads from anon, authenticated;

create or replace function public.audio_saved(mid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare cid uuid; snd uuid;
begin
  select m.conversation_id, m.sender_id into cid, snd from public.messages m where m.id = mid;
  if cid is null or not public.is_member(cid) then raise exception 'not allowed'; end if;
  insert into public.message_downloads (message_id, user_id) values (mid, auth.uid()) on conflict do nothing;
  return not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = cid and cm.user_id <> snd
      and not exists (select 1 from public.message_downloads d where d.message_id = mid and d.user_id = cm.user_id)
  );
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'my_conversations()', 'create_group(text, uuid[])', 'group_members(uuid)', 'add_group_members(uuid, uuid[])',
    'remove_group_member(uuid, uuid)', 'set_group_admin(uuid, uuid, boolean)', 'rename_group(uuid, text)',
    'leave_group(uuid)', 'audio_saved(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 7. Calls --------------------------------------------------------------------
-- Used by the "livekit-token" Edge Function: am I in this chat, and am I a host?
-- Hosts are group admins. In one-to-one chats both people are equal.
create or replace function public.call_info(cid uuid)
returns table (role text, username text)
language sql
security definer
set search_path = public
stable
as $$
  select case when c.kind = 'group' and m.role = 'admin' then 'host' else 'member' end, p.username
  from public.conversation_members m
  join public.conversations c on c.id = m.conversation_id
  join public.profiles p on p.id = m.user_id
  where m.conversation_id = cid and m.user_id = auth.uid();
$$;
revoke all on function public.call_info(uuid) from public;
grant execute on function public.call_info(uuid) to authenticated;

-- 8. Reply, edit and delete ---------------------------------------------------
-- updated_at moves forward on every edit or delete, so the app's polling sees changes.
alter table public.messages add column if not exists reply_to   uuid references public.messages (id) on delete set null;
alter table public.messages add column if not exists edited_at  timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists updated_at timestamptz not null default now();
create index if not exists messages_updated_idx on public.messages (conversation_id, updated_at);

grant insert (id, conversation_id, sender_id, body, kind, file_path, file_name, file_size, duration, reply_to)
  on public.messages to authenticated;

-- Edit my own text message.
create or replace function public.edit_message(mid uuid, new_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  new_body := btrim(coalesce(new_body, ''));
  if char_length(new_body) not between 1 and 4000 then raise exception 'empty message'; end if;
  update public.messages
     set body = new_body, edited_at = now(), updated_at = now()
   where id = mid and sender_id = auth.uid() and kind = 'text' and deleted_at is null
     and public.is_member(conversation_id);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'cannot edit this message'; end if;
end;
$$;

-- Delete for everyone: the sender can delete their own; in a group, admins can delete anyone's.
-- Returns the file path (if any) so the app can remove the file from storage.
create or replace function public.delete_message(mid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare m public.messages%rowtype; allowed boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from public.messages where id = mid;
  if not found or not public.is_member(m.conversation_id) then raise exception 'message not found'; end if;
  allowed := m.sender_id = auth.uid() or exists (
    select 1 from public.conversation_members cm join public.conversations c on c.id = cm.conversation_id
    where cm.conversation_id = m.conversation_id and cm.user_id = auth.uid() and cm.role = 'admin' and c.kind = 'group'
  );
  if not allowed then raise exception 'not allowed'; end if;
  if m.deleted_at is not null then return null; end if;
  update public.messages set deleted_at = now(), updated_at = now() where id = mid;
  return m.file_path;
end;
$$;

-- Chat list: deleted messages show as "Message deleted".
drop function if exists public.my_conversations();
create or replace function public.my_conversations()
returns table (
  id uuid, kind text, title text, last_message_at timestamptz,
  other_id uuid, other_username text, other_avatar text,
  last_body text, last_sender uuid, last_sender_name text, unread integer
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.kind, c.title, c.last_message_at,
         o.user_id, p.username, p.avatar_url,
         coalesce(lm.body, 'Group created'), lm.sender_id, lp.username,
         (select count(*)::integer from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.deleted_at is null and m.created_at > me.last_read_at)
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select case when m.deleted_at is not null then '🚫 Message deleted'
                when m.kind = 'audio' then '🎵 ' || m.body when m.kind = 'voice' then '🎤 Voice note'
                when m.kind = 'call' then '📞 Call' else m.body end as body, m.sender_id
    from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  left join lateral (
    select x.user_id from public.conversation_members x
    where x.conversation_id = c.id and x.user_id <> auth.uid() and c.kind = 'direct' limit 1
  ) o on true
  left join public.profiles p on p.id = o.user_id
  left join public.profiles lp on lp.id = lm.sender_id
  where me.user_id = auth.uid() and (lm.sender_id is not null or c.kind = 'group')
  order by c.last_message_at desc;
$$;

do $$
declare f text;
begin
  foreach f in array array['my_conversations()', 'edit_message(uuid, text)', 'delete_message(uuid)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 9. Ringing: calling, ringing, answered, missed -------------------------------
-- A call is a chat message (kind 'call') that carries its own status.
alter table public.messages add column if not exists call_status      text
  check (call_status in ('ringing', 'answered', 'declined', 'missed', 'ended', 'cancelled'));
alter table public.messages add column if not exists call_ringing_at  timestamptz; -- the other phone has been reached
alter table public.messages add column if not exists call_answered_at timestamptz;
alter table public.messages add column if not exists call_ended_at    timestamptz;
create index if not exists messages_ringing_idx on public.messages (created_at) where call_status = 'ringing';

-- Call messages have no file, so the earlier "audio" rule must allow them.
alter table public.messages drop constraint if exists messages_audio_check;
alter table public.messages add constraint messages_audio_check
  check (kind in ('text', 'call') or (file_path is not null and file_path like conversation_id::text || '/%'));

-- Start ringing. If this chat is already ringing, returns that call (mine = false means someone else rang first).
create or replace function public.start_call(cid uuid)
returns table (id uuid, mine boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare me uuid := auth.uid(); mid uuid; snd uuid;
begin
  if me is null or not public.is_member(cid) then raise exception 'not allowed'; end if;
  select m.id, m.sender_id into mid, snd from public.messages m
   where m.conversation_id = cid and m.kind = 'call' and m.call_status = 'ringing'
     and m.created_at > now() - interval '45 seconds'
   order by m.created_at desc limit 1;
  if mid is null then
    insert into public.messages (conversation_id, sender_id, body, kind, call_status)
    values (cid, me, 'Call', 'call', 'ringing') returning messages.id into mid;
    snd := me;
  end if;
  return query select mid, snd = me;
end;
$$;

-- Calls ringing for me right now. Reaching me marks the call as "ringing" on the caller's screen.
-- Calls nobody picked up for 45 seconds become "missed".
create or replace function public.incoming_calls()
returns table (
  id uuid, conversation_id uuid, kind text, title text,
  caller_id uuid, caller_username text, caller_avatar text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.messages m set call_status = 'missed', updated_at = now()
   where m.kind = 'call' and m.call_status = 'ringing' and m.created_at < now() - interval '45 seconds'
     and public.is_member(m.conversation_id);
  update public.messages m set call_ringing_at = now(), updated_at = now()
   where m.kind = 'call' and m.call_status = 'ringing' and m.call_ringing_at is null
     and m.sender_id <> auth.uid() and m.created_at > now() - interval '45 seconds'
     and public.is_member(m.conversation_id);
  return query
    select m.id, m.conversation_id, c.kind, c.title, m.sender_id, p.username, p.avatar_url, m.created_at
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      join public.profiles p on p.id = m.sender_id
     where m.kind = 'call' and m.call_status = 'ringing' and m.sender_id <> auth.uid()
       and m.created_at > now() - interval '45 seconds' and public.is_member(m.conversation_id)
     order by m.created_at desc;
end;
$$;

-- Pick up. Returns the call's status afterwards ('answered' means it worked).
create or replace function public.answer_call(mid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare s text;
begin
  update public.messages m set call_status = 'answered', call_answered_at = now(), updated_at = now()
   where m.id = mid and m.kind = 'call' and m.call_status = 'ringing' and m.sender_id <> auth.uid()
     and m.created_at > now() - interval '60 seconds' and public.is_member(m.conversation_id);
  select m.call_status into s from public.messages m where m.id = mid and public.is_member(m.conversation_id);
  return s;
end;
$$;

-- Say no. In one-to-one chats the caller is told; in groups it only hides the call for the one who said no.
create or replace function public.decline_call(mid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages m set call_status = 'declined', updated_at = now()
   where m.id = mid and m.kind = 'call' and m.call_status = 'ringing' and m.sender_id <> auth.uid()
     and public.is_member(m.conversation_id)
     and exists (select 1 from public.conversations c where c.id = m.conversation_id and c.kind = 'direct');
$$;

-- Hang up. Before anyone answers it counts as missed (or "cancelled" when the call failed to start);
-- after answering it ends the one-to-one call. Group calls only end while still ringing.
create or replace function public.end_call(mid uuid, failed boolean default false)
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages m
     set call_status = case when m.call_status = 'ringing' and failed then 'cancelled'
                            when m.call_status = 'ringing' then 'missed' else 'ended' end,
         call_ended_at = now(), updated_at = now()
   where m.id = mid and m.kind = 'call' and m.call_status in ('ringing', 'answered')
     and public.is_member(m.conversation_id)
     and (exists (select 1 from public.conversations c where c.id = m.conversation_id and c.kind = 'direct')
          or (m.sender_id = auth.uid() and m.call_status = 'ringing'));
$$;

-- Chat list: show missed calls as such.
drop function if exists public.my_conversations();
create or replace function public.my_conversations()
returns table (
  id uuid, kind text, title text, last_message_at timestamptz,
  other_id uuid, other_username text, other_avatar text,
  last_body text, last_sender uuid, last_sender_name text, unread integer
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.kind, c.title, c.last_message_at,
         o.user_id, p.username, p.avatar_url,
         coalesce(lm.body, 'Group created'), lm.sender_id, lp.username,
         (select count(*)::integer from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.deleted_at is null
             and coalesce(m.call_status, '') <> 'cancelled' and m.created_at > me.last_read_at)
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select case when m.deleted_at is not null then '🚫 Message deleted'
                when m.kind = 'audio' then '🎵 ' || m.body when m.kind = 'voice' then '🎤 Voice note'
                when m.kind = 'call' and m.call_status in ('missed', 'ringing') and m.sender_id <> auth.uid() then '📞 Missed call'
                when m.kind = 'call' then '📞 Call' else m.body end as body, m.sender_id
    from public.messages m
    where m.conversation_id = c.id and coalesce(m.call_status, '') <> 'cancelled'
    order by m.created_at desc limit 1
  ) lm on true
  left join lateral (
    select x.user_id from public.conversation_members x
    where x.conversation_id = c.id and x.user_id <> auth.uid() and c.kind = 'direct' limit 1
  ) o on true
  left join public.profiles p on p.id = o.user_id
  left join public.profiles lp on lp.id = lm.sender_id
  where me.user_id = auth.uid() and (lm.sender_id is not null or c.kind = 'group')
  order by c.last_message_at desc;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'start_call(uuid)', 'incoming_calls()', 'answer_call(uuid)', 'decline_call(uuid)', 'end_call(uuid, boolean)', 'my_conversations()'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
