begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('40000000-0000-4000-8000-000000000001','setup@example.test',now()),
 ('40000000-0000-4000-8000-000000000002','other@example.test',now()),
 ('40000000-0000-4000-8000-000000000003','unconfirmed@example.test',null);
insert into auth.mfa_factors(user_id,status,factor_type) values('40000000-0000-4000-8000-000000000001','verified','totp');
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
do $$begin
 if (select profile_completed_at is not null from public.profiles where id=auth.uid()) then raise exception 'New account already complete';end if;
 if (select count(*) from public.profiles)<>1 then raise exception 'Other profiles visible';end if;
 begin perform public.create_organization('Bypass attempt','41000000-0000-4000-8000-000000000001');raise exception 'Incomplete account bypassed setup';exception when insufficient_privilege then null;end;
 begin update public.profiles set profile_completed_at=now() where id=auth.uid();raise exception 'Direct completion allowed';exception when insufficient_privilege then null;end;
 begin perform public.save_personal_profile('{}');raise exception 'Empty setup accepted';exception when invalid_parameter_value then null;end;
end $$;
select set_config('test.personal', '{"first_name":" Maria ","middle_name":"","last_name":"Cruz","extension_name":"","gender":"prefer_not_to_say","mobile_number":"+63 912 345 6789","region_code":"130000000","region_name":"NCR","province_code":"","province_name":"","city_code":"137404000","city_name":"Quezon City","barangay_code":"137404001","barangay_name":"Alicia","street_address":"12 Test Street","postal_code":"1105","notification_settings":{"email":true,"push":false},"account_status":"suspended","id":"40000000-0000-4000-8000-000000000002"}', true);
select public.save_personal_profile(current_setting('test.personal')::jsonb);
do $$declare stamp timestamptz;begin
 if not exists(select 1 from public.profiles where id=auth.uid() and first_name='Maria' and full_name='Maria Cruz' and mobile_number='+639123456789' and profile_completed_at is not null and account_status='active') then raise exception 'Setup not persisted or ownership/status changed';end if;
 select profile_completed_at into stamp from public.profiles where id=auth.uid();
 perform public.save_personal_profile(current_setting('test.personal')::jsonb);
 if (select profile_completed_at from public.profiles where id=auth.uid())<>stamp then raise exception 'Completion timestamp reset';end if;
 begin perform public.save_personal_profile(current_setting('test.personal')::jsonb || '{"mobile_number":"123"}');raise exception 'Bad phone accepted';exception when invalid_parameter_value then null;end;
 begin perform public.save_personal_profile(current_setting('test.personal')::jsonb || '{"first_name":""}');raise exception 'Empty first name accepted';exception when invalid_parameter_value then null;end;
 begin perform public.save_personal_profile(current_setting('test.personal')::jsonb || '{"barangay_code":""}');raise exception 'Missing PSGC accepted';exception when invalid_parameter_value then null;end;
 begin perform public.save_personal_profile(current_setting('test.personal')::jsonb || '{"avatar_path":"40000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000001.png"}');raise exception 'Other avatar accepted';exception when invalid_parameter_value then null;end;
end $$;
-- Workspace account check now passes (MFA factor is still independently required where relevant).
select public.create_organization('Completed account','41000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000003',true);
do $$begin
 begin perform public.save_personal_profile(current_setting('test.personal')::jsonb);raise exception 'Unverified setup allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if exists(select 1 from public.profiles where id='40000000-0000-4000-8000-000000000002' and profile_completed_at is not null) then raise exception 'Other account changed';end if;
end $$;
update public.profiles set account_status='suspended' where id='40000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000002',true);
do $$begin
 begin perform public.save_personal_profile(current_setting('test.personal')::jsonb);raise exception 'Suspended setup allowed';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$begin
 begin perform public.save_personal_profile(current_setting('test.personal')::jsonb);raise exception 'Anonymous setup allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;
