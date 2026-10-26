begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('avatars','avatars',false,2097152,array['image/png','image/jpeg','image/webp']),
 ('organization-logos','organization-logos',false,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function private.media_access(bucket text,object_name text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare target uuid;
begin
 if not private.active_user() or object_name !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$' then return false;end if;
 if bucket='avatars' then return split_part(object_name,'/',1)=auth.uid()::text;end if;
 if bucket='organization-logos' then
  select id into target from public.organizations where id::text=split_part(object_name,'/',1) and status='active';
  return target is not null and case when writing then private.authorized(target,'organization.update') else private.is_organization_member(target) end;
 end if;
 return false;
end $$;
revoke all on function private.media_access(text,text,boolean) from public,anon;
grant execute on function private.media_access(text,text,boolean) to authenticated;
create policy repacircle_media_read on storage.objects for select to authenticated using(bucket_id in ('avatars','organization-logos') and private.media_access(bucket_id,name,false));
create policy repacircle_media_insert on storage.objects for insert to authenticated with check(bucket_id in ('avatars','organization-logos') and private.media_access(bucket_id,name,true));
create policy repacircle_media_update on storage.objects for update to authenticated using(bucket_id in ('avatars','organization-logos') and private.media_access(bucket_id,name,true)) with check(bucket_id in ('avatars','organization-logos') and private.media_access(bucket_id,name,true));
create policy repacircle_media_delete on storage.objects for delete to authenticated using(bucket_id in ('avatars','organization-logos') and private.media_access(bucket_id,name,true));
-- Restrictive namespace guards also protect these buckets from pre-existing broad policies.
create policy repacircle_media_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id not in ('avatars','organization-logos') or private.media_access(bucket_id,name,false));
create policy repacircle_media_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id not in ('avatars','organization-logos') or private.media_access(bucket_id,name,true));
create policy repacircle_media_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id not in ('avatars','organization-logos') or private.media_access(bucket_id,name,true)) with check(bucket_id not in ('avatars','organization-logos') or private.media_access(bucket_id,name,true));
create policy repacircle_media_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id not in ('avatars','organization-logos') or private.media_access(bucket_id,name,true));
create policy repacircle_media_anon_guard on storage.objects as restrictive for all to anon using(bucket_id not in ('avatars','organization-logos')) with check(bucket_id not in ('avatars','organization-logos'));
commit;
