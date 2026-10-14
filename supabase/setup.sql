-- PhotoBooth: configuración de tablas, seguridad y almacenamiento.
-- Ejecutar en Supabase > SQL Editor.

create schema if not exists private;

-- =========================================================
-- 1. TABLAS
-- =========================================================

create table if not exists public.photo_albums (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.photo_album_members (
  album_id uuid not null references public.photo_albums(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'PhotoBooth'
    check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (album_id, user_id)
);

alter table public.photo_album_members
  add column if not exists display_name text not null default 'PhotoBooth';

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.photo_albums(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'PhotoBooth',
  storage_path text not null unique,
  filter text not null default 'original'
    check (filter in ('original', 'mono', 'sepia', 'vintage', 'contrast', 'warm', 'cool')),
  created_at timestamptz not null default now()
);

create table if not exists public.photo_call_signals (
  id bigint generated always as identity primary key,
  album_id uuid not null references public.photo_albums(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  call_id uuid not null,
  signal_type text not null
    check (signal_type in ('offer', 'answer', 'ice', 'hangup', 'reject')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists photos_album_created_idx
  on public.photos (album_id, created_at);

create index if not exists album_members_user_idx
  on public.photo_album_members (user_id, album_id);

create index if not exists photo_call_signals_recipient_idx
  on public.photo_call_signals (recipient_id, created_at);

-- =========================================================
-- 2. RLS Y PERMISOS
-- =========================================================

alter table public.photo_albums enable row level security;
alter table public.photo_album_members enable row level security;
alter table public.photos enable row level security;
alter table public.photo_call_signals enable row level security;

revoke all on public.photo_albums,
  public.photo_album_members,
  public.photos,
  public.photo_call_signals
from public, anon, authenticated;

grant select on public.photo_albums,
  public.photo_album_members
to authenticated;

grant select, insert, delete on public.photos,
  public.photo_call_signals
to authenticated;

-- =========================================================
-- 3. FUNCIONES PRIVADAS DE COMPROBACIÓN
-- =========================================================

create or replace function private.is_photo_album_member(p_album_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.photo_album_members as member
    where member.album_id::text = p_album_id
      and member.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_photo_album_member_for_user(
  p_album_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.photo_album_members as member
    where member.album_id = p_album_id
      and member.user_id = p_user_id
  );
$$;

revoke all on function private.is_photo_album_member(text)
  from public, anon;

revoke all on function private.is_photo_album_member_for_user(uuid, uuid)
  from public, anon;

grant usage on schema private to authenticated;

grant execute on function private.is_photo_album_member(text)
  to authenticated;

grant execute on function private.is_photo_album_member_for_user(uuid, uuid)
  to authenticated;

-- =========================================================
-- 4. POLÍTICAS DE ÁLBUMES
-- =========================================================

drop policy if exists "Album members can view their albums"
  on public.photo_albums;

create policy "Album members can view their albums"
  on public.photo_albums
  for select to authenticated
  using (
    (select private.is_photo_album_member(id::text))
  );

drop policy if exists "Members can view album membership"
  on public.photo_album_members;

create policy "Members can view album membership"
  on public.photo_album_members
  for select to authenticated
  using (
    (select private.is_photo_album_member(album_id::text))
  );

-- =========================================================
-- 5. POLÍTICAS DE FOTOGRAFÍAS
-- =========================================================

drop policy if exists "Album members can view photos"
  on public.photos;

create policy "Album members can view photos"
  on public.photos
  for select to authenticated
  using (
    (select private.is_photo_album_member(album_id::text))
  );

drop policy if exists "Members can add their own photos"
  on public.photos;

create policy "Members can add their own photos"
  on public.photos
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_photo_album_member(album_id::text))
    and storage_path like album_id::text
      || '/' || (select auth.uid())::text || '/%'
  );

drop policy if exists "Photo owners can delete their photos"
  on public.photos;

create policy "Photo owners can delete their photos"
  on public.photos
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_photo_album_member(album_id::text))
  );

-- =========================================================
-- 6. SEÑALIZACIÓN PRIVADA DE VIDEOLLAMADAS
-- =========================================================

drop policy if exists "Call participants can read their private signals"
  on public.photo_call_signals;

create policy "Call participants can read their private signals"
  on public.photo_call_signals
  for select to authenticated
  using (
    (
      sender_id = (select auth.uid())
      or recipient_id = (select auth.uid())
    )
    and (select private.is_photo_album_member(album_id::text))
  );

drop policy if exists "Album members can send private call signals"
  on public.photo_call_signals;

create policy "Album members can send private call signals"
  on public.photo_call_signals
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.is_photo_album_member(album_id::text))
    and (
      select private.is_photo_album_member_for_user(album_id, recipient_id)
    )
  );

drop policy if exists "Call participants can delete their private signals"
  on public.photo_call_signals;

create policy "Call participants can delete their private signals"
  on public.photo_call_signals
  for delete to authenticated
  using (
    (
      sender_id = (select auth.uid())
      or recipient_id = (select auth.uid())
    )
    and (select private.is_photo_album_member(album_id::text))
  );

-- =========================================================
-- 7. CREAR ÁLBUM
-- =========================================================

create or replace function public.create_photo_album(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_album public.photo_albums%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para crear un álbum.';
  end if;

  if char_length(trim(coalesce(p_name, ''))) < 1
     or char_length(trim(p_name)) > 60 then
    raise exception 'El nombre debe tener entre 1 y 60 caracteres.';
  end if;

  loop
    begin
      insert into public.photo_albums (name, invite_code, owner_id)
      values (
        trim(p_name),
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
        (select auth.uid())
      )
      returning * into v_album;

      exit;
    exception when unique_violation then
      -- Genera otro código si se produce una colisión.
    end;
  end loop;

  insert into public.photo_album_members (
    album_id,
    user_id,
    display_name
  )
  values (
    v_album.id,
    (select auth.uid()),
    left(
      coalesce(
        nullif(
          trim((select auth.jwt() -> 'user_metadata' ->> 'display_name')),
          ''
        ),
        'PhotoBooth'
      ),
      40
    )
  );

  return jsonb_build_object(
    'id', v_album.id,
    'name', v_album.name,
    'invite_code', v_album.invite_code
  );
end;
$$;

-- =========================================================
-- 8. UNIRSE A UN ÁLBUM
-- =========================================================

create or replace function public.join_photo_album(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_album public.photo_albums%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para unirte a un álbum.';
  end if;

  select *
  into v_album
  from public.photo_albums
  where invite_code = upper(trim(coalesce(p_invite_code, '')));

  if not found then
    raise exception 'No encontramos ese código de invitación.';
  end if;

  insert into public.photo_album_members (
    album_id,
    user_id,
    display_name
  )
  values (
    v_album.id,
    (select auth.uid()),
    left(
      coalesce(
        nullif(
          trim((select auth.jwt() -> 'user_metadata' ->> 'display_name')),
          ''
        ),
        'PhotoBooth'
      ),
      40
    )
  )
  on conflict do nothing;

  return jsonb_build_object(
    'id', v_album.id,
    'name', v_album.name,
    'invite_code', v_album.invite_code
  );
end;
$$;

revoke all on function public.create_photo_album(text)
  from public, anon;

revoke all on function public.join_photo_album(text)
  from public, anon;

grant execute on function public.create_photo_album(text)
  to authenticated;

grant execute on function public.join_photo_album(text)
  to authenticated;

-- =========================================================
-- 9. STORAGE PRIVADO
-- =========================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'photobooth',
  'photobooth',
  false,
  10485760,
  array['image/jpeg']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Album members can read shared booth photos"
  on storage.objects;

create policy "Album members can read shared booth photos"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photobooth'
    and array_length(storage.foldername(name), 1) = 2
    and (
      select private.is_photo_album_member(
        (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists "Album members can upload their booth photos"
  on storage.objects;

create policy "Album members can upload their booth photos"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photobooth'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (
      select private.is_photo_album_member(
        (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists "Photo owners can delete their booth files"
  on storage.objects;

create policy "Photo owners can delete their booth files"
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photobooth'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (
      select private.is_photo_album_member(
        (storage.foldername(name))[1]
      )
    )
  );

-- =========================================================
-- 10. REALTIME
-- =========================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'photos'
  ) then
    alter publication supabase_realtime add table public.photos;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'photo_call_signals'
  ) then
    alter publication supabase_realtime add table public.photo_call_signals;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'photo_album_members'
  ) then
    alter publication supabase_realtime add table public.photo_album_members;
  end if;
end;
$$;