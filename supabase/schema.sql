-- Kinspirit database setup. Paste ALL of this into the Supabase dashboard:
-- SQL Editor > New query > paste > Run. It is safe to run more than once.

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
-- People may never set phone_verified themselves; only the server can.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
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
