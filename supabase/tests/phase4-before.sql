begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('70000000-0000-4000-8000-000000000001','phase4owner@example.test',now()),
 ('70000000-0000-4000-8000-000000000002','phase4member@example.test',now()),
 ('70000000-0000-4000-8000-000000000003','phase4incoming@example.test',now()),
 ('70000000-0000-4000-8000-000000000004','phase4outsider@example.test',now()),
 ('70000000-0000-4000-8000-000000000005','phase4staff@example.test',now()),
 ('70000000-0000-4000-8000-000000000006','phase4invite@example.test',now()),
 ('70000000-0000-4000-8000-000000000007','phase4unrelated@example.test',now());
update public.profiles set first_name='Phase',last_name='Four',full_name='Phase Four',mobile_number='09123456789',region_code='130000000',region_name='NCR',city_code='137404000',city_name='Quezon City',barangay_code='137404001',barangay_name='Alicia',street_address='12 Test Street',address='12 Test Street, Alicia',profile_completed_at=now() where id::text like '70000000-%';
insert into auth.mfa_factors(user_id,status,factor_type) values('70000000-0000-4000-8000-000000000001','verified','totp'),('70000000-0000-4000-8000-000000000005','verified','totp');
insert into public.organizations(id,name,created_by,request_id) values('70000000-0000-4000-8000-000000000010','Membership test organization','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000011');
insert into public.organization_members(organization_id,user_id,role) values
 ('70000000-0000-4000-8000-000000000010','70000000-0000-4000-8000-000000000001','owner'),
 ('70000000-0000-4000-8000-000000000010','70000000-0000-4000-8000-000000000002','member'),
 ('70000000-0000-4000-8000-000000000010','70000000-0000-4000-8000-000000000003','member'),
 ('70000000-0000-4000-8000-000000000010','70000000-0000-4000-8000-000000000005','treasurer');
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
do $$declare c jsonb:=current_setting('test.rotating')::jsonb;gid uuid;vid uuid;begin
 c:=jsonb_set(c,'{basic,organization_id}','"70000000-0000-4000-8000-000000000010"');
 c:=jsonb_set(c,'{basic,name}','"Legacy active group"');c:=jsonb_set(c,'{basic,visibility}','"organization"');
 c:=jsonb_set(c,'{basic,start_date}',to_jsonb((now() at time zone 'UTC')::date::text));c:=jsonb_set(c,'{schedule,start_date}',c#>'{basic,start_date}');
 c:=jsonb_set(c,'{schedule,timezone}','"UTC"');c:=jsonb_set(c,'{schedule,cutoff_time}','"00:00"');c:=jsonb_set(c,'{membership,invitation_rule}','"members_can_request"');
 gid:=public.save_repa_draft('70000000-0000-4000-8000-000000000010',null,0,c,'Legacy phase 3 configuration',now());vid:=(public.get_repa_group(gid)#>>'{group,latest_version_id}')::uuid;
 perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000001',true);perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000002',true);
 perform public.consent_repa_rules(vid,'{}');perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);perform public.consent_repa_rules(vid,'{}');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);perform public.activate_repa_group(gid,vid,true);
 perform set_config('test.phase4_group',gid::text,false);perform set_config('test.phase4_version',vid::text,false);perform set_config('test.phase4_config',c::text,false);
end $$;
commit;
