begin;
create function pg_temp.phase6_activate(c jsonb) returns uuid language plpgsql as $$declare gid uuid;vid uuid;policy uuid;begin
 gid:=public.save_repa_draft('70000000-0000-4000-8000-000000000010',null,0,c,'Phase Six test group accepted rules',now());vid:=(public.get_repa_group(gid)#>>'{group,latest_version_id}')::uuid;
 perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000001',true);perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000002',true);
 policy:=public.publish_group_agreement_policy(gid,vid,'Existing obligations remain recorded and exits require documented approval.','Submit evidence to the organizer and escalate unresolved disputes to the owner.','Contact details are restricted to authorized group administration and financial history is retained.');
 perform public.accept_group_agreement(gid,vid,policy,current_setting('test.phase6_ack')::jsonb,'{}');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);perform public.accept_group_agreement(gid,vid,policy,current_setting('test.phase6_ack')::jsonb,'{}');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);perform public.activate_repa_group(gid,vid,true);return gid;end $$;
-- The new scheduler must match the date semantics exposed by the browser.
do $$declare s jsonb:='{"frequency":"monthly","every_days":1,"start_date":"2028-01-31","cutoff_time":"23:30","timezone":"Asia/Manila","grace_hours":2}';dates date[];begin
 select array_agg(local_date order by round_number) into dates from private.ce_dates(s,3);if dates is distinct from array['2028-01-31','2028-02-29','2028-03-31']::date[] then raise exception 'Leap year/month-end anchor failed: %',dates;end if;
 s:=jsonb_set(s,'{start_date}','"2027-01-31"');select array_agg(local_date order by round_number) into dates from private.ce_dates(s,3);if dates[2] is distinct from '2027-02-28'::date then raise exception 'Nonleap month end';end if;
 s:=jsonb_set(jsonb_set(s,'{frequency}','"weekdays"'),'{weekdays}','[1,5]');select array_agg(local_date order by round_number) into dates from private.ce_dates(s,3);if dates is distinct from array['2027-02-01','2027-02-05','2027-02-08']::date[] then raise exception 'Weekday dates incorrect: %',dates;end if;
 s:=jsonb_set(jsonb_set(s,'{frequency}','"monthly_dates"'),'{monthly_dates}','[31]');select array_agg(local_date order by round_number) into dates from private.ce_dates(s,3);if dates is distinct from array['2027-01-31','2027-03-31','2027-05-31']::date[] then raise exception 'Invalid monthly dates must be skipped: %',dates;end if;
 s:=jsonb_set(jsonb_set(s,'{frequency}','"daily"'),'{start_date}','"2028-02-28"');select array_agg(local_date order by round_number) into dates from private.ce_dates(s,3);if dates is distinct from array['2028-02-28','2028-02-29','2028-03-01']::date[] then raise exception 'Daily leap schedule';end if;
 s:=jsonb_set(s,'{frequency}','"weekly"');select array_agg(local_date order by round_number) into dates from private.ce_dates(s,2);if dates[2] is distinct from '2028-03-06'::date then raise exception 'Weekly leap schedule';end if;
 s:=jsonb_set(s,'{frequency}','"biweekly"');select array_agg(local_date order by round_number) into dates from private.ce_dates(s,2);if dates[2] is distinct from '2028-03-13'::date then raise exception 'Biweekly schedule';end if;
 s:=jsonb_set(jsonb_set(s,'{frequency}','"custom_dates"'),'{custom_dates}','["2028-02-29","2028-03-05"]');select array_agg(local_date order by round_number) into dates from private.ce_dates(s,2);if dates[1] is distinct from '2028-02-29'::date then raise exception 'Custom schedule';end if;
 begin perform * from private.ce_dates(jsonb_set(s,'{custom_dates}','["2028-03-05","2028-03-05"]'),2);raise exception 'Duplicate custom dates accepted';exception when invalid_parameter_value then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('test.phase6_ack','{"contribution":true,"schedule":true,"deadlines":true,"reward":true,"mechanism":true,"selection":true,"late_policy":true,"refund_exit":true,"disputes":true,"privacy":true}',true);
do $$declare c jsonb:=current_setting('test.phase4_config')::jsonb;gid uuid;vid uuid;policy uuid;oid uuid;m uuid;r uuid;state jsonb;cfg jsonb;begin
 c:=jsonb_set(c,'{basic,name}','"Phase Six contributions"');c:=jsonb_set(c,'{contribution,amount_minor}','100000');c:=jsonb_set(c,'{reward,unit_cost_minor}','100000');c:=jsonb_set(c,'{contribution,partial_payments}','true');c:=jsonb_set(c,'{payment,methods}','["cash","gcash_manual"]');c:=jsonb_set(c,'{payment,instructions}','"Staff verify cash receipts and transfer evidence before recording a contribution."');c:=jsonb_set(c,'{schedule,timezone}','"Asia/Manila"');c:=jsonb_set(c,'{schedule,cutoff_time}','"23:30"');c:=jsonb_set(c,'{schedule,grace_hours}','2');
 c:=jsonb_set(c,'{schedule,frequency}','"custom_dates"');c:=jsonb_set(c,'{schedule,custom_dates}',jsonb_build_array(c#>>'{basic,start_date}',((c#>>'{basic,start_date}')::date+7)::text));
 gid:=public.save_repa_draft('70000000-0000-4000-8000-000000000010',null,0,c,'Phase Six accepted custom schedule',now());cfg:=public.get_repa_group(gid)->'configuration';
 if cfg#>>'{schedule,custom_dates,1}' is distinct from c#>>'{schedule,custom_dates,1}' then raise exception 'Custom schedule not stored in typed version';end if;
 vid:=(public.get_repa_group(gid)#>>'{group,latest_version_id}')::uuid;
 perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000001',true);perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000002',true);
 policy:=public.publish_group_agreement_policy(gid,vid,'Existing obligations remain recorded and exits require documented approval.','Submit evidence to the organizer and escalate unresolved disputes to the owner.','Contact details are restricted to authorized group administration and financial history is retained.');
 perform public.accept_group_agreement(gid,vid,policy,current_setting('test.phase6_ack')::jsonb,'{}');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);perform public.accept_group_agreement(gid,vid,policy,current_setting('test.phase6_ack')::jsonb,'{}');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);perform public.activate_repa_group(gid,vid,true);
 if (public.get_contribution_workspace(gid)->>'total')::integer<>4 then raise exception 'Activation did not generate every obligation';end if;
 select o.id,o.original_member_id into oid,m from public.group_member_obligations o join public.group_members gm on gm.id=o.original_member_id where o.group_id=gid and gm.user_id=auth.uid() and o.round_number=1;
 state:=public.get_contribution_obligation(oid)->'obligation';if (state->>'due_at')::timestamptz is distinct from (((c#>>'{basic,start_date}')::date+time '23:30') at time zone 'Asia/Manila') then raise exception 'Manila timezone cutoff incorrect: %',state;end if;
 r:=public.record_verified_contribution(oid,40000,'cash','phase6-cash-400','Verified cash receipt with signed acknowledgement.','76000000-0000-4000-8000-000000000001');
 if public.record_verified_contribution(oid,40000,'cash','phase6-cash-400','Verified cash receipt with signed acknowledgement.','76000000-0000-4000-8000-000000000001') is distinct from r then raise exception 'Receipt retry was not idempotent';end if;
 state:=public.get_contribution_obligation(oid)->'obligation';if state->>'status' is distinct from 'partially_paid' or state->>'remaining_minor' is distinct from '60000' then raise exception 'Partial contribution calculation incorrect: %',state;end if;
 begin perform public.record_verified_contribution(oid,40001,'cash','phase6-cash-400','Verified cash receipt with signed acknowledgement.','76000000-0000-4000-8000-000000000001');raise exception 'Changed retry accepted';exception when serialization_failure then null;end;
 begin perform public.record_verified_contribution(oid,60001,'cash','phase6-overpayment','Verified excess cash must be rejected.','76000000-0000-4000-8000-000000000002');raise exception 'Overpayment accepted';exception when invalid_parameter_value then null;end;
 perform public.record_verified_contribution(oid,60000,'gcash_manual','phase6-gcash-600','Verified GCash transfer against bank reference.','76000000-0000-4000-8000-000000000003');
 state:=public.get_contribution_obligation(oid)->'obligation';if state->>'status' is distinct from 'paid' or state->>'remaining_minor' is distinct from '0' or state->>'verified_minor' is distinct from '100000' then raise exception 'Mixed-method settlement incorrect: %',state;end if;
 if jsonb_array_length(public.get_contribution_obligation(oid)->'payments')<>2 then raise exception 'Payment history duplicated or missing';end if;
 perform set_config('test.phase6_group',gid::text,true);perform set_config('test.phase6_paid',oid::text,true);perform set_config('test.phase6_version',vid::text,true);
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 if (public.get_contribution_workspace(gid)->>'total')::integer<>2 then raise exception 'Member read another person obligations';end if;
 begin perform public.get_contribution_obligation(oid);raise exception 'Cross-member obligation read';exception when insufficient_privilege then null;end;
 begin perform public.record_verified_contribution(oid,1,'cash','unauthorized-credit','An unprivileged member must never verify payment.','76000000-0000-4000-8000-000000000004');raise exception 'Unauthorized verification';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
end $$;
-- Reviewed fees are charged exactly once, with immutable extensions and waivers.
do $$declare c jsonb:=current_setting('test.phase4_config')::jsonb;gid uuid;oid uuid;other uuid;m uuid;fee jsonb;state jsonb;id uuid;old_due timestamptz;vid uuid;begin
 c:=jsonb_set(c,'{basic,name}','"Reviewed fee group"');c:=jsonb_set(c,'{contribution,amount_minor}','100000');c:=jsonb_set(c,'{contribution,partial_payments}','true');c:=jsonb_set(c,'{contribution,late_policy}','"fee"');c:=jsonb_set(c,'{contribution,late_fee_minor}','0');c:=jsonb_set(c,'{schedule,timezone}','"Asia/Manila"');c:=jsonb_set(c,'{schedule,cutoff_time}','"00:00"');c:=jsonb_set(c,'{schedule,grace_hours}','0');
 fee:=jsonb_build_object('mode','percentage','fixed_minor',0,'rate_basis_points',250,'cap_minor',2000,'review_reference','review-2026-01','reviewed_by','External legal reviewer','reviewed_on',current_date::text,'disclosure','One non-compounding fee on unpaid principal at grace expiry; rounded up to a minor unit and capped at the disclosed maximum.');c:=jsonb_set(c,'{contribution,late_fee_rule}',fee);
 gid:=pg_temp.phase6_activate(c);vid:=(public.get_repa_group(gid)#>>'{group,accepted_version_id}')::uuid;
 select o.id,o.original_member_id,o.due_at into oid,m,old_due from public.group_member_obligations o join public.group_members gm on gm.id=o.original_member_id where o.group_id=gid and gm.user_id=auth.uid() and o.round_number=1;
 select o.id into other from public.group_member_obligations o where o.group_id=gid and o.round_number=1 and o.id<>oid;
 state:=public.get_contribution_obligation(oid)->'obligation';if state->>'status' is distinct from 'overdue' or state->>'fee_minor' is distinct from '2000' then raise exception 'Reviewed percentage fee or cap wrong: %',state;end if;
 perform public.refresh_contribution_deadlines(gid);perform public.refresh_contribution_deadlines(gid);
 if (select count(*) from public.contribution_adjustments where obligation_id=oid and kind='late_fee')<>1 then raise exception 'Repeated job compounded or duplicated fees';end if;
 id:=public.adjust_contribution_obligation(oid,'extension',0,now()+interval '2 days','Approved member request for a documented payment extension.','76000000-0000-4000-8000-000000000010');
 if public.adjust_contribution_obligation(oid,'extension',0,now()+interval '2 days','Approved member request for a documented payment extension.','76000000-0000-4000-8000-000000000010') is distinct from id then raise exception 'Extension retry duplicated';end if;
 state:=public.get_contribution_obligation(oid)->'obligation';if state->>'status' is distinct from 'upcoming' or state->>'fee_minor' is distinct from '2000' or (state->>'original_due_at')::timestamptz is distinct from old_due then raise exception 'Extension rewrote history or erased fees: %',state;end if;
 perform public.adjust_contribution_obligation(oid,'fee_waiver',1000,null,'Documented organizer approval to waive part of the unpaid fee.','76000000-0000-4000-8000-000000000011');
 begin perform public.adjust_contribution_obligation(oid,'fee_waiver',1001,null,'Cannot waive more than the unpaid fee amount.','76000000-0000-4000-8000-000000000012');raise exception 'Excess fee waiver accepted';exception when invalid_parameter_value then null;end;
 perform public.record_verified_contribution(oid,40000,'cash','fee-group-partial-400','Verified partial cash payment for the accepted obligation.','76000000-0000-4000-8000-000000000013');
 perform public.record_verified_contribution(oid,61000,'cash','fee-group-final-610','Verified final cash payment including the remaining late fee.','76000000-0000-4000-8000-000000000014');
 state:=public.get_contribution_obligation(oid)->'obligation';if state->>'status' is distinct from 'paid' or state->>'verified_minor' is distinct from '101000' or state->>'fee_verified_minor' is distinct from '1000' then raise exception 'Principal/fee allocation incorrect: %',state;end if;
 if (select sum(amount_minor) from public.group_member_financial_events where obligation_id=oid) is distinct from 100000::numeric then raise exception 'Fee payment inflated principal credit';end if;
 if (public.get_group_member_profile(m)#>>'{financial,eligible}')::boolean then raise exception 'Extension did not defer recipient deadline eligibility';end if;
 perform public.adjust_contribution_obligation(other,'fee_waiver',2000,null,'Reviewed hardship request waives the unpaid late fee.','76000000-0000-4000-8000-000000000015');
 perform public.adjust_contribution_obligation(other,'waiver',0,null,'Explicit documented hardship waiver; funding gap remains disclosed.','76000000-0000-4000-8000-000000000016');
 if public.get_contribution_obligation(other)#>>'{obligation,status}' is distinct from 'waived' then raise exception 'Waiver status missing';end if;
 begin perform public.record_verified_contribution(other,1,'cash','waived-obligation-credit','A waived obligation cannot accept a new payment.','76000000-0000-4000-8000-000000000017');raise exception 'Waived obligation accepted payment';exception when invalid_parameter_value then null;end;
 if exists(select 1 from public.contribution_rounds where group_id=gid and round_number=1 and (funding_gap_minor=0 or can_progress)) then raise exception 'Waiver hid funding gap or allowed round progression';end if;
 -- A future rules version does not create or change accepted financial obligations.
 c:=jsonb_set(c,'{contribution,amount_minor}','110000');perform public.save_repa_draft('70000000-0000-4000-8000-000000000010',gid,1,c,'Future proposed contribution change',now()+interval '1 day');
 if public.get_repa_group(gid)#>>'{group,accepted_version_id}' is distinct from vid::text or (select count(*) from public.group_member_obligations where group_id=gid)<>4 or exists(select 1 from public.group_member_obligations where group_id=gid and rules_version_id<>vid) then raise exception 'Proposed rules rewrote accepted obligations';end if;
 perform set_config('test.phase6_fee_group',gid::text,true);perform set_config('test.phase6_fee_obligation',oid::text,true);
 -- Fee modes without a legal review are never activatable.
 c:=jsonb_set(c,'{contribution,late_fee_rule,review_reference}','""');gid:=public.save_repa_draft('70000000-0000-4000-8000-000000000010',null,0,c,'Unreviewed fee draft',now());
 state:=public.check_repa_activation(gid,(public.get_repa_group(gid)#>>'{group,latest_version_id}')::uuid);if not (state->'errors')::text like '%legal review%' then raise exception 'Unreviewed fee not blocked: %',state;end if;
end $$;
do $$declare c jsonb:=current_setting('test.phase4_config')::jsonb;gid uuid;oid uuid;m uuid;state jsonb;begin
 c:=jsonb_set(c,'{basic,name}','"No partial contribution group"');gid:=pg_temp.phase6_activate(c);
 select o.id,o.original_member_id into oid,m from public.group_member_obligations o join public.group_members gm on gm.id=o.original_member_id where o.group_id=gid and gm.user_id=auth.uid() and o.round_number=1;
 begin perform public.record_verified_contribution(oid,4000,'cash','disallowed-partial','Partial payment is not enabled in this accepted version.','76000000-0000-4000-8000-000000000030');raise exception 'Partial disabled bypass';exception when invalid_parameter_value then null;end;
 begin perform public.record_group_member_financial_event(m,'contribution_credit',oid,1,4000,'legacy-disallowed-partial','Legacy credit endpoint must respect partial payment rules.');raise exception 'Legacy partial bypass';exception when invalid_parameter_value then null;end;
 perform public.set_group_staff_permissions(gid,'70000000-0000-4000-8000-000000000005',array['finance.read','finance.record'],'Collection staff may read and record verified receipts only.');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000005',true);
 if (public.get_contribution_workspace(gid)->>'can_record')::boolean is distinct from true or (public.get_contribution_workspace(gid)->>'can_adjust')::boolean then raise exception 'Scoped collection capability incorrect';end if;
 begin perform public.adjust_contribution_obligation(oid,'extension',0,now()+interval '1 day','Collection staff cannot change accepted deadlines.','76000000-0000-4000-8000-000000000031');raise exception 'Scoped staff adjusted financial terms';exception when insufficient_privilege then null;end;
 perform public.record_verified_contribution(oid,10000,'cash','scoped-staff-full-credit','Verified full receipt recorded by authorized collection staff.','76000000-0000-4000-8000-000000000032');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
 perform public.change_group_member_status(m,(select revision from public.group_members where id=m),'suspended','Suspension preserves the accepted contribution history.');
 if public.get_contribution_obligation(oid)#>>'{obligation,status}' is distinct from 'paid' then raise exception 'Suspension erased contribution credit';end if;
 perform public.change_group_member_status(m,(select revision from public.group_members where id=m),'active','Resume existing accepted membership and obligations.');
 -- Rejection after grace is enforced until an extension is approved.
 c:=jsonb_set(c,'{basic,name}','"Reject late contribution group"');c:=jsonb_set(c,'{contribution,late_policy}','"reject"');gid:=pg_temp.phase6_activate(c);
 select o.id into oid from public.group_member_obligations o join public.group_members gm on gm.id=o.original_member_id where o.group_id=gid and gm.user_id=auth.uid() and o.round_number=1;
 begin perform public.record_verified_contribution(oid,10000,'cash','rejected-late-credit','An extension is required for payment after the accepted grace.','76000000-0000-4000-8000-000000000033');raise exception 'Late reject bypass';exception when invalid_parameter_value then null;end;
 perform public.adjust_contribution_obligation(oid,'extension',0,now()+interval '1 day','Approved payment extension under the recorded group policy.','76000000-0000-4000-8000-000000000034');
 perform public.record_verified_contribution(oid,10000,'cash','extended-late-credit','Verified full receipt recorded before the extended deadline.','76000000-0000-4000-8000-000000000035');
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);begin perform public.refresh_contribution_deadlines(gid);raise exception 'Deadline job endpoint bypassed MFA';exception when insufficient_privilege then null;end;perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
end $$;
reset role;
do $$declare gid uuid:=current_setting('test.phase6_group')::uuid;oid uuid;at_time timestamptz;n bigint;begin
 select id,grace_ends_at+interval '1 minute' into oid,at_time from public.group_member_obligations where group_id=gid and id<>current_setting('test.phase6_paid')::uuid order by round_number limit 1;
 perform private.ce_run_group(gid,at_time);select count(*) into n from public.contribution_job_runs where group_id=gid;perform private.ce_run_group(gid,at_time);
 if (select count(*) from public.contribution_job_runs where group_id=gid)<>n or (select count(*) from public.group_member_obligations where group_id=gid)<>4 then raise exception 'Duplicate scheduled jobs or obligations';end if;
 if private.ce_state(oid,at_time)->>'status' is distinct from 'overdue' then raise exception 'Overdue/grace transition';end if;
 if not exists(select 1 from public.contribution_reminders where group_id=gid and kind='overdue') then raise exception 'Overdue reminder not scheduled';end if;
 if exists(select 1 from public.contribution_rounds where group_id=gid and can_progress) then raise exception 'Unpaid round marked ready';end if;
end $$;
set local role authenticated;
do $$declare c jsonb:=current_setting('test.phase4_config')::jsonb;gid uuid;oid uuid;fee jsonb;state jsonb;begin
 c:=jsonb_set(c,'{basic,name}','"Fixed reviewed fee group"');c:=jsonb_set(c,'{contribution,late_policy}','"fee"');
 fee:=jsonb_build_object('mode','fixed','fixed_minor',1000,'rate_basis_points',0,'cap_minor',500,'review_reference','fixed-review-2026','reviewed_by','External legal reviewer','reviewed_on',current_date::text,'disclosure','One legally reviewed fixed fee on unpaid principal at grace expiry, with a five peso maximum.');c:=jsonb_set(c,'{contribution,late_fee_rule}',fee);gid:=pg_temp.phase6_activate(c);
 select id into oid from public.group_member_obligations where group_id=gid order by round_number limit 1;
 if public.get_contribution_obligation(oid)#>>'{obligation,fee_minor}' is distinct from '500' then raise exception 'Fixed fee cap failed';end if;
 -- Cancelling a group retains accrued fees even if the regular cron has not run yet.
 perform public.transition_repa_group(gid,'active','cancelled','Explicit group cancellation retains every accrued commitment.');
 if public.get_contribution_obligation(oid)#>>'{obligation,fee_minor}' is distinct from '500' then raise exception 'Group cancellation erased an accrued fee';end if;
 gid:=current_setting('test.phase6_group')::uuid;
 select o.id into oid from public.group_member_obligations o join public.group_members m on m.id=o.original_member_id where o.group_id=gid and o.round_number=1 and m.user_id='70000000-0000-4000-8000-000000000002';
 perform public.record_verified_contribution(oid,100000,'cash','round-one-second-member','Verified full receipt for the second member in round one.','76000000-0000-4000-8000-000000000040');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000007',true);
 begin perform public.get_contribution_workspace(gid);raise exception 'Unrelated account read contribution workspace';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.contribution_receipts where group_id=gid) then raise exception 'Unrelated account read receipts through RLS';end if;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
end $$;
reset role;
do $$declare gid uuid:=current_setting('test.phase6_group')::uuid;at_time timestamptz;m uuid;o public.group_member_obligations;result jsonb;begin
 select max(grace_ends_at)+interval '3 minutes' into at_time from public.group_member_obligations where group_id=gid and round_number=1;
 perform private.ce_run_group(gid,at_time);
 if not exists(select 1 from public.contribution_rounds where group_id=gid and round_number=1 and can_progress) or (select current_round from public.contribution_group_state where group_id=gid) is distinct from 2 then raise exception 'Settled elapsed round did not progress';end if;
 select * into o from public.group_member_obligations where group_id=gid limit 1;
 insert into public.group_members(group_id,user_id,status) values(gid,'70000000-0000-4000-8000-000000000003','pending') returning id into m;
 begin insert into public.group_member_obligations(group_id,original_member_id,rules_version_id,member_slot,round_number,due_minor,due_at,grace_ends_at) values(gid,m,o.rules_version_id,o.member_slot,o.round_number,o.due_minor,o.due_at,o.grace_ends_at);raise exception 'Replacement identity duplicated a slot/round obligation';exception when unique_violation then null;end;
 result:=private.ce_tick(200);if result->>'failed_groups' is distinct from '0' then raise exception 'Scheduled batch failed: %',result;end if;
 begin update public.contribution_receipts set fee_minor=999 where obligation_id=current_setting('test.phase6_paid')::uuid;raise exception 'Verified receipt mutated';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
do $$declare gid uuid:=current_setting('test.phase6_group')::uuid;oid uuid;begin
 perform public.transition_repa_group(gid,'active','cancelled','Cancel future collections explicitly while keeping all previous history.');
 select o.id into oid from public.group_member_obligations o join public.group_members m on m.id=o.original_member_id where o.group_id=gid and o.round_number=2 and m.user_id=auth.uid();
 perform public.adjust_contribution_obligation(oid,'cancellation',0,null,'Future unpaid obligation cancelled after the group cancellation.','76000000-0000-4000-8000-000000000041');
 if public.get_contribution_obligation(oid)#>>'{obligation,status}' is distinct from 'cancelled' then raise exception 'Cancelled obligation status missing';end if;
 if (select count(*) from public.group_member_obligations where group_id=gid)<>4 then raise exception 'Cancellation erased historical obligation rows';end if;
end $$;
reset role;
-- A failed group's staged work rolls back, other groups continue, and retry succeeds.
delete from public.contribution_job_runs where group_id=current_setting('test.phase6_fee_group')::uuid;
create function pg_temp.phase6_deadline_fault() returns trigger language plpgsql as $$begin if new.group_id=current_setting('test.phase6_fee_group')::uuid then raise exception 'Disposable deadline fault for recovery verification';end if;return new;end $$;
create trigger phase6_test_deadline_fault before insert on public.contribution_obligation_status for each row execute function pg_temp.phase6_deadline_fault();
do $$declare r jsonb;begin r:=private.ce_tick(200);
 if r->>'failed_groups' is distinct from '1' or (r->>'processed')::integer<1 or not exists(select 1 from private.ce_job_failures where group_id=current_setting('test.phase6_fee_group')::uuid) then raise exception 'A single group failure stopped or escaped the batch: %',r;end if;
 if exists(select 1 from public.contribution_job_runs where group_id=current_setting('test.phase6_fee_group')::uuid) then raise exception 'Failed stages were not rolled back';end if;
end $$;
drop trigger phase6_test_deadline_fault on public.contribution_obligation_status;
do $$declare r jsonb;begin r:=private.ce_tick(200);if r->>'failed_groups' is distinct from '0' or (select count(*) from public.contribution_job_runs where group_id=current_setting('test.phase6_fee_group')::uuid)<>7 then raise exception 'Failed group did not recover idempotently: %',r;end if;end $$;
do $$declare rel record;f record;begin
 for rel in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'contribution_%' loop
 if not rel.relrowsecurity or has_table_privilege('anon',rel.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',rel.oid,'INSERT,UPDATE,DELETE') then raise exception 'Unsafe contribution table privileges: %',rel.relname;end if;end loop;
 for f in select p.oid,p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['list_contribution_groups','get_contribution_workspace','get_contribution_obligation','record_verified_contribution','adjust_contribution_obligation','refresh_contribution_deadlines','dismiss_contribution_reminder']) loop
 if has_function_privilege('anon',f.oid,'EXECUTE') or not exists(select 1 from unnest(f.proconfig) setting where setting like 'search_path=%') then raise exception 'Unsafe contribution RPC: %',f.proname;end if;end loop;
 if has_function_privilege('authenticated','private.ce_tick(integer)','EXECUTE') or has_function_privilege('authenticated','private.ce_state(uuid,timestamptz)','EXECUTE') then raise exception 'Privileged engine functions exposed';end if;
end $$;
rollback;
