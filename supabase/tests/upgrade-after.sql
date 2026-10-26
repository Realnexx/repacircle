begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
do $$begin
 if public.authorize_operation('91000000-0000-4000-8000-000000000001','organization.staff.manage') then raise exception 'Upgrade failed to require an enrolled MFA factor';end if;
 if (select count(*) from storage.objects where bucket_id='avatars')<>1 then raise exception 'Existing avatar lost or storage grants missing';end if;
 if (select count(*) from public.organizations where name='Existing organization')<>1 then raise exception 'Existing organization lost';end if;
 if (select count(*) from public.organization_members where user_id=auth.uid())<>1 then raise exception 'Existing membership lost';end if;
end $$;
reset role;
do $$begin
 if not (select relrowsecurity from pg_class where oid='private.platform_administrators'::regclass) then raise exception 'Private admin RLS missing';end if;
 if (select count(*) from pg_policies where schemaname='storage' and policyname like 'repacircle_media_%guard')<>5 then raise exception 'Storage guards missing';end if;
 if to_regprocedure('public.create_organization_with_details(text,text,uuid)') is null or to_regprocedure('public.remove_organization_member(uuid,uuid)') is null or to_regprocedure('public.platform_organizations()') is null then raise exception 'New RPC missing';end if;
end $$;
rollback;
