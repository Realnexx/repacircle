-- Run against a disposable local Supabase database after migrations.
begin;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000001','owner@example.test'),('00000000-0000-4000-8000-000000000002','other@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.create_organization('Test Circle','10000000-0000-4000-8000-000000000001');
select public.create_organization('Test Circle','10000000-0000-4000-8000-000000000001');
do $$ begin
 if (select count(*) from public.organizations) <> 1 then raise exception 'Idempotency failed'; end if;
 if (select count(*) from public.organization_members where role='owner') <> 1 then raise exception 'Owner membership missing'; end if;
 if (select count(*) from public.audit_events) <> 1 then raise exception 'Audit missing'; end if;
 begin
  perform public.create_organization('Changed','10000000-0000-4000-8000-000000000001');
  raise exception 'Expected mismatched retry rejection';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.create_organization(' ','10000000-0000-4000-8000-000000000002');
  raise exception 'Expected validation rejection';
 exception when invalid_parameter_value then null; end;
 begin
  insert into public.organization_members values ((select id from public.organizations limit 1),'00000000-0000-4000-8000-000000000002','owner',now());
  raise exception 'Expected direct write denial';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.organizations) then raise exception 'Tenant leak'; end if;
 if exists(select 1 from public.organization_members) then raise exception 'Membership leak'; end if;
 if exists(select 1 from public.audit_events) then raise exception 'Audit leak'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin
  perform public.create_organization('No Caller','10000000-0000-4000-8000-000000000003');
  raise exception 'Expected authentication rejection';
 exception when invalid_authorization_specification then null; end;
end $$;
reset role;
do $$ begin
 begin
  update public.audit_events set action='changed';
  raise exception 'Expected immutable audit rejection';
 exception when raise_exception then
  if sqlerrm <> 'Audit events cannot be changed' then raise; end if;
 end;
end $$;
rollback;
