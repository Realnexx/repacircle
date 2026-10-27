begin;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('test.ack','{"contribution":true,"schedule":true,"deadlines":true,"reward":true,"mechanism":true,"selection":true,"late_policy":true,"refund_exit":true,"disputes":true,"privacy":true}',true);
do $$declare gid uuid:=current_setting('test.phase4_group')::uuid;begin
 if (select count(*) from public.group_members where group_id=gid and status='active')<>2 or (select count(*) from public.group_member_obligations where group_id=gid)<>4 then raise exception 'Legacy members or obligations not preserved';end if;
 if exists(select 1 from public.group_agreements where group_id=gid) then raise exception 'Migration fabricated new agreement consent';end if;
end $$;
set local role authenticated;
do $$declare gid uuid:=current_setting('test.phase4_group')::uuid;vid uuid:=current_setting('test.phase4_version')::uuid;pid uuid;begin
 pid:=public.publish_group_agreement_policy(gid,vid,'Settled past obligations remain with the original member. Future transfers require both consents.','Submit disputes to the organizer with supporting records; escalate unresolved cases to the organization owner.','We use membership and contact details only for group administration and preserve required financial history.');
 perform set_config('test.phase4_policy',pid::text,true);
 begin perform public.accept_group_agreement(gid,vid,pid,'{"contribution":true}','{}');raise exception 'Partial acknowledgement accepted';exception when invalid_parameter_value then null;end;
 perform public.accept_group_agreement(gid,vid,pid,current_setting('test.ack')::jsonb,'{}');
 if not exists(select 1 from public.group_scopes where id=gid) or public.get_access_context()->'organizations' is null then raise exception 'Existing authorization policy/function dependency broken';end if;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 perform public.accept_group_agreement(gid,vid,pid,current_setting('test.ack')::jsonb,'{}');
 if (select count(*) from public.group_members where group_id=gid)<>1 then raise exception 'Member roster exposed other private memberships';end if;
 if (select count(*) from public.group_member_obligations where group_id=gid)<>2 then raise exception 'Member read another person obligations';end if;
 begin perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000003',true);raise exception 'Unauthorized approval';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
end $$;

do $$declare gid uuid:=current_setting('test.phase4_group')::uuid;m1 uuid;m2 uuid;ob uuid;eid uuid;begin
 select id into m1 from public.group_members where group_id=gid and user_id='70000000-0000-4000-8000-000000000001';select id into m2 from public.group_members where group_id=gid and user_id='70000000-0000-4000-8000-000000000002';
 perform set_config('test.phase4_m1',m1::text,true);perform set_config('test.phase4_m2',m2::text,true);
 select id into ob from public.group_member_obligations where original_member_id=m1 and round_number=1;
 eid:=public.record_group_member_financial_event(m1,'contribution_credit',ob,1,10000,'verified-credit-owner-round1','Verified historical payment with reference and supporting receipt.');
 if public.record_group_member_financial_event(m1,'contribution_credit',ob,1,10000,'verified-credit-owner-round1','Verified historical payment with reference and supporting receipt.')<>eid then raise exception 'Financial import retry not idempotent';end if;
 begin perform public.record_group_member_financial_event(m1,'contribution_credit',ob,1,1,'over-credit','Overpayment must never silently erase another obligation.');raise exception 'Over credit accepted';exception when invalid_parameter_value then null;end;
 perform public.record_group_member_financial_event(m1,'reward_received',null,1,20000,'verified-reward-owner-round1','Verified external reward distribution, no payment executed by this module.');
 begin perform public.change_group_member_status(m1,(select revision from public.group_members where id=m1),'removed','Try to remove a member after reward delivery.');raise exception 'Removed reward recipient with remaining obligations';exception when invalid_parameter_value then null;end;
 select id into ob from public.group_member_obligations where original_member_id=m2 and round_number=1;
 perform public.record_group_member_financial_event(m2,'contribution_credit',ob,1,10000,'verified-credit-member-round1','Verified historical payment with supporting bank reference.');
end $$;

do $$declare gid uuid:=current_setting('test.phase4_group')::uuid;request_id uuid;incoming uuid;rid uuid;begin
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 request_id:=public.request_group_membership(gid,'I would like to join the group.');
 select id into incoming from public.group_members where group_id=gid and user_id=auth.uid();perform set_config('test.phase4_incoming',incoming::text,true);
 begin perform public.request_group_membership(gid,'Duplicate request');raise exception 'Duplicate membership request';exception when invalid_parameter_value then null;end;
 begin perform public.review_group_membership(request_id,'approved','Unauthorized self approval');raise exception 'Self approval';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
 begin perform public.review_group_membership(request_id,'approved','Full active group cannot accept arbitrary admission.');raise exception 'Exceeded active capacity';exception when invalid_parameter_value then null;end;
 begin perform public.propose_group_member_replacement(current_setting('test.phase4_m1')::uuid,incoming,2,'Recipient tries to offload future contributions.');raise exception 'Reward recipient replacement allowed';exception when invalid_parameter_value then null;end;
 rid:=public.propose_group_member_replacement(current_setting('test.phase4_m2')::uuid,incoming,2,'Voluntary replacement before the next monthly round.');perform set_config('test.phase4_replacement',rid::text,true);
 begin perform public.complete_group_member_replacement(rid);raise exception 'Replacement without both consents';exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);perform public.accept_group_member_replacement(rid);
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
 begin perform public.accept_group_member_replacement(rid);raise exception 'Replacement without incoming agreement';exception when invalid_parameter_value then null;end;
 perform public.accept_group_agreement(gid,current_setting('test.phase4_version')::uuid,current_setting('test.phase4_policy')::uuid,current_setting('test.ack')::jsonb,'{}');perform public.accept_group_member_replacement(rid);
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);perform public.complete_group_member_replacement(rid);
 if (select count(*) from public.group_member_obligations where group_id=gid)<>4 or (select count(*) from public.membership_obligation_transfers where replacement_id=rid)<>1 or (select status from public.group_members where id=current_setting('test.phase4_m2')::uuid)<>'withdrawn' then raise exception 'Replacement rewrote historical obligations or statuses';end if;
 if (public.get_group_member_profile(incoming)#>>'{financial,outstanding_minor}')::bigint<>10000 or (public.get_group_member_profile(current_setting('test.phase4_m2')::uuid)#>>'{financial,credited_minor}')::bigint<>10000 then raise exception 'Historical or transferred totals incorrect';end if;
 perform public.change_group_member_status(incoming,(select revision from public.group_members where id=incoming),'suspended','Temporary suspension pending a membership review.');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 if private.authorized('70000000-0000-4000-8000-000000000010','contributions.self.submit',gid) then raise exception 'Suspended contribution access';end if;
 if (public.get_group_member_profile(incoming)#>>'{financial,eligible}')::boolean then raise exception 'Suspended payout eligibility';end if;
 if exists(select 1 from public.group_member_financial_events where member_id=current_setting('test.phase4_m1')::uuid) then raise exception 'Cross member reward information exposed';end if;
 begin perform public.change_group_member_status(incoming,(select revision from public.group_members where id=incoming),'active','Unauthorized self reinstatement');raise exception 'Suspension bypass';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
end $$;

do $$declare c jsonb:=current_setting('test.phase4_config')::jsonb;gid uuid;vid uuid;report jsonb;invite jsonb;req uuid;pid uuid;future_vid uuid;begin
 gid:=public.save_repa_draft('70000000-0000-4000-8000-000000000010',null,0,c,'New enrollment limit checks',now());vid:=(public.get_repa_group(gid)#>>'{group,latest_version_id}')::uuid;perform set_config('test.phase4_draft',gid::text,true);
 perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000001',true);perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000002',true);
 begin perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000003',true);raise exception 'Member limit bypass';exception when invalid_parameter_value then null;end;
 begin perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000002',true);raise exception 'Duplicate group membership';exception when unique_violation then null;end;
 report:=public.check_repa_activation(gid,vid);if (report->>'valid')::boolean then raise exception 'Activated without all agreement sections';end if;
 begin perform public.activate_repa_group(gid,vid,true);raise exception 'Cached activation bypassed new agreement checks';exception when invalid_parameter_value then null;end;
 pid:=public.publish_group_agreement_policy(gid,vid,'All existing commitments remain recorded. Exits and refunds require documented organizer approval.','Submit evidence to the organizer and escalate unresolved disputes to the organization owner.','Contact information is restricted to authorized group administration and financial history is retained.');
 perform public.accept_group_agreement(gid,vid,pid,current_setting('test.ack')::jsonb,'{}');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);perform public.accept_group_agreement(gid,vid,pid,current_setting('test.ack')::jsonb,'{}');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);perform public.activate_repa_group(gid,vid,true);
 if (select count(*) from public.group_member_obligations where group_id=gid)<>4 or (select count(*) from public.group_members where group_id=gid and status='active')<>2 then raise exception 'Fresh Phase 4 activation did not snapshot obligations and activate members';end if;
 perform public.save_repa_draft('70000000-0000-4000-8000-000000000010',gid,1,c,'Future rules version for agreement tracking',now()+interval '1 day');
 future_vid:=(public.get_repa_group(gid)#>>'{group,latest_version_id}')::uuid;
 pid:=public.publish_group_agreement_policy(gid,future_vid,'Past commitments are preserved; future policy changes apply only after separate approval.','Contact the organizer first and escalate unresolved disputes to the organization owner.','Only authorized staff can read member contact details; members see their own financial information.');
 begin perform public.accept_group_agreement(gid,vid,pid,current_setting('test.ack')::jsonb,'{}');raise exception 'Stale policy ID accepted for old rules';exception when serialization_failure then null;end;
 perform public.accept_group_agreement(gid,future_vid,pid,current_setting('test.ack')::jsonb,'{}');
 begin perform public.approve_repa_proposal(gid,future_vid);raise exception 'Future approval without every new agreement';exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);perform public.accept_group_agreement(gid,future_vid,pid,current_setting('test.ack')::jsonb,'{}');
 if (public.get_group_agreement(gid,vid)#>>'{agreement,rules_version_id}')::uuid<>vid or (public.get_group_agreement(gid,future_vid)#>>'{agreement,rules_version_id}')::uuid<>future_vid then raise exception 'Agreement versions were conflated';end if;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);perform public.approve_repa_proposal(gid,future_vid);
 if (public.get_repa_group(gid)#>>'{group,accepted_version_id}')::uuid<>vid then raise exception 'Future agreement replaced accepted obligations';end if;
 invite:=public.create_group_invitation(gid,'phase4invite@example.test',1,168);perform set_config('test.phase4_invite',invite::text,true);
 report:=public.claim_group_invitation_delivery((invite->>'id')::uuid,invite->>'token');if report->>'email'<>'phase4invite@example.test' then raise exception 'Delivery recipient not resolved from server';end if;
 begin perform public.claim_group_invitation_delivery((invite->>'id')::uuid,invite->>'token');raise exception 'Delivery rate limit bypass';exception when invalid_parameter_value then null;end;
 begin perform public.create_group_invitation(gid,'PHASE4INVITE@example.test',1,168);raise exception 'Duplicate invitation accepted';exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.inspect_group_invitation((invite->>'id')::uuid,invite->>'token');raise exception 'Wrong email accepted';exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000006',true);
 perform public.redeem_group_invitation((invite->>'id')::uuid,invite->>'token','Invited by organization owner.');perform public.redeem_group_invitation((invite->>'id')::uuid,invite->>'token','Idempotent replay.');
 if not exists(select 1 from public.organization_members where organization_id='70000000-0000-4000-8000-000000000010' and user_id=auth.uid() and role='member') then raise exception 'Owner invitation did not provision basic membership';end if;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
 req:=(select id from public.membership_requests where invitation_id=(invite->>'id')::uuid);
 perform public.review_group_membership(req,'rejected','Request rejected because no member seat is available.');
 perform public.set_group_staff_permissions(gid,'70000000-0000-4000-8000-000000000005',array['members.read','members.invite'],'Group invitation and profile access only.');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000005',true);
 if jsonb_array_length(public.get_group_membership_workspace(gid)->'members')<>3 then raise exception 'Scoped roster permission failed';end if;
 begin perform public.review_group_membership(req,'approved','Missing review capability');raise exception 'Staff permission escalation';exception when insufficient_privilege then null;end;
 begin perform public.create_group_invitation(gid,'outside-tenant@example.test',1,168);raise exception 'Staff added organization outsiders';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
end $$;

do $$declare gid uuid:=current_setting('test.phase4_draft')::uuid;i jsonb;begin
 i:=public.create_group_invitation(gid,null,1,1);
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000004',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 perform public.redeem_group_invitation((i->>'id')::uuid,i->>'token','Secure owner share link enrollment.');
 perform public.redeem_group_invitation((i->>'id')::uuid,i->>'token','Retry does not consume another use.');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
 begin perform public.redeem_group_invitation((i->>'id')::uuid,i->>'token','Exhausted invitation');raise exception 'Share link max uses bypass';exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
 perform public.set_group_staff_permissions(gid,'70000000-0000-4000-8000-000000000005',array['finance.read'],'Financial history access without private profile details.');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000005',true);
 if public.get_group_member_profile((select id from public.group_members where group_id=gid and user_id='70000000-0000-4000-8000-000000000002'))#>>'{profile,mobile_number}' is not null then raise exception 'Finance-only staff received private contact data';end if;
 if exists(select 1 from public.group_member_financial_events where group_id=current_setting('test.phase4_group')::uuid) then raise exception 'Staff finance scope leaked into another group';end if;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
end $$;

do $$declare gid uuid:=current_setting('test.phase4_draft')::uuid;outgoing uuid;incoming uuid;ob uuid;r1 uuid;r2 uuid;vid uuid;pid uuid;begin
 select id into outgoing from public.group_members where group_id=gid and user_id='70000000-0000-4000-8000-000000000002';
 select id into incoming from public.group_members where group_id=gid and user_id='70000000-0000-4000-8000-000000000004';
 select accepted_version_id into vid from public.repa_groups where id=gid;select id into pid from public.group_agreement_policies where version_id=vid;
 select id into ob from public.group_member_obligations where original_member_id=outgoing and round_number=1;
 perform public.record_group_member_financial_event(outgoing,'contribution_credit',ob,1,10000,'second-group-round-one','Verified external historical payment before replacement review.');
 r1:=public.propose_group_member_replacement(outgoing,incoming,2,'Replacement proposal later cancelled after agreement review.');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000004',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);perform public.accept_group_agreement(gid,vid,pid,current_setting('test.ack')::jsonb,'{}');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);perform public.cancel_group_member_replacement(r1,'The participants requested a revised replacement proposal.');
 r2:=public.propose_group_member_replacement(outgoing,incoming,2,'Revised voluntary replacement with fresh context consent.');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000004',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 if public.get_group_agreement(gid,vid)->'agreement'<>'null'::jsonb then raise exception 'Cancelled replacement agreement reused for new proposal';end if;
 perform public.accept_group_agreement(gid,vid,pid,current_setting('test.ack')::jsonb,'{}');perform public.accept_group_member_replacement(r2);
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform public.accept_group_member_replacement(r2);
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);perform public.complete_group_member_replacement(r2);
 if (select count(*) from public.group_agreements where member_id=incoming and rules_version_id=vid)<>2 then raise exception 'Replacement agreement history was overwritten';end if;
 begin perform public.cancel_group_member_replacement(r2,'Cannot cancel an already completed financial transfer.');raise exception 'Cancelled completed replacement';exception when invalid_parameter_value then null;end;
end $$;

reset role;
update public.group_invitations set expires_at=now()-interval '1 second' where id=(current_setting('test.phase4_invite')::jsonb->>'id')::uuid;
set local role authenticated;
do $$declare i jsonb:=current_setting('test.phase4_invite')::jsonb;begin
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000006',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.inspect_group_invitation((i->>'id')::uuid,i->>'token');raise exception 'Expired invitation accepted';exception when invalid_parameter_value then null;end;
 begin update public.group_members set status='active' where user_id=auth.uid();raise exception 'Direct status write';exception when insufficient_privilege then null;end;
 begin select token_hash from public.group_invitations limit 1;raise exception 'Invitation hashes exposed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000007',true);
 begin perform public.get_group_membership_workspace(current_setting('test.phase4_group')::uuid);raise exception 'Outsider roster access';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 begin delete from public.group_member_financial_events where member_id=current_setting('test.phase4_m1')::uuid;raise exception 'Deleted previous payout';exception when insufficient_privilege then null;end;
 begin update public.group_agreements set accepted_at=now();raise exception 'Altered agreement timestamp';exception when insufficient_privilege then null;end;
 begin delete from public.group_members where id=current_setting('test.phase4_m2')::uuid;raise exception 'Deleted historical membership';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
do $$declare gid uuid:=current_setting('test.phase4_group')::uuid;begin
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
 perform public.transition_repa_group(gid,'active','cancelled','Cancellation preserves outstanding member commitments.');
 if not exists(select 1 from public.organization_closure_blocks where source_kind='group_membership_obligations' and source_id=gid and resolved_at is null) then raise exception 'Cancellation erased financial closure blocker';end if;
 if private.authorized('70000000-0000-4000-8000-000000000010','contributions.self.submit',gid) then raise exception 'Cancelled group still allowed contribution submission';end if;
 begin perform public.archive_organization('70000000-0000-4000-8000-000000000010');raise exception 'Archived organization with recorded outstanding obligations';exception when invalid_parameter_value then null;end;
end $$;
reset role;
do $$declare rel record;f record;begin
 for rel in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(array['group_members','group_invitations','membership_requests','group_agreement_policies','group_agreements','membership_events','group_staff_permissions','group_member_obligations','membership_replacements','membership_obligation_transfers','group_member_financial_events']) loop
 if not rel.relrowsecurity or has_table_privilege('anon',rel.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',rel.oid,'INSERT,UPDATE,DELETE') then raise exception 'Unsafe table privileges or RLS: %',rel.relname;end if;end loop;
 for f in select p.oid,p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['get_group_membership_workspace','get_group_agreement','accept_group_agreement','publish_group_agreement_policy','create_group_invitation','inspect_group_invitation','redeem_group_invitation','review_group_membership','change_group_member_status','record_group_member_financial_event','propose_group_member_replacement','complete_group_member_replacement']) loop
 if has_function_privilege('anon',f.oid,'EXECUTE') or not exists(select 1 from unnest(f.proconfig) setting where setting like 'search_path=%') then raise exception 'Unsafe RPC execution or search path: %',f.proname;end if;end loop;
end $$;
set local role anon;
do $$begin begin perform public.get_group_membership_workspace(current_setting('test.phase4_group')::uuid);raise exception 'Anonymous membership RPC';exception when insufficient_privilege then null;end;end $$;
rollback;
