-- Tournament media bucket and version-safe access policies

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tournament-media',
  'tournament-media',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_manage_tournament_storage(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_parts text[];
  v_tournament_id uuid;
  v_team_id uuid;
begin
  v_parts := storage.foldername(p_object_name);

  if coalesce(array_length(v_parts, 1), 0) < 3 then
    return false;
  end if;

  if v_parts[1] <> 'tournaments' then
    return false;
  end if;

  if v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  v_tournament_id := v_parts[2]::uuid;

  if public.is_tournament_admin(v_tournament_id, auth.uid()) then
    return true;
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 5
     and v_parts[3] = 'teams'
     and v_parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_team_id := v_parts[4]::uuid;

    if public.is_tournament_team_owner(v_team_id, auth.uid()) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tournament_media_public_read'
  ) then
    create policy "tournament_media_public_read"
    on storage.objects
    for select
    using (bucket_id = 'tournament-media');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tournament_media_insert'
  ) then
    create policy "tournament_media_insert"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'tournament-media'
      and public.can_manage_tournament_storage(name)
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tournament_media_update'
  ) then
    create policy "tournament_media_update"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'tournament-media'
      and public.can_manage_tournament_storage(name)
    )
    with check (
      bucket_id = 'tournament-media'
      and public.can_manage_tournament_storage(name)
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'tournament_media_delete'
  ) then
    create policy "tournament_media_delete"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'tournament-media'
      and public.can_manage_tournament_storage(name)
    );
  end if;
end
$$;
