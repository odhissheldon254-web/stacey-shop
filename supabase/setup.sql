-- Tacey Collections — Supabase setup.
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Rules this sets up:
--   * anyone can READ the catalogue (it is a public shop)
--   * only accounts listed in shop_admins can CHANGE it or upload photos
-- Who is an admin is decided by a row in shop_admins (see the bottom of
-- this file), never by anything in the website code.

-- ── Catalogue ─────────────────────────────────────────────────────────
create table if not exists public.shop_data (
  key   text primary key,
  value jsonb not null,
  constraint products_shape check (
    key <> 'products'
    or (jsonb_typeof(value) = 'array' and jsonb_array_length(value) <= 500)
  )
);

-- ── Who may edit ──────────────────────────────────────────────────────
create table if not exists public.shop_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Runs with the owner's rights so the policies below can look inside
-- shop_admins, which is otherwise invisible to the public API.
create or replace function public.is_shop_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.shop_admins where user_id = (select auth.uid()));
$$;

alter table public.shop_data   enable row level security;
alter table public.shop_admins enable row level security;
-- shop_admins gets no policies at all: nobody can read or change it
-- through the API. Admins are added here in the SQL editor only.

drop policy if exists "catalogue is public"      on public.shop_data;
drop policy if exists "admins update catalogue"  on public.shop_data;
create policy "catalogue is public" on public.shop_data
  for select using (true);
create policy "admins update catalogue" on public.shop_data
  for update to authenticated
  using (public.is_shop_admin())
  with check (public.is_shop_admin());

-- ── Product photos ────────────────────────────────────────────────────
-- Public bucket: anyone can view a photo by its URL. 2 MB cap per file;
-- the admin already shrinks photos to ~200 KB before uploading.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins upload product images" on storage.objects;
drop policy if exists "admins replace product images" on storage.objects;
drop policy if exists "admins delete product images" on storage.objects;
create policy "admins upload product images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_shop_admin());
create policy "admins replace product images" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_shop_admin());
create policy "admins delete product images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_shop_admin());

-- ── Empty starting catalogue (never overwrites Stacey's edits) ─────────
insert into public.shop_data (key, value)
values ('products', '[]'::jsonb)
on conflict (key) do nothing;

-- ── Make Stacey an admin ──────────────────────────────────────────────
-- 1. Authentication → Users → Add user → "Create new user", enter her
--    email and password, tick "Auto Confirm User".
-- 2. Put her email below, select just this statement, and Run it.
--
-- insert into public.shop_admins (user_id)
-- select id from auth.users where email = 'her-email@example.com'
-- on conflict do nothing;
