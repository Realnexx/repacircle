begin;

-- Existing accounts intentionally remain incomplete; no personal information is inferred.
alter table public.profiles
 add column first_name text not null default '',
 add column middle_name text not null default '',
 add column last_name text not null default '',
 add column extension_name text not null default '',
 add column gender text not null default 'prefer_not_to_say',
 add column region_code text not null default '',
 add column region_name text not null default '',
 add column province_code text not null default '',
 add column province_name text not null default '',
 add column city_code text not null default '',
 add column city_name text not null default '',
 add column barangay_code text not null default '',
 add column barangay_name text not null default '',
 add column street_address text not null default '',
 add column postal_code text not null default '',
 add column profile_completed_at timestamptz;

alter table public.profiles drop constraint profiles_full_name_check;
alter table public.profiles add constraint profiles_full_name_check check(char_length(full_name)<=170);
alter table public.profiles drop constraint profiles_address_check;
alter table public.profiles add constraint profiles_address_check check(char_length(address)<=600);
alter table public.profiles add constraint personal_profile_valid check (
 char_length(first_name)<=50 and char_length(middle_name)<=50 and char_length(last_name)<=50 and char_length(extension_name)<=10
 and gender in ('female','male','non_binary','self_described','prefer_not_to_say')
 and char_length(street_address)<=150 and postal_code ~ '^([0-9]{4})?$'
 and char_length(region_name)<=100 and char_length(province_name)<=100 and char_length(city_name)<=100 and char_length(barangay_name)<=100
 and (province_code='' or province_code ~ '^[0-9]{9}$')
 and ((province_code='' and province_name='') or (province_code<>'' and btrim(province_name)<>''))
 and (profile_completed_at is null or (
  btrim(first_name)<>'' and btrim(last_name)<>'' and char_length(btrim(street_address))>=2
  and mobile_number ~ '^(09[0-9]{9}|[+]639[0-9]{9})$'
  and region_code ~ '^[0-9]{9}$' and city_code ~ '^[0-9]{9}$' and barangay_code ~ '^[0-9]{9}$'
  and btrim(region_name)<>'' and btrim(city_name)<>'' and btrim(barangay_name)<>''
  and btrim(coalesce(address,''))<>''
 ))
);

-- Retain existing ownership-based SELECT RLS and deny direct client writes.
-- This RPC is the only way clients can mark a profile complete.
create function public.save_personal_profile(details jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); v public.profiles;
begin
 if actor is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
  where u.id=actor and u.email_confirmed_at is not null and p.account_status='active') then
  raise exception 'A verified, active account is required' using errcode='42501';
 end if;
 if jsonb_typeof(details) is distinct from 'object' then raise exception 'Invalid personal information' using errcode='22023';end if;
 v.first_name:=btrim(coalesce(details->>'first_name',''));
 v.middle_name:=btrim(coalesce(details->>'middle_name',''));
 v.last_name:=btrim(coalesce(details->>'last_name',''));
 v.extension_name:=btrim(coalesce(details->>'extension_name',''));
 v.gender:=coalesce(details->>'gender','');
 v.mobile_number:=regexp_replace(coalesce(details->>'mobile_number',''),'[[:space:]()-]','','g');
 v.region_code:=coalesce(details->>'region_code','');v.region_name:=btrim(coalesce(details->>'region_name',''));
 v.province_code:=coalesce(details->>'province_code','');v.province_name:=btrim(coalesce(details->>'province_name',''));
 v.city_code:=coalesce(details->>'city_code','');v.city_name:=btrim(coalesce(details->>'city_name',''));
 v.barangay_code:=coalesce(details->>'barangay_code','');v.barangay_name:=btrim(coalesce(details->>'barangay_name',''));
 v.street_address:=btrim(coalesce(details->>'street_address',''));v.postal_code:=btrim(coalesce(details->>'postal_code',''));
 if v.first_name='' or v.last_name='' or char_length(v.street_address)<2
  or v.mobile_number !~ '^(09[0-9]{9}|[+]639[0-9]{9})$'
  or v.region_code !~ '^[0-9]{9}$' or v.city_code !~ '^[0-9]{9}$' or v.barangay_code !~ '^[0-9]{9}$'
  or v.region_name='' or v.city_name='' or v.barangay_name=''
  or jsonb_typeof(details->'notification_settings') is distinct from 'object' then
  raise exception 'Complete your name, mobile number and PSGC address before continuing' using errcode='22023';
 end if;
 v.full_name:=concat_ws(' ',nullif(v.first_name,''),nullif(v.middle_name,''),nullif(v.last_name,''),nullif(v.extension_name,''));
 v.address:=concat_ws(', ',v.street_address,v.barangay_name,v.city_name,nullif(v.province_name,''),v.region_name,nullif(v.postal_code,''));
 v.avatar_path:=nullif(details->>'avatar_path','');
 if v.avatar_path is not null and (split_part(v.avatar_path,'/',1)<>actor::text or v.avatar_path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$') then
  raise exception 'Invalid avatar path' using errcode='22023';end if;
 update public.profiles p set first_name=v.first_name,middle_name=v.middle_name,last_name=v.last_name,extension_name=v.extension_name,
 gender=v.gender,mobile_number=v.mobile_number,region_code=v.region_code,region_name=v.region_name,
 province_code=v.province_code,province_name=v.province_name,city_code=v.city_code,city_name=v.city_name,
 barangay_code=v.barangay_code,barangay_name=v.barangay_name,street_address=v.street_address,postal_code=v.postal_code,
 full_name=v.full_name,address=v.address,avatar_path=v.avatar_path,notification_settings=details->'notification_settings',
 profile_completed_at=coalesce(p.profile_completed_at,now()),updated_at=now() where p.id=actor;
 insert into public.audit_logs(actor_id,action,entity_id) values(actor,'profile.updated',actor);
end $$;
revoke all on function public.save_personal_profile(jsonb) from public,anon;
grant execute on function public.save_personal_profile(jsonb) to authenticated;

-- Gate existing workspace RPCs, organization RLS and storage policies at their shared account check.
-- Profile reads and the setup RPC remain available so incomplete users can finish onboarding.
create or replace function private.active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=auth.uid()
  and u.email_confirmed_at is not null and p.account_status='active' and p.profile_completed_at is not null);
$$;
commit;
