begin;
create policy phase2_test_legacy_permissive on storage.objects for all to authenticated using(true) with check(true);
-- All fixtures are disposable. Auth schema is supplied by Supabase, or the local runner shim.
insert into auth.users(id,email,email_confirmed_at) values
 ('20000000-0000-4000-8000-000000000001','owner@example.test',now()),
 ('20000000-0000-4000-8000-000000000002','member@example.test',now()),
 ('20000000-0000-4000-8000-000000000003','treasurer@example.test',now()),
 ('20000000-0000-4000-8000-000000000004','outsider@example.test',now()),
 ('20000000-0000-4000-8000-000000000005','admin@example.test',now()),
 ('20000000-0000-4000-8000-000000000006','unverified@example.test',null);
insert into auth.mfa_factors(id,user_id,status,factor_type,created_at,updated_at) values
 ('29000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','verified','totp',now(),now()),
 ('29000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','verified','totp',now(),now()),
 ('29000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','verified','totp',now(),now());
insert into private.platform_administrators(user_id) values('20000000-0000-4000-8000-000000000005');

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$begin
 begin perform public.create_organization('Denied at AAL1','21000000-0000-4000-8000-000000000001');raise exception 'MFA bypass';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('test.org_a',public.create_organization('Circle A','21000000-0000-4000-8000-000000000001')::text,true);
select set_config('test.org_b',public.create_organization('Circle B','21000000-0000-4000-8000-000000000002')::text,true);
select set_config('test.group_a',public.create_group_scope(current_setting('test.org_a')::uuid,'Scope A')::text,true);
select set_config('test.group_b',public.create_group_scope(current_setting('test.org_b')::uuid,'Scope B')::text,true);
select set_config('test.member_invite',public.create_organization_invitation(current_setting('test.org_a')::uuid,'member@example.test','member')::text,true);
select set_config('test.treasurer_invite',public.create_organization_invitation(current_setting('test.org_a')::uuid,'treasurer@example.test','treasurer')::text,true);
select set_config('test.expired_invite',public.create_organization_invitation(current_setting('test.org_a')::uuid,'outsider@example.test','member')::text,true);
do $$begin
 if not (public.get_access_context()->'organizations' @> jsonb_build_array(jsonb_build_object('id',current_setting('test.org_a')))) then raise exception 'Access context missing tenant';end if;
 begin perform public.create_organization_invitation(current_setting('test.org_a')::uuid,'owner@example.test','organizer');raise exception 'Self invite allowed';exception when insufficient_privilege then null;end;
 begin perform public.create_organization_invitation(current_setting('test.org_a')::uuid,'new@example.test','owner');raise exception 'Owner invite allowed';exception when invalid_parameter_value then null;end;
 begin update public.profiles set account_status='active';raise exception 'Profile writes allowed';exception when insufficient_privilege then null;end;
 begin select token_hash from public.organization_invitations;raise exception 'Invitation hashes visible';exception when insufficient_privilege then null;end;
 begin perform public.leave_organization(current_setting('test.org_a')::uuid);raise exception 'Owner left';exception when insufficient_privilege then null;end;
end $$;

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$declare invite jsonb:=current_setting('test.member_invite')::jsonb;begin
 begin perform public.accept_organization_invitation((invite->>'id')::uuid,'wrong-token');raise exception 'Bad token accepted';exception when invalid_parameter_value then null;end;
 perform public.accept_organization_invitation((invite->>'id')::uuid,invite->>'token');
 perform public.accept_organization_invitation((invite->>'id')::uuid,invite->>'token');
 if (select count(*) from public.organization_members where user_id=auth.uid())<>1 then raise exception 'Invitation replay duplicated membership';end if;
 if (select count(*) from public.organizations)<>1 then raise exception 'Cross tenant read';end if;
 if (select count(*) from public.profiles)<>1 then raise exception 'Profile privacy leak';end if;
 if exists(select 1 from public.organization_invitations) then raise exception 'Invitations visible to member';end if;
 if exists(select 1 from public.audit_logs where organization_id is not null) then raise exception 'Tenant audit leak';end if;
 if public.authorize_operation(current_setting('test.org_a')::uuid,'payments.verify') then raise exception 'Member payment authority';end if;
 begin perform public.set_organization_member_role(current_setting('test.org_a')::uuid,auth.uid(),'organizer');raise exception 'Self escalation';exception when insufficient_privilege then null;end;
 begin insert into public.organization_members(organization_id,user_id,role) values(current_setting('test.org_b')::uuid,auth.uid(),'owner');raise exception 'Direct escalation';exception when insufficient_privilege then null;end;
 begin perform public.update_my_profile('Member','09123456789',null,'20000000-0000-4000-8000-000000000001/29000000-0000-4000-8000-000000000001.png','{"email":true,"push":false}');raise exception 'Foreign avatar accepted';exception when invalid_parameter_value then null;end;
 perform public.update_my_profile('Member','09123456789',null,null,'{"email":true,"push":false}');
end $$;
-- Private Storage path policies, including write denial outside the user's directory.
insert into storage.objects(bucket_id,name) values('avatars','20000000-0000-4000-8000-000000000002/29000000-0000-4000-8000-000000000002.png');
do $$begin
 begin insert into storage.objects(bucket_id,name) values('avatars','20000000-0000-4000-8000-000000000001/29000000-0000-4000-8000-000000000002.png');raise exception 'Foreign storage write';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name) values('organization-logos',current_setting('test.org_a')||'/29000000-0000-4000-8000-000000000002.png');raise exception 'Member logo write';exception when insufficient_privilege then null;end;
end $$;

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
do $$declare invite jsonb:=current_setting('test.treasurer_invite')::jsonb;begin
 begin perform public.accept_organization_invitation((invite->>'id')::uuid,invite->>'token');raise exception 'Privileged invite without MFA';exception when insufficient_privilege then null;end;
 begin perform public.accept_organization_invitation((current_setting('test.member_invite')::jsonb->>'id')::uuid,current_setting('test.member_invite')::jsonb->>'token');raise exception 'Wrong email accepted';exception when invalid_parameter_value then null;end;
end $$;
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select public.accept_organization_invitation((current_setting('test.treasurer_invite')::jsonb->>'id')::uuid,current_setting('test.treasurer_invite')::jsonb->>'token');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select public.assign_group_role(current_setting('test.org_a')::uuid,current_setting('test.group_a')::uuid,'20000000-0000-4000-8000-000000000003','treasurer');
do $$begin
 begin perform public.assign_group_role(current_setting('test.org_a')::uuid,current_setting('test.group_b')::uuid,'20000000-0000-4000-8000-000000000003','treasurer');raise exception 'Cross tenant group assignment';exception when insufficient_privilege then null;end;
 begin perform public.set_organization_member_role(current_setting('test.org_a')::uuid,'20000000-0000-4000-8000-000000000002','organizer');raise exception 'Promotion without MFA enrollment';exception when invalid_parameter_value then null;end;
end $$;
insert into storage.objects(bucket_id,name) values('organization-logos',current_setting('test.org_a')||'/29000000-0000-4000-8000-000000000002.png');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
do $$begin
 if not public.authorize_operation(current_setting('test.org_a')::uuid,'payments.cash.record',current_setting('test.group_a')::uuid) then raise exception 'Assigned group access missing';end if;
 if public.authorize_operation(current_setting('test.org_a')::uuid,'payments.cash.record') then raise exception 'Treasurer got organization-wide authority';end if;
 if public.authorize_operation(current_setting('test.org_b')::uuid,'payments.cash.record',current_setting('test.group_a')::uuid) then raise exception 'Cross tenant cash authority';end if;
 if public.authorize_operation(current_setting('test.org_a')::uuid,'payments.verify',current_setting('test.group_a')::uuid) then raise exception 'Treasurer got verification authority';end if;
 if (select count(*) from public.group_scopes)<>1 then raise exception 'Group scope isolation failed';end if;
 if (select count(*) from storage.objects)<>1 then raise exception 'Private avatar exposed to treasurer';end if;
end $$;
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$begin
 if public.authorize_operation(current_setting('test.org_a')::uuid,'payments.cash.record',current_setting('test.group_a')::uuid) then raise exception 'AAL1 privileged access';end if;
end $$;

reset role;
update public.organization_invitations set expires_at=now()-interval '1 minute' where id=(current_setting('test.expired_invite')::jsonb->>'id')::uuid;
insert into public.organization_closure_blocks(organization_id,source_kind,source_id,reason) values(current_setting('test.org_a')::uuid,'test',gen_random_uuid(),'Unresolved obligations');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
do $$begin
 begin perform public.accept_organization_invitation((current_setting('test.expired_invite')::jsonb->>'id')::uuid,current_setting('test.expired_invite')::jsonb->>'token');raise exception 'Expired invitation accepted';exception when invalid_parameter_value then null;end;
 if exists(select 1 from public.organizations) then raise exception 'Unrelated organization visible';end if;
 if exists(select 1 from storage.objects) then raise exception 'Storage tenant isolation failed';end if;
 begin perform public.platform_analytics();raise exception 'Ordinary user got analytics';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
do $$begin
 begin perform public.archive_organization(current_setting('test.org_a')::uuid);raise exception 'Unresolved archive allowed';exception when invalid_parameter_value then null;end;
 begin delete from public.organizations where id=current_setting('test.org_a')::uuid;raise exception 'Hard deletion allowed';exception when insufficient_privilege then null;end;
 begin perform public.set_organization_member_role(current_setting('test.org_a')::uuid,auth.uid(),'member');raise exception 'Self demotion allowed';exception when insufficient_privilege then null;end;
end $$;
select public.archive_organization(current_setting('test.org_b')::uuid);
-- Invitation revocation and ownership transfer never create an ownerless tenant.
select set_config('test.revoked_invite',public.create_organization_invitation(current_setting('test.org_a')::uuid,'outsider@example.test','member')::text,true);
select public.revoke_organization_invitation((current_setting('test.revoked_invite')::jsonb->>'id')::uuid);
select set_config('test.org_c',public.create_organization_with_details('Circle C','Description','21000000-0000-4000-8000-000000000004')::text,true);
select set_config('test.transfer_invite',public.create_organization_invitation(current_setting('test.org_c')::uuid,'treasurer@example.test','member')::text,true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select public.accept_organization_invitation((current_setting('test.transfer_invite')::jsonb->>'id')::uuid,current_setting('test.transfer_invite')::jsonb->>'token');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select public.transfer_organization_ownership(current_setting('test.org_c')::uuid,'20000000-0000-4000-8000-000000000003');
select public.leave_organization(current_setting('test.org_c')::uuid);
do $$begin
 if exists(select 1 from public.organizations where id=current_setting('test.org_c')::uuid) then raise exception 'Former member retained tenant access';end if;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
do $$begin
 begin perform public.accept_organization_invitation((current_setting('test.revoked_invite')::jsonb->>'id')::uuid,current_setting('test.revoked_invite')::jsonb->>'token');raise exception 'Revoked invite accepted';exception when invalid_parameter_value then null;end;
end $$;

-- An existing ON CONFLICT row in another tenant must not be writable through an RPC.
reset role;
insert into public.organization_members(organization_id,user_id,role) values(current_setting('test.org_b')::uuid,'20000000-0000-4000-8000-000000000002','member');
insert into public.group_role_assignments(organization_id,group_id,user_id,role,assigned_by) values(current_setting('test.org_b')::uuid,current_setting('test.group_b')::uuid,'20000000-0000-4000-8000-000000000002','member','20000000-0000-4000-8000-000000000001');
update auth.users set raw_user_meta_data='{"role":"super_administrator","is_admin":true}' where id='20000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
do $$begin
 begin perform public.assign_group_role(current_setting('test.org_a')::uuid,current_setting('test.group_b')::uuid,'20000000-0000-4000-8000-000000000002','member');raise exception 'Cross tenant conflict write';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
do $$begin
 if jsonb_array_length(public.get_access_context()->'platform_permissions')<>0 then raise exception 'User metadata escalated permissions';end if;
end $$;

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000006',true);
do $$begin
 begin perform public.create_organization('Not verified','21000000-0000-4000-8000-000000000003');raise exception 'Unverified creation';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000005',true);
select public.platform_analytics();
select public.platform_accounts();
select public.platform_organizations();
select public.set_account_status('20000000-0000-4000-8000-000000000002','suspended');
select public.update_platform_settings('support@example.test');
do $$begin
 begin perform public.set_account_status(auth.uid(),'suspended');raise exception 'Admin self suspension allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$begin
 begin perform public.platform_accounts();raise exception 'Admin without MFA';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
do $$begin
 if exists(select 1 from public.organizations) then raise exception 'Suspended tenant access';end if;
 if jsonb_array_length(public.get_access_context()->'organizations')<>0 then raise exception 'Suspended context leak';end if;
 begin perform public.update_my_profile('Suspended','',null,null,'{"email":true,"push":true}');raise exception 'Suspended write allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 begin perform public.get_access_context();raise exception 'Missing session accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 begin update public.audit_logs set action='forged';raise exception 'Audit mutation allowed';exception when raise_exception then if sqlerrm<>'Audit events cannot be changed' then raise;end if;end;
end $$;
set local role anon;
do $$begin
 begin perform public.get_access_context();raise exception 'Anonymous RPC execution allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;
