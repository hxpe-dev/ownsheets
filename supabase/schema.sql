-- ownSheets: complete database schema
-- Run this once against a fresh Supabase project (SQL Editor -> Run).
-- Tested on Postgres 15 / Supabase projects created after 2026-05-30.


-- Extensions

create extension if not exists pgcrypto;


-- Tables

-- sheets: one row per PDF, owned by a single auth user.
create table public.sheets (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  title       text        not null,
  composer    text,
  arranger    text,
  key         text,
  difficulty  smallint    check (difficulty between 1 and 10),
  page_count  int,
  file_path   text        not null,
  notes       text,
  tags        text[]      not null default '{}',
  search      tsvector,                        -- maintained by trigger below
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index sheets_tags_gin   on public.sheets using gin(tags);
create index sheets_search_gin on public.sheets using gin(search);

-- setlists: named, ordered collections of sheets.
create table public.setlists (
  id         uuid        primary key default gen_random_uuid(),
  owner_id   uuid        not null references auth.users(id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- setlist_items: junction table preserving sheet order within a setlist.
create table public.setlist_items (
  setlist_id uuid not null references public.setlists(id) on delete cascade,
  sheet_id   uuid not null references public.sheets(id)   on delete cascade,
  position   int  not null,
  primary key (setlist_id, sheet_id)
);

-- annotations: per-page overlay data (phase 2: table present now, used later).
create table public.annotations (
  id         uuid        primary key default gen_random_uuid(),
  owner_id   uuid        not null references auth.users(id) on delete cascade,
  sheet_id   uuid        not null references public.sheets(id) on delete cascade,
  page       int         not null,
  data       jsonb       not null default '{}',
  updated_at timestamptz not null default now()
);

-- access_codes: guest access codes created by the owner, stored as SHA-256 hashes.
create table public.access_codes (
  id         uuid        primary key default gen_random_uuid(),
  label      text        not null,
  code_hash  text        not null unique,
  created_at timestamptz not null default now()
);

-- validated_guests: one row per browser/device that has validated a code.
-- device_id is a UUID stored in localStorage, stable across sign-out/sign-in cycles.
-- user_id holds the current anonymous Supabase user (updated on re-authentication).
-- Deleting a code cascade-deletes all device rows for instant access revocation.
create table public.validated_guests (
  device_id     text         primary key,
  user_id       uuid         not null,
  code_id       uuid         not null references public.access_codes(id) on delete cascade,
  created_at    timestamptz  not null default now(),
  last_seen_at   timestamptz not null default now(),
  download_count int         not null default 0,
  download_bytes bigint      not null default 0
);

create index validated_guests_user_id_idx on public.validated_guests(user_id);


-- Full-text search trigger

create function public.sheets_search_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search := to_tsvector(
    'english'::regconfig,
    coalesce(new.title, '')    || ' ' ||
    coalesce(new.composer, '') || ' ' ||
    array_to_string(new.tags, ' ')
  );
  return new;
end;
$$;

create trigger sheets_search_update
  before insert or update on public.sheets
  for each row execute function public.sheets_search_update();


-- Auth helper functions

-- validate_guest_code: called by the frontend after anonymous sign-in.
-- Checks the SHA-256 hash against access_codes; on success writes a validated_guests row so RLS policies can recognise this anonymous user.
create function public.validate_guest_code(p_code_hash text, p_device_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_id uuid;
begin
  select id into v_code_id
  from public.access_codes
  where code_hash = p_code_hash;

  if v_code_id is null then
    return false;
  end if;

  -- Upsert by device_id so the same browser always maps to the same row, even after sign-out. user_id is updated to the current anonymous session.
  insert into public.validated_guests (device_id, user_id, code_id, last_seen_at)
  values (p_device_id, auth.uid(), v_code_id, now())
  on conflict (device_id) do update
    set user_id      = auth.uid(),
        code_id      = v_code_id,
        last_seen_at = now();

  return true;
end;
$$;

-- touch_guest_session: called when a guest opens the app to update last_seen_at.
create function public.touch_guest_session()
returns void
language sql
security definer
set search_path = public
as $$
  update public.validated_guests set last_seen_at = now() where user_id = auth.uid();
$$;

-- record_guest_download: increments download_count and adds file bytes for the calling guest device.
create function public.record_guest_download(p_bytes bigint default 0)
returns void
language sql
security definer
set search_path = public
as $$
  update public.validated_guests
  set download_count = download_count + 1,
      download_bytes = download_bytes + p_bytes
  where user_id = auth.uid();
$$;

-- record_guest_egress: adds bytes to egress tracking without incrementing download_count.
-- Called when Supabase Storage serves a PDF to a guest (thumbnail generation or PDF viewing).
create function public.record_guest_egress(p_bytes bigint default 0)
returns void
language sql
security definer
set search_path = public
as $$
  update public.validated_guests
  set download_bytes = download_bytes + p_bytes
  where user_id = auth.uid();
$$;

-- get_storage_usage: returns total bytes used in the sheets bucket.
-- Called by the owner's Settings page to show the storage progress bar.
create function public.get_storage_usage()
returns bigint
language sql
security definer
stable
set search_path = storage, public
as $$
  select coalesce(sum((metadata->>'size')::bigint), 0)
  from storage.objects
  where bucket_id = 'sheets';
$$;

-- is_validated_guest: stable helper called inside RLS policies.
-- Stable + security definer means the sub-select runs once per query, not per row.
create function public.is_validated_guest()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.validated_guests where user_id = auth.uid()
  );
$$;


-- Row Level Security

alter table public.sheets           enable row level security;
alter table public.setlists         enable row level security;
alter table public.setlist_items    enable row level security;
alter table public.annotations      enable row level security;
alter table public.access_codes     enable row level security;
alter table public.validated_guests enable row level security;

-- sheets
create policy "owner full access" on public.sheets for all
  using  (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "guest read" on public.sheets for select
  using (public.is_validated_guest());

-- setlists
create policy "owner full access" on public.setlists for all
  using  (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "guest read" on public.setlists for select
  using (public.is_validated_guest());

-- setlist_items
create policy "owner full access" on public.setlist_items for all
  using (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id and s.owner_id = auth.uid()
    )
  );

create policy "guest read" on public.setlist_items for select
  using (public.is_validated_guest());

-- annotations
create policy "owner full access" on public.annotations for all
  using  (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "guest read" on public.annotations for select
  using (public.is_validated_guest());

-- access_codes: owner (non-guest authenticated user) can insert/delete.
-- everyone (including anon) can select for login validation.
create policy "public read" on public.access_codes for select
  using (true);

create policy "owner insert" on public.access_codes for insert
  to authenticated
  with check (not public.is_validated_guest());

create policy "owner delete" on public.access_codes for delete
  to authenticated
  using (not public.is_validated_guest());

-- validated_guests: users can only see their own row (revocation check on load).
-- Owner (non-guest authenticated user) can read all rows to see usage stats.
create policy "own record only" on public.validated_guests for select
  using (user_id = auth.uid());

create policy "owner read all" on public.validated_guests for select
  to authenticated
  using (not public.is_validated_guest());


-- Storage

insert into storage.buckets (id, name, public)
values ('sheets', 'sheets', false)
on conflict do nothing;

-- Owner: full control over their own folder (path prefix = their user id).
create policy "owner upload" on storage.objects for insert
  with check (
    bucket_id = 'sheets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "owner read" on storage.objects for select
  using (
    bucket_id = 'sheets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "owner delete" on storage.objects for delete
  using (
    bucket_id = 'sheets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Guests: read any file in the bucket (all files belong to the single owner).
create policy "guest read" on storage.objects for select
  using (
    bucket_id = 'sheets'
    and public.is_validated_guest()
  );


-- Grants

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.sheets           to authenticated;
grant select, insert, update, delete on public.setlists         to authenticated;
grant select, insert, update, delete on public.setlist_items    to authenticated;
grant select, insert, update, delete on public.annotations      to authenticated;
grant select, insert, delete         on public.access_codes     to authenticated;
grant select                         on public.access_codes     to anon;
grant select                         on public.validated_guests to authenticated, anon;

grant usage, select on all sequences in schema public to authenticated;

-- Revoke from both PUBLIC and explicit anon to ensure clean grants.
revoke execute on function public.get_storage_usage()             from public, anon;
revoke execute on function public.record_guest_download(bigint)   from public, anon;
revoke execute on function public.record_guest_egress(bigint)     from public, anon;
revoke execute on function public.touch_guest_session()           from public, anon;
revoke execute on function public.validate_guest_code(text, text) from public, anon;
revoke execute on function public.is_validated_guest()            from public;

-- get_storage_usage: owner only
grant execute on function public.get_storage_usage()             to authenticated;
-- record_guest_download, touch_guest_session: guests are authenticated users
grant execute on function public.record_guest_download(bigint)   to authenticated;
grant execute on function public.record_guest_egress(bigint)     to authenticated;
grant execute on function public.touch_guest_session()           to authenticated;
-- validate_guest_code: called after signInAnonymously() so user is already authenticated (not anon)
grant execute on function public.validate_guest_code(text, text) to authenticated;
-- is_validated_guest: used in RLS policies, anon requests also trigger RLS so anon needs EXECUTE
grant execute on function public.is_validated_guest()            to anon, authenticated;
