-- Simulate earlier deployed function/policy versions, with existing records.
drop function public.create_organization_with_details(text,text,uuid);
drop function public.remove_organization_member(uuid,uuid);
drop function public.platform_organizations();
drop trigger platform_grant_audit on private.platform_administrators;
alter table private.platform_administrators disable row level security;
create or replace function private.verified_mfa() returns boolean language sql stable security definer set search_path='' as $$select coalesce(auth.jwt()->>'aal','aal1')='aal2';$$;
drop policy repacircle_media_read_guard on storage.objects;
drop policy repacircle_media_insert_guard on storage.objects;
drop policy repacircle_media_update_guard on storage.objects;
drop policy repacircle_media_delete_guard on storage.objects;
drop policy repacircle_media_anon_guard on storage.objects;
insert into auth.users(id,email,email_confirmed_at) values('90000000-0000-4000-8000-000000000001','upgrade@example.test',now());
update public.profiles set full_name='Keep my edited name',mobile_number='+639123456789' where id='90000000-0000-4000-8000-000000000001';
insert into public.organizations(id,name,created_by,request_id) values('91000000-0000-4000-8000-000000000001','Existing organization','90000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001');
insert into public.organization_members(organization_id,user_id,role) values('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','owner');
insert into public.organization_invitations(organization_id,email,role,token_hash,invited_by) values('91000000-0000-4000-8000-000000000001','pending@example.test','member','unchanged-hash','90000000-0000-4000-8000-000000000001');
insert into storage.objects(bucket_id,name) values('avatars','90000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001.png');
