begin;

create table public.group_members (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.repa_groups(id),
 user_id uuid not null references auth.users(id),
 status text not null check(status in ('invited','pending','approved','active','suspended','withdrawn','removed')),
 slot integer check(slot between 1 and 1000), revision integer not null default 1,
 accepted_rules_version uuid references public.group_config_versions(id), accepted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(group_id,user_id), unique(group_id,id),
 check(status not in ('approved','active','suspended') or slot is not null)
);
create unique index group_members_seat_unique on public.group_members(group_id,slot) where status in ('approved','active','suspended');
create index group_members_user_idx on public.group_members(user_id,group_id);
create index group_members_status_idx on public.group_members(group_id,status);

create table public.group_invitations (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.repa_groups(id),
 email text check(email=lower(btrim(email)) and char_length(email)<=254), token_hash text not null unique,
 max_uses integer not null check(max_uses between 1 and 1000), use_count integer not null default 0 check(use_count>=0 and use_count<=max_uses),
 allows_organization_join boolean not null default false, invited_by uuid not null references auth.users(id),
 expires_at timestamptz not null, revoked_at timestamptz, delivery_attempted_at timestamptz,
 created_at timestamptz not null default now(),check(email is null or max_uses=1)
);
create unique index group_invitations_email_unique on public.group_invitations(group_id,email) where email is not null and revoked_at is null and use_count=0;
create index group_invitations_group_idx on public.group_invitations(group_id,created_at desc);

create table public.membership_requests (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.repa_groups(id),
 member_id uuid not null references public.group_members(id), invitation_id uuid references public.group_invitations(id),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 message text not null default '' check(char_length(message)<=1000),review_reason text not null default '' check(char_length(review_reason)<=1000),
 reviewed_by uuid references auth.users(id),reviewed_at timestamptz,created_at timestamptz not null default now()
);
create unique index membership_requests_open_unique on public.membership_requests(member_id) where status='pending';
create unique index membership_requests_invite_once on public.membership_requests(invitation_id,member_id) where invitation_id is not null;
create index membership_requests_group_idx on public.membership_requests(group_id,status,created_at);

create table public.group_agreement_policies (
 id uuid primary key default gen_random_uuid(),version_id uuid not null unique references public.group_config_versions(id),
 refund_exit_policy text not null check(char_length(btrim(refund_exit_policy)) between 20 and 4000),
 dispute_process text not null check(char_length(btrim(dispute_process)) between 20 and 4000),
 privacy_notice text not null check(char_length(btrim(privacy_notice)) between 20 and 4000),
 published_by uuid not null references auth.users(id),published_at timestamptz not null default now()
);
create table public.group_agreements (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.repa_groups(id),
 member_id uuid not null references public.group_members(id),rules_version_id uuid not null references public.group_config_versions(id),
 policy_id uuid not null references public.group_agreement_policies(id),member_slot integer not null,
 agreement_context text not null default 'enrollment',acknowledgements jsonb not null,custom_values jsonb not null,snapshot jsonb not null,
 accepted_by uuid not null references auth.users(id),accepted_at timestamptz not null default now(),
 unique(member_id,rules_version_id,agreement_context)
);
create index group_agreements_group_idx on public.group_agreements(group_id,rules_version_id);
create table public.membership_events (
 id bigint generated always as identity primary key,group_id uuid not null references public.repa_groups(id),
 member_id uuid references public.group_members(id),actor_id uuid not null references auth.users(id),
 event_type text not null,reason text not null default '',details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create index membership_events_group_idx on public.membership_events(group_id,id desc);
create index membership_events_member_idx on public.membership_events(member_id,id desc);

create table public.group_staff_permissions (
 group_id uuid not null references public.repa_groups(id),user_id uuid not null references auth.users(id),
 permissions text[] not null check(permissions <@ array['members.read','members.invite','members.review','members.suspend','finance.read','finance.record','rewards.record']::text[]),
 assigned_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),primary key(group_id,user_id)
);
create index group_staff_permissions_user_idx on public.group_staff_permissions(user_id,group_id);
-- These are obligation snapshots and verified historical facts, not a payment processor.
create table public.group_member_obligations (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.repa_groups(id),
 original_member_id uuid not null references public.group_members(id),rules_version_id uuid not null references public.group_config_versions(id),
 member_slot integer not null,round_number integer not null,due_minor bigint not null check(due_minor>0),
 due_at timestamptz not null,grace_ends_at timestamptz not null,created_at timestamptz not null default now(),
 unique(original_member_id,rules_version_id,round_number)
);
create index member_obligations_group_idx on public.group_member_obligations(group_id,round_number);
create index member_obligations_member_idx on public.group_member_obligations(original_member_id,due_at);
create index member_obligations_deadline_idx on public.group_member_obligations(group_id,grace_ends_at,round_number);
create table public.membership_replacements (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.repa_groups(id),
 outgoing_member_id uuid not null references public.group_members(id),incoming_member_id uuid not null references public.group_members(id),
 rules_version_id uuid not null references public.group_config_versions(id),from_round integer not null check(from_round>0),member_slot integer not null,
 status text not null default 'pending' check(status in ('pending','completed','cancelled')),
 reason text not null check(char_length(btrim(reason)) between 10 and 1000),
 proposed_by uuid not null references auth.users(id),outgoing_accepted_at timestamptz,incoming_accepted_at timestamptz,
 created_at timestamptz not null default now(),completed_at timestamptz,
 check(outgoing_member_id<>incoming_member_id)
);
create unique index membership_replacement_outgoing_unique on public.membership_replacements(outgoing_member_id) where status='pending';
create unique index membership_replacement_incoming_unique on public.membership_replacements(incoming_member_id) where status='pending';
create index membership_replacements_group_idx on public.membership_replacements(group_id,status);
create table public.membership_obligation_transfers (
 id bigint generated always as identity primary key,obligation_id uuid not null references public.group_member_obligations(id),
 replacement_id uuid not null references public.membership_replacements(id),
 from_member_id uuid not null references public.group_members(id),to_member_id uuid not null references public.group_members(id),
 transferred_at timestamptz not null default now(),unique(obligation_id,replacement_id)
);
create index membership_obligation_transfers_owner_idx on public.membership_obligation_transfers(obligation_id,id desc);
create index membership_obligation_transfers_recipient_idx on public.membership_obligation_transfers(to_member_id,obligation_id);
create table public.group_member_financial_events (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.repa_groups(id),
 member_id uuid not null references public.group_members(id),rules_version_id uuid not null references public.group_config_versions(id),
 kind text not null check(kind in ('contribution_credit','reward_received')),
 obligation_id uuid references public.group_member_obligations(id),round_number integer not null check(round_number>0),
 amount_minor bigint not null check(amount_minor>0),external_reference text not null check(char_length(btrim(external_reference)) between 3 and 200),
 evidence_note text not null check(char_length(btrim(evidence_note)) between 10 and 2000),
 reward_key text,recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),
 unique(group_id,external_reference),check((kind='contribution_credit' and obligation_id is not null and reward_key is null) or (kind='reward_received' and obligation_id is null and reward_key is not null))
);
create unique index membership_reward_once on public.group_member_financial_events(member_id) where kind='reward_received';
create unique index membership_reward_round_once on public.group_member_financial_events(group_id,reward_key) where kind='reward_received';
create index member_financial_events_member_idx on public.group_member_financial_events(member_id,recorded_at desc);
create index member_financial_events_obligation_idx on public.group_member_financial_events(obligation_id) where obligation_id is not null;

create function private.gm_can(target uuid,capability text) returns boolean language sql stable security definer set search_path='' as $$
 select private.active_user() and (private.authorized(g.organization_id,'groups.manage',g.id) or
 (private.verified_mfa() and private.is_organization_member(g.organization_id) and exists(select 1 from public.organization_members om where om.organization_id=g.organization_id and om.user_id=auth.uid() and om.role in ('organizer','treasurer'))
 and not exists(select 1 from public.group_members m where m.group_id=g.id and m.user_id=auth.uid() and m.status in ('suspended','withdrawn','removed'))
 and exists(select 1 from public.group_staff_permissions s where s.group_id=g.id and s.user_id=auth.uid() and (capability=any(s.permissions) or (capability='group.access' and cardinality(s.permissions)>0)))))
 from public.repa_groups g join public.organizations o on o.id=g.organization_id and o.status='active' where g.id=target;
$$;
create function private.gm_require(target uuid,capability text) returns uuid language plpgsql stable security definer set search_path='' as $$
 declare actor uuid:=private.require_account(true);begin if private.gm_can(target,capability) is distinct from true then raise exception 'Group permission required: %',capability using errcode='42501';end if;return actor;end $$;
create function private.gm_owns(member uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.active_user() and exists(select 1 from public.group_members m where m.id=member and m.user_id=auth.uid());$$;
create function private.gm_obligation_owner(target uuid) returns uuid language sql stable security definer set search_path='' as $$
 select coalesce((select t.to_member_id from public.membership_obligation_transfers t where t.obligation_id=o.id order by t.id desc limit 1),o.original_member_id) from public.group_member_obligations o where o.id=target;$$;
create function private.gm_event(target uuid,member uuid,kind text,note text default '',data jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.membership_events(group_id,member_id,actor_id,event_type,reason,details) values(target,member,auth.uid(),kind,note,data);$$;

-- Immutable identities survive access revocation and organization-member changes.
insert into public.group_members(group_id,user_id,status,slot,accepted_rules_version,accepted_at,created_at)
 select a.group_id,a.user_id,case when g.accepted_version_id is null then 'approved' else 'active' end,a.repa_slot,
 g.accepted_version_id,(select accepted_at from public.repa_member_consents c where c.version_id=g.accepted_version_id and c.user_id=a.user_id),a.created_at
 from public.group_role_assignments a join public.repa_groups g on g.id=a.group_id where a.role='member';

create function private.gm_snapshot_obligations(target uuid) returns void language plpgsql security definer set search_path='' as $$
 declare g public.repa_groups;c jsonb;schedule jsonb;begin
 select * into g from public.repa_groups where id=target;if g.accepted_version_id is null then return;end if;c:=private.repa_config(g.accepted_version_id);schedule:=private.repa_schedule(c);
 with members_to_snapshot as materialized (
 select m.id,m.slot,case when c#>>'{contribution,policy}'='fixed' then (c#>>'{contribution,amount_minor}')::bigint else (select (value->>'amount_minor')::bigint from jsonb_array_elements(c#>'{contribution,member_amounts}') where (value->>'slot')::integer=m.slot) end as amount
 from public.group_members m where m.group_id=target and m.status in ('active','suspended'))
 insert into public.group_member_obligations(group_id,original_member_id,rules_version_id,member_slot,round_number,due_minor,due_at,grace_ends_at)
 select target,m.id,g.accepted_version_id,m.slot,(r->>'round')::integer,m.amount,(r->>'cutoff_at')::timestamptz,(r->>'grace_ends_at')::timestamptz from members_to_snapshot m cross join jsonb_array_elements(schedule) r on conflict do nothing;
 end $$;
do $$declare gid uuid;begin for gid in select id from public.repa_groups where accepted_version_id is not null loop perform private.gm_snapshot_obligations(gid);end loop;end $$;

-- Retain legacy capabilities for unrelated scopes; REPA access follows current membership.
do $$begin execute replace(pg_get_functiondef('private.authorized(uuid,text,uuid)'::regprocedure),'FUNCTION private.authorized(','FUNCTION private.phase3_authorized(');end $$;
create or replace function private.authorized(target uuid,permission text,group_scope uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if group_scope is not null and exists(select 1 from public.repa_groups where id=group_scope) and permission=any(array['groups.joined.read','contributions.self.submit','receipts.self.read','payouts.self.read','obligations.self.read','statements.self.read']) then
 return private.phase3_authorized(target,permission,group_scope) and exists(select 1 from public.group_members m join public.repa_groups g on g.id=m.group_id where m.group_id=group_scope and m.user_id=auth.uid() and m.status='active' and (permission<>'contributions.self.submit' or (g.status='active' and exists(select 1 from public.group_agreements a where a.member_id=m.id and a.rules_version_id=g.accepted_version_id and a.member_slot=m.slot))));end if;
 return private.phase3_authorized(target,permission,group_scope);
end $$;
create or replace function private.repa_can_read(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.active_user() and o.status='active' and (private.gm_can(g.id,'group.access') or exists(select 1 from public.group_members m where m.group_id=g.id and m.user_id=auth.uid()) or
 (private.is_organization_member(g.organization_id) and g.visibility='organization' and g.status<>'draft') or private.authorized(g.organization_id,'groups.assigned.read',g.id))
 from public.repa_groups g join public.organizations o on o.id=g.organization_id where g.id=target;$$;
create or replace function private.repa_membership_lock() returns trigger language plpgsql security definer set search_path='' as $$
 declare gid uuid:=case when tg_op='DELETE' then old.group_id else new.group_id end;begin
 perform 1 from public.repa_groups where id=gid for update;
 if exists(select 1 from public.repa_groups where id=gid) then
 if tg_op<>'INSERT' and old.role='member' and exists(select 1 from public.group_members m where m.group_id=old.group_id and m.user_id=old.user_id and m.status in ('approved','active')) then raise exception 'Use the controlled group membership workflow' using errcode='42501';end if;
 if tg_op<>'DELETE' and new.role='member' and not exists(select 1 from public.group_members m where m.group_id=new.group_id and m.user_id=new.user_id and m.status in ('approved','active') and m.slot=new.repa_slot) then raise exception 'Approved group membership and matching slot required' using errcode='42501';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;end $$;
create function private.gm_sync_access(target uuid) returns void language plpgsql security definer set search_path='' as $$
 declare m public.group_members;org uuid;begin select * into m from public.group_members where id=target;select organization_id into org from public.repa_groups where id=m.group_id;
 if m.status in ('approved','active') then
 if not exists(select 1 from public.group_role_assignments where group_id=m.group_id and user_id=m.user_id and role='member' and repa_slot=m.slot) then
 insert into public.group_role_assignments(organization_id,group_id,user_id,role,assigned_by,repa_slot) values(org,m.group_id,m.user_id,'member',auth.uid(),m.slot);end if;
 else delete from public.group_role_assignments where group_id=m.group_id and user_id=m.user_id and role='member';end if;end $$;
create function private.gm_reserve(target uuid) returns void language plpgsql security definer set search_path='' as $$
 declare m public.group_members;g public.repa_groups;limit_count integer;seat integer;begin
 select * into m from public.group_members where id=target;select * into g from public.repa_groups where id=m.group_id for update;
 if g.status not in ('draft','enrollment_open','enrollment_closed') or g.accepted_version_id is not null then raise exception 'Active groups require the controlled replacement workflow' using errcode='22023';end if;
 if m.status not in ('invited','pending') then raise exception 'This membership cannot be approved' using errcode='22023';end if;
 if exists(select 1 from public.group_role_assignments where group_id=g.id and user_id=m.user_id and role<>'member') then raise exception 'Move the existing staff scope assignment to group-specific staff permissions before reserving a financial member slot' using errcode='22023';end if;
 select membership_limit into limit_count from public.group_rules where version_id=g.latest_version_id;
 select min(n) into seat from generate_series(1,limit_count) n where not exists(select 1 from public.group_members x where x.group_id=g.id and x.slot=n and x.status in ('approved','active','suspended'));
 if seat is null then raise exception 'The group member limit has been reached' using errcode='22023';end if;
 update public.group_members set status='approved',slot=seat,revision=revision+1,updated_at=now() where id=target;
 perform private.gm_sync_access(target);perform private.gm_event(g.id,target,'membership.approved','Slot reserved',jsonb_build_object('slot',seat));
end $$;

create function public.publish_group_agreement_policy(target uuid,version_id uuid,refund_exit_policy text,dispute_process text,privacy_notice text) returns uuid language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.gm_require(target,'members.review');pid uuid;begin
 perform 1 from public.repa_groups where id=target for update;
 if not exists(select 1 from public.group_config_versions v join public.repa_groups g on g.id=v.group_id where v.id=version_id and g.id=target and v.id in (g.latest_version_id,g.accepted_version_id)) then raise exception 'Select the current accepted or candidate rules version' using errcode='22023';end if;
 insert into public.group_agreement_policies(version_id,refund_exit_policy,dispute_process,privacy_notice,published_by) values(version_id,btrim(refund_exit_policy),btrim(dispute_process),btrim(privacy_notice),actor) returning id into pid;
 perform private.gm_event(target,null,'agreement.policy_published','Supplemental policies are immutable',jsonb_build_object('version',version_id));return pid;end $$;

create function public.request_group_membership(target uuid,message text default '') returns uuid language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.require_account();g public.repa_groups;mid uuid;rid uuid;begin
 select * into g from public.repa_groups where id=target for update;
 if g.id is null or g.visibility<>'organization' or not private.is_organization_member(g.organization_id) or g.status not in ('enrollment_open','active') or (private.repa_config(coalesce(g.accepted_version_id,g.latest_version_id))#>>'{membership,invitation_rule}')<>'members_can_request' then raise exception 'Membership requests are not open for this group' using errcode='42501';end if;
 if message is null or char_length(message)>1000 then raise exception 'Invalid request message' using errcode='22023';end if;
 if exists(select 1 from public.group_members where group_id=target and user_id=actor) then raise exception 'A membership record already exists; contact the organizer' using errcode='22023';end if;
 insert into public.group_members(group_id,user_id,status) values(target,actor,'pending') returning id into mid;
 insert into public.membership_requests(group_id,member_id,message) values(target,mid,btrim(message)) returning id into rid;
 perform private.gm_event(target,mid,'membership.requested',btrim(message));return rid;end $$;

create function public.review_group_membership(request_id uuid,decision text,reason text) returns void language plpgsql security definer set search_path='' as $$
 declare req public.membership_requests;actor uuid;begin
 select * into req from public.membership_requests where id=request_id;actor:=private.gm_require(req.group_id,'members.review');
 perform 1 from public.repa_groups where id=req.group_id for update;select * into req from public.membership_requests where id=request_id for update;
 if req.status<>'pending' or decision is null or decision not in ('approved','rejected') or coalesce(char_length(btrim(reason)),0) not between 3 and 1000 then raise exception 'Pending request, valid decision and review reason required' using errcode='22023';end if;
 if decision='approved' then perform private.gm_reserve(req.member_id);
 else update public.group_members set status='removed',revision=revision+1,updated_at=now() where id=req.member_id and status='pending';perform private.gm_event(req.group_id,req.member_id,'membership.rejected',btrim(reason));end if;
 update public.membership_requests set status=decision,review_reason=btrim(reason),reviewed_by=actor,reviewed_at=now() where id=request_id;
end $$;

create or replace function public.set_repa_member(target uuid,member_user uuid,assigned boolean) returns void language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.gm_require(target,'members.review');mid uuid;begin
 perform 1 from public.repa_groups where id=target for update;
 if assigned is distinct from true then raise exception 'Use the audited membership status workflow to remove members' using errcode='22023';end if;
 if not exists(select 1 from public.organization_members o join public.repa_groups g on g.organization_id=o.organization_id where g.id=target and o.user_id=member_user) then raise exception 'Choose a current organization member' using errcode='22023';end if;
 insert into public.group_members(group_id,user_id,status) values(target,member_user,'pending') returning id into mid;perform private.gm_reserve(mid);
end $$;

create function public.create_group_invitation(target uuid,invite_email text default null,max_uses integer default 1,expires_hours integer default 168) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.gm_require(target,'members.invite');g public.repa_groups;canonical text:=nullif(lower(btrim(invite_email)),'');token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');iid uuid;uid uuid;can_join boolean;
 begin
 select * into g from public.repa_groups where id=target for update;
 if g.status not in ('draft','enrollment_open','active') or max_uses is null or max_uses not between 1 and 1000 or expires_hours is null or expires_hours not between 1 and 168 or (canonical is not null and (canonical !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(canonical)>254 or max_uses<>1)) then raise exception 'Invalid invitation options or group enrollment is closed' using errcode='22023';end if;
 can_join:=private.authorized(g.organization_id,'organization.staff.manage');
 if canonical is not null then
 select u.id into uid from auth.users u join public.organization_members om on om.user_id=u.id and om.organization_id=g.organization_id where lower(u.email)=canonical;
 if uid is null and not can_join then raise exception 'Only organization owners can invite people who are not organization members' using errcode='42501';end if;
 if exists(select 1 from public.group_members where group_id=target and user_id=uid and status<>'invited') then raise exception 'This person already has a group membership record' using errcode='22023';end if;end if;
 if (select count(*) from public.group_invitations where invited_by=actor and created_at>now()-interval '1 hour')>=30 then raise exception 'Invitation rate limit reached' using errcode='22023';end if;
 update public.group_invitations set revoked_at=now() where group_id=target and email=canonical and expires_at<=now() and revoked_at is null and use_count=0;
 if exists(select 1 from public.group_invitations where group_id=target and email=canonical and revoked_at is null and use_count=0) then raise exception 'An unexpired invitation already exists for this email' using errcode='22023';end if;
 insert into public.group_invitations(group_id,email,token_hash,max_uses,allows_organization_join,invited_by,expires_at)
 values(target,canonical,encode(sha256(convert_to(token,'UTF8')),'hex'),max_uses,can_join,actor,now()+make_interval(hours=>expires_hours)) returning id into iid;
 if uid is not null then insert into public.group_members(group_id,user_id,status) values(target,uid,'invited') on conflict(group_id,user_id) do nothing;end if;
 perform private.gm_event(target,null,'invitation.created','',jsonb_build_object('invitation_id',iid,'email',canonical,'max_uses',max_uses));
 return jsonb_build_object('id',iid,'token',token,'email',canonical,'expires_at',now()+make_interval(hours=>expires_hours));end $$;

create function public.inspect_group_invitation(invitation_id uuid,invitation_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare actor uuid:=private.require_account();i public.group_invitations;g public.repa_groups;begin
 select * into i from public.group_invitations where id=invitation_id and token_hash=encode(sha256(convert_to(invitation_token,'UTF8')),'hex');
 if i.id is null or i.revoked_at is not null or i.expires_at<=now() or (i.email is not null and i.email<>(select lower(email) from auth.users where id=actor)) or (i.use_count>=i.max_uses and not exists(select 1 from public.membership_requests r join public.group_members m on m.id=r.member_id where r.invitation_id=i.id and m.user_id=actor)) then raise exception 'Invitation is invalid, expired, used, revoked, or belongs to another email' using errcode='22023';end if;
 select * into g from public.repa_groups where id=i.group_id;
 if g.status not in ('draft','enrollment_open','active') or not exists(select 1 from public.organizations where id=g.organization_id and status='active') then raise exception 'Group enrollment is unavailable' using errcode='22023';end if;
 return jsonb_build_object('group_id',g.id,'group_name',g.name,'organization_id',g.organization_id,'organization_name',(select name from public.organizations where id=g.organization_id),'expires_at',i.expires_at,'allows_organization_join',i.allows_organization_join,'already_requested',exists(select 1 from public.membership_requests r join public.group_members m on m.id=r.member_id where r.invitation_id=i.id and m.user_id=actor));end $$;

create function public.redeem_group_invitation(invitation_id uuid,invitation_token text,message text default '') returns uuid language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.require_account();i public.group_invitations;g public.repa_groups;mid uuid;rid uuid;c jsonb;begin
 select g0.* into g from public.repa_groups g0 join public.group_invitations i0 on i0.group_id=g0.id where i0.id=invitation_id for update of g0;
 perform public.inspect_group_invitation(invitation_id,invitation_token);
 select * into i from public.group_invitations where id=invitation_id for update;
 select r.id into rid from public.membership_requests r join public.group_members m on m.id=r.member_id where r.invitation_id=i.id and m.user_id=actor;if rid is not null then return g.id;end if;
 if i.use_count>=i.max_uses or message is null or char_length(message)>1000 then raise exception 'Invitation is exhausted or request message is invalid' using errcode='22023';end if;
 if not private.is_organization_member(g.organization_id) then
 if not i.allows_organization_join then raise exception 'Join the organization through its owner first' using errcode='42501';end if;
 insert into public.organization_members(organization_id,user_id,role) values(g.organization_id,actor,'member') on conflict(organization_id,user_id) do nothing;end if;
 select id into mid from public.group_members where group_id=g.id and user_id=actor;
 if mid is null then insert into public.group_members(group_id,user_id,status) values(g.id,actor,'pending') returning id into mid;
 elsif exists(select 1 from public.group_members where id=mid and status='invited') then update public.group_members set status='pending',revision=revision+1,updated_at=now() where id=mid;
 else raise exception 'A membership record already exists for this group' using errcode='22023';end if;
 insert into public.membership_requests(group_id,member_id,invitation_id,message) values(g.id,mid,i.id,btrim(message)) returning id into rid;
 c:=private.repa_config(coalesce(g.accepted_version_id,g.latest_version_id));
 if g.accepted_version_id is null and c#>'{membership,approval_required}'='false'::jsonb then
 perform private.gm_reserve(mid);update public.membership_requests set status='approved',review_reason='Automatic approval under published membership policy',reviewed_at=now(),reviewed_by=actor where id=rid;end if;
 update public.group_invitations set use_count=use_count+1 where id=i.id;
 perform private.gm_event(g.id,mid,'invitation.redeemed','',jsonb_build_object('invitation_id',i.id));return g.id;end $$;

create function public.revoke_group_invitation(invitation_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare gid uuid;begin select group_id into gid from public.group_invitations where id=invitation_id;perform private.gm_require(gid,'members.invite');perform 1 from public.repa_groups where id=gid for update;
 update public.group_invitations set revoked_at=coalesce(revoked_at,now()) where id=invitation_id;perform private.gm_event(gid,null,'invitation.revoked','',jsonb_build_object('invitation_id',invitation_id));end $$;
create function public.claim_group_invitation_delivery(invitation_id uuid,invitation_token text) returns jsonb language plpgsql security definer set search_path='' as $$
 declare i public.group_invitations;g public.repa_groups;begin
 select * into i from public.group_invitations where id=invitation_id;perform private.gm_require(i.group_id,'members.invite');perform 1 from public.repa_groups where id=i.group_id for update;
 select * into i from public.group_invitations where id=invitation_id for update;
 if not exists(select 1 from public.repa_groups where id=i.group_id and status in ('draft','enrollment_open','active')) then raise exception 'Group enrollment is unavailable' using errcode='22023';end if;
 if invitation_token is null or i.token_hash<>encode(sha256(convert_to(invitation_token,'UTF8')),'hex') or i.email is null or i.revoked_at is not null or i.expires_at<=now() or i.use_count>=i.max_uses or i.delivery_attempted_at>now()-interval '1 minute' then raise exception 'Delivery unavailable or retry rate limited' using errcode='22023';end if;
 update public.group_invitations set delivery_attempted_at=now() where id=i.id;select * into g from public.repa_groups where id=i.group_id;
 return jsonb_build_object('email',i.email,'organization_name',(select name from public.organizations where id=g.organization_id),'group_name',g.name);end $$;

create function public.accept_group_agreement(target uuid,rules_version uuid,expected_policy uuid,acknowledgements jsonb,custom_values jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.require_account();g public.repa_groups;m public.group_members;p public.group_agreement_policies;c jsonb;defs jsonb;errors jsonb;seat integer;replacement public.membership_replacements;
 begin
 select * into g from public.repa_groups where id=target for update;select * into m from public.group_members where group_id=target and user_id=actor for update;
 if g.id is null or m.id is null or m.status not in ('approved','active','pending') or g.status in ('completed','cancelled','archived') or not private.is_organization_member(g.organization_id) then raise exception 'Eligible group membership required' using errcode='42501';end if;
 if rules_version is null or rules_version not in (g.latest_version_id,coalesce(g.accepted_version_id,g.latest_version_id)) then raise exception 'Rules changed; review the current version' using errcode='40001';end if;
 select * into p from public.group_agreement_policies where version_id=rules_version and id=expected_policy;
 if p.id is null then raise exception 'Published agreement policy changed or is missing' using errcode='40001';end if;
 if jsonb_typeof(acknowledgements) is distinct from 'object' or acknowledgements<>'{"contribution":true,"schedule":true,"deadlines":true,"reward":true,"mechanism":true,"selection":true,"late_policy":true,"refund_exit":true,"disputes":true,"privacy":true}'::jsonb then raise exception 'Review and explicitly accept every required agreement section' using errcode='22023';end if;
 seat:=m.slot;
 if m.status='pending' then select * into replacement from public.membership_replacements where incoming_member_id=m.id and status='pending' and rules_version_id=rules_version;
 if replacement.id is null then raise exception 'Approval and an assigned slot are required before acceptance' using errcode='22023';end if;seat:=replacement.member_slot;end if;
 c:=private.repa_config(rules_version);errors:=private.repa_config_errors(c);
 select coalesce(jsonb_agg(value),'[]') into defs from jsonb_array_elements(c->'fields') where value->>'category'='membership';
 errors:=errors||private.repa_dynamic_errors(defs,custom_values,true)||private.repa_upload_errors(defs,custom_values,target);
 if jsonb_array_length(errors)>0 then raise exception 'Agreement fields are incomplete: %',errors using errcode='22023';end if;
 if exists(select 1 from public.group_agreements a where a.member_id=m.id and a.rules_version_id=rules_version and a.agreement_context=case when replacement.id is null then 'enrollment' else 'replacement:'||replacement.id::text end) then return;end if;
 insert into public.group_agreements(group_id,member_id,rules_version_id,policy_id,member_slot,agreement_context,acknowledgements,custom_values,snapshot,accepted_by)
 values(target,m.id,rules_version,p.id,seat,case when replacement.id is null then 'enrollment' else 'replacement:'||replacement.id::text end,acknowledgements,custom_values,jsonb_build_object('configuration',c,'policies',to_jsonb(p),'slot',seat,'replacement',case when replacement.id is null then null else to_jsonb(replacement) end),actor);
 insert into public.repa_member_consents(version_id,user_id,custom_values) values(rules_version,actor,custom_values) on conflict do nothing;
 update public.group_members set accepted_rules_version=rules_version,accepted_at=now(),revision=revision+1,updated_at=now() where id=m.id;
 perform private.gm_event(target,m.id,'agreement.accepted','All ten sections accepted',jsonb_build_object('rules_version',rules_version,'policy_id',p.id));end $$;

create or replace function public.consent_repa_rules(target_version uuid,custom_values jsonb) returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'Review all membership agreement sections on the agreement acceptance page' using errcode='22023';end $$;

do $$begin execute replace(replace(pg_get_functiondef('public.check_repa_activation(uuid,uuid)'::regprocedure),'FUNCTION public.check_repa_activation(','FUNCTION private.phase3_check_repa_activation('),'check_repa_activation.version_id','phase3_check_repa_activation.version_id');end $$;
create or replace function public.check_repa_activation(target uuid,version_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare report jsonb;errors jsonb;count_members integer;count_agreed integer;begin
 report:=private.phase3_check_repa_activation(target,version_id);errors:=report->'errors';
 if not exists(select 1 from public.group_agreement_policies p where p.version_id=check_repa_activation.version_id) then errors:=errors||'["Publish the refund/exit, dispute and privacy policies for this rules version."]';end if;
 select count(*) into count_members from public.group_members where group_id=target and status in ('approved','active');
 select count(*) into count_agreed from public.group_members m join public.group_agreements a on a.member_id=m.id and a.rules_version_id=version_id and a.member_slot=m.slot where m.group_id=target and m.status in ('approved','active');
 if count_members<>(private.repa_config(version_id)#>>'{contribution,member_count}')::integer or count_agreed<>count_members then errors:=errors||'["Every configured member must accept all ten agreement sections for this exact version and slot."]';end if;
 report:=report||jsonb_build_object('errors',errors,'valid',jsonb_array_length(errors)=0,'member_consents',count_agreed);
 insert into public.group_activation_checks(group_id,version_id,passed,result,checked_by,checked_at) values(target,version_id,(report->>'valid')::boolean,report,auth.uid(),clock_timestamp());return report;end $$;

create function private.gm_activation_sync() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.accepted_version_id is null and new.accepted_version_id is not null then
 update public.group_members set status='active',revision=revision+1,updated_at=now() where group_id=new.id and status='approved';
 perform private.gm_snapshot_obligations(new.id);
 perform private.gm_refresh_closure(new.id);
 insert into public.membership_events(group_id,member_id,actor_id,event_type,details) select new.id,m.id,auth.uid(),'membership.activated',jsonb_build_object('rules_version',new.accepted_version_id) from public.group_members m where m.group_id=new.id and m.status='active';
 end if;return new;end $$;
create trigger group_membership_activation after update of accepted_version_id on public.repa_groups for each row execute function private.gm_activation_sync();

create function private.gm_financial_summary(member uuid,for_round integer default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare m public.group_members;g public.repa_groups;c jsonb;due_total bigint;paid_total bigint;due_round bigint;paid_round bigint;r integer;eligible boolean:=true;reasons jsonb:='[]';received boolean;cutoff timestamptz;begin
 select * into m from public.group_members where id=member;select * into g from public.repa_groups where id=m.group_id;c:=private.repa_config(coalesce(g.accepted_version_id,g.latest_version_id));
 r:=coalesce(for_round,(select max(round_number) from public.group_member_obligations where group_id=g.id and grace_ends_at<=now()),1);
 select coalesce(sum(o.due_minor),0),coalesce(sum((select coalesce(sum(f.amount_minor),0) from public.group_member_financial_events f where f.obligation_id=o.id)),0) into due_total,paid_total from public.group_member_obligations o where o.group_id=g.id and (o.original_member_id=member or exists(select 1 from public.membership_obligation_transfers t where t.obligation_id=o.id and t.to_member_id=member)) and private.gm_obligation_owner(o.id)=member;
 select coalesce(sum(o.due_minor),0),coalesce(sum((select coalesce(sum(f.amount_minor),0) from public.group_member_financial_events f where f.obligation_id=o.id)),0) into due_round,paid_round from public.group_member_obligations o where o.group_id=g.id and (o.original_member_id=member or exists(select 1 from public.membership_obligation_transfers t where t.obligation_id=o.id and t.to_member_id=member)) and private.gm_obligation_owner(o.id)=member and o.round_number<=r;
 received:=exists(select 1 from public.group_member_financial_events where member_id=member and kind='reward_received');
 select max(grace_ends_at) into cutoff from public.group_member_obligations where group_id=g.id and round_number=r;
 if m.status<>'active' then reasons:=reasons||'["Membership is not active."]';end if;
 if g.status<>'active' or g.accepted_version_id is null then reasons:=reasons||'["The group is not active."]';end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id join public.organization_members om on om.user_id=p.id and om.organization_id=g.organization_id where p.id=m.user_id and p.account_status='active' and p.profile_completed_at is not null and u.email_confirmed_at is not null) then reasons:=reasons||'["Verified active organization membership and a completed profile are required."]';end if;
 if not exists(select 1 from public.group_agreements where member_id=member and rules_version_id=g.accepted_version_id and member_slot=m.slot) then reasons:=reasons||'["The accepted rules and supplemental policies have not been accepted."]';end if;
 if received then reasons:=reasons||'["This member already received the cycle reward."]';end if;
 if cutoff is null or cutoff>now() then reasons:=reasons||'["The selected round deadline and grace period have not ended."]';end if;
 if due_round=0 or paid_round*100<due_round*(case when c#>>'{distribution,eligibility}'='fully_paid' then 100 else (c#>>'{distribution,minimum_percent}')::integer end) then reasons:=reasons||'["The required contributions through this round are not fully met."]';end if;
 if g.mechanism='rotating' and (c#>'{distribution,rotation_order}'->>(r-1))::integer is distinct from m.slot then reasons:=reasons||'["This member is not the configured rotating recipient for this round."]';end if;
 if g.mechanism='pooled_savings' and r<>(c#>>'{contribution,round_count}')::integer then reasons:=reasons||'["Pooled rewards are distributed only at the end of the cycle."]';end if;
 eligible:=jsonb_array_length(reasons)=0;
 return jsonb_build_object('due_minor',due_total,'credited_minor',paid_total,'outstanding_minor',greatest(0,due_total-paid_total),'due_through_round_minor',due_round,'credited_through_round_minor',paid_round,'round',r,'eligible',eligible,'reasons',reasons,'reward_received',received,'eligibility_is_selection',false);
end $$;

create function public.change_group_member_status(member_id uuid,expected_revision integer,new_status text,reason text) returns void language plpgsql security definer set search_path='' as $$
 declare m public.group_members;actor uuid;summary jsonb;old_status text;begin
 select * into m from public.group_members where id=member_id;actor:=private.gm_require(m.group_id,case when new_status='suspended' then 'members.suspend' else 'members.review' end);
 perform 1 from public.repa_groups where id=m.group_id for update;select * into m from public.group_members where id=member_id for update;old_status:=m.status;
 if expected_revision is null or m.revision<>expected_revision then raise exception 'Membership changed; reload before continuing' using errcode='40001';end if;
 if coalesce(char_length(btrim(reason)),0) not between 10 and 1000 or new_status is null or not((m.status in ('approved','active') and new_status='suspended') or (m.status='suspended' and new_status in ('approved','active')) or (m.status in ('invited','pending','approved','active','suspended') and new_status in ('withdrawn','removed'))) then raise exception 'Invalid membership transition or missing explanation' using errcode='22023';end if;
 if new_status in ('withdrawn','removed') then
 summary:=private.gm_financial_summary(m.id);
 if (summary->>'outstanding_minor')::bigint>0 then raise exception 'Outstanding contributions must be settled; suspension preserves access restrictions without erasing obligations' using errcode='22023';end if;
 if m.status in ('active','suspended') and exists(select 1 from public.repa_groups where id=m.group_id and status in ('active','paused')) then raise exception 'Active cycle exits require controlled replacement or group closure' using errcode='22023';end if;
 if exists(select 1 from public.membership_replacements where status='pending' and (outgoing_member_id=m.id or incoming_member_id=m.id)) then raise exception 'Resolve the pending replacement first' using errcode='22023';end if;end if;
 if new_status in ('active','approved') and new_status<>(case when exists(select 1 from public.repa_groups where id=m.group_id and accepted_version_id is not null) then 'active' else 'approved' end) then raise exception 'Resume to the correct group lifecycle status' using errcode='22023';end if;
 update public.group_members set status=new_status,revision=revision+1,updated_at=now() where id=m.id;perform private.gm_sync_access(m.id);
 if new_status in ('withdrawn','removed') then update public.membership_requests set status='cancelled',review_reason=btrim(reason),reviewed_by=actor,reviewed_at=now() where member_id=m.id and status='pending';end if;
 perform private.gm_event(m.group_id,m.id,'membership.status_changed',btrim(reason),jsonb_build_object('previous',old_status,'next',new_status,'financial_history_retained',true));end $$;

create function public.set_group_staff_permissions(target uuid,staff_user uuid,permissions text[],reason text) returns void language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.repa_manage(target);begin
 perform 1 from public.repa_groups where id=target for update;
 if staff_user=actor or permissions is null or cardinality(permissions)>7 or (select count(distinct p) from unnest(permissions) p)<>cardinality(permissions) or coalesce(char_length(btrim(reason)),0) not between 10 and 1000 then raise exception 'Choose another staff account, unique permissions and an audit reason' using errcode='22023';end if;
 if not exists(select 1 from public.organization_members om join public.repa_groups g on g.organization_id=om.organization_id join public.profiles p on p.id=om.user_id join auth.users u on u.id=p.id where g.id=target and om.user_id=staff_user and om.role in ('organizer','treasurer') and p.account_status='active' and p.profile_completed_at is not null and u.email_confirmed_at is not null) or not exists(select 1 from auth.mfa_factors where user_id=staff_user and status='verified') then raise exception 'Choose verified, profile-complete organization staff with MFA enrolled' using errcode='22023';end if;
 insert into public.group_staff_permissions(group_id,user_id,permissions,assigned_by) values(target,staff_user,permissions,actor) on conflict(group_id,user_id) do update set permissions=excluded.permissions,assigned_by=excluded.assigned_by,updated_at=now();
 perform private.gm_event(target,null,'staff.permissions_changed',btrim(reason),jsonb_build_object('staff_user',staff_user,'permissions',permissions));end $$;

create function public.record_group_member_financial_event(member_id uuid,event_kind text,obligation_id uuid,round_number integer,amount_minor bigint,external_reference text,evidence_note text) returns uuid language plpgsql security definer set search_path='' as $$
 declare m public.group_members;g public.repa_groups;actor uuid;o public.group_member_obligations;existing public.group_member_financial_events;event_id uuid;remaining bigint;key text;summary jsonb;begin
 select * into m from public.group_members where id=member_id;actor:=private.gm_require(m.group_id,case when event_kind='contribution_credit' then 'finance.record' else 'rewards.record' end);
 select * into g from public.repa_groups where id=m.group_id for update;
 if event_kind is null or event_kind not in ('contribution_credit','reward_received') or amount_minor is null or amount_minor<=0 or amount_minor>1000000000000000 or g.accepted_version_id is null or coalesce(char_length(btrim(external_reference)),0) not between 3 and 200 or coalesce(char_length(btrim(evidence_note)),0) not between 10 and 2000 then raise exception 'Verified history requires valid type, amount, reference and evidence note' using errcode='22023';end if;
 select * into existing from public.group_member_financial_events f where f.group_id=g.id and f.external_reference=btrim(record_group_member_financial_event.external_reference);
 if existing.id is not null then
 if row(existing.member_id,existing.kind,existing.obligation_id,existing.round_number,existing.amount_minor,existing.evidence_note) is distinct from row(m.id,event_kind,record_group_member_financial_event.obligation_id,record_group_member_financial_event.round_number,record_group_member_financial_event.amount_minor,btrim(record_group_member_financial_event.evidence_note)) then raise exception 'Reference already used with different facts' using errcode='40001';end if;return existing.id;end if;
 if event_kind='contribution_credit' then
 select * into o from public.group_member_obligations where id=record_group_member_financial_event.obligation_id;
 if o.id is null or o.group_id<>g.id or private.gm_obligation_owner(o.id)<>m.id or o.round_number is distinct from record_group_member_financial_event.round_number then raise exception 'Obligation is unavailable for this member' using errcode='22023';end if;
 select o.due_minor-coalesce(sum(f.amount_minor),0) into remaining from public.group_member_financial_events f where f.obligation_id=o.id;
 if amount_minor>remaining then raise exception 'Credit exceeds the remaining obligation' using errcode='22023';end if;
 else
 if obligation_id is not null or round_number is null or round_number not between 1 and (private.repa_config(g.accepted_version_id)#>>'{contribution,round_count}')::integer then raise exception 'Valid reward round required' using errcode='22023';end if;
 summary:=private.gm_financial_summary(m.id,round_number);if (summary->>'eligible')::boolean is distinct from true then raise exception 'Member is not payout eligible: %',summary->'reasons' using errcode='22023';end if;
 key:=case when g.mechanism='pooled_savings' then 'member:'||m.id::text else 'round:'||round_number::text end;
 end if;
 insert into public.group_member_financial_events(group_id,member_id,rules_version_id,kind,obligation_id,round_number,amount_minor,external_reference,evidence_note,reward_key,recorded_by)
 values(g.id,m.id,g.accepted_version_id,event_kind,record_group_member_financial_event.obligation_id,record_group_member_financial_event.round_number,record_group_member_financial_event.amount_minor,btrim(record_group_member_financial_event.external_reference),btrim(record_group_member_financial_event.evidence_note),key,actor) returning id into event_id;
 perform private.gm_refresh_closure(g.id);perform private.gm_event(g.id,m.id,'financial_history.recorded',btrim(evidence_note),jsonb_build_object('kind',event_kind,'event_id',event_id,'reference',btrim(external_reference)));return event_id;end $$;

create function private.gm_replacement_check(replacement public.membership_replacements) returns void language plpgsql stable security definer set search_path='' as $$
 declare r public.membership_replacements:=replacement;g public.repa_groups;begin
 select * into g from public.repa_groups where id=r.group_id;
 if g.status not in ('active','paused') or g.accepted_version_id is distinct from r.rules_version_id or not exists(select 1 from public.group_members where id=r.outgoing_member_id and status in ('active','suspended') and slot=r.member_slot) or not exists(select 1 from public.group_members m join public.profiles p on p.id=m.user_id join auth.users u on u.id=p.id where m.id=r.incoming_member_id and m.status='pending' and m.slot is null and p.account_status='active' and p.profile_completed_at is not null and u.email_confirmed_at is not null and exists(select 1 from public.organization_members where organization_id=g.organization_id and user_id=m.user_id)) then raise exception 'Replacement participants or accepted group rules are no longer eligible' using errcode='22023';end if;
 if exists(select 1 from public.group_member_financial_events where member_id=r.outgoing_member_id and kind='reward_received') then raise exception 'A member who already received the reward cannot transfer remaining cycle obligations' using errcode='22023';end if;
 if g.mechanism='rotating' and (select n from jsonb_array_elements_text(private.repa_config(g.accepted_version_id)#>'{distribution,rotation_order}') with ordinality x(slot,n) where slot::integer=r.member_slot)<r.from_round then raise exception 'An earlier rotating recipient entitlement must be resolved before replacement' using errcode='22023';end if;
 if not exists(select 1 from public.group_member_obligations o where o.group_id=r.group_id and private.gm_obligation_owner(o.id)=r.outgoing_member_id and o.round_number=r.from_round and o.due_at>now()) then raise exception 'Replacement must start on an existing future round' using errcode='22023';end if;
 if exists(select 1 from public.group_member_obligations o where o.group_id=r.group_id and private.gm_obligation_owner(o.id)=r.outgoing_member_id and o.round_number<r.from_round and o.due_minor>(select coalesce(sum(f.amount_minor),0) from public.group_member_financial_events f where f.obligation_id=o.id)) then raise exception 'Settle all earlier contributions before replacement' using errcode='22023';end if;
 if exists(select 1 from public.group_member_obligations o where o.group_id=r.group_id and private.gm_obligation_owner(o.id)=r.outgoing_member_id and o.round_number>=r.from_round and (o.due_at<=now() or exists(select 1 from public.group_member_financial_events f where f.obligation_id=o.id))) then raise exception 'Accrued or prepaid obligations cannot be transferred' using errcode='22023';end if;
end $$;

create function public.propose_group_member_replacement(outgoing_member uuid,incoming_member uuid,from_round integer,reason text) returns uuid language plpgsql security definer set search_path='' as $$
 declare m public.group_members;g public.repa_groups;r public.membership_replacements;actor uuid;begin
 select * into m from public.group_members where id=outgoing_member;actor:=private.repa_manage(m.group_id);select * into g from public.repa_groups where id=m.group_id for update;
 if not exists(select 1 from public.group_members where id=incoming_member and group_id=g.id) or coalesce(char_length(btrim(reason)),0) not between 10 and 1000 then raise exception 'Choose an incoming pending member in this group and provide a reason' using errcode='22023';end if;
 r.group_id:=g.id;r.outgoing_member_id:=m.id;r.incoming_member_id:=incoming_member;r.rules_version_id:=g.accepted_version_id;r.from_round:=from_round;r.member_slot:=m.slot;
 perform private.gm_replacement_check(r);
 insert into public.membership_replacements(group_id,outgoing_member_id,incoming_member_id,rules_version_id,from_round,member_slot,reason,proposed_by) values(g.id,m.id,incoming_member,g.accepted_version_id,from_round,m.slot,btrim(reason),actor) returning id into r.id;
 perform private.gm_event(g.id,m.id,'replacement.proposed',btrim(reason),jsonb_build_object('replacement_id',r.id,'incoming_member',incoming_member,'from_round',from_round));return r.id;end $$;

create function public.accept_group_member_replacement(replacement_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.require_account();r public.membership_replacements;begin
 select * into r from public.membership_replacements where id=replacement_id;perform 1 from public.repa_groups where id=r.group_id for update;select * into r from public.membership_replacements where id=replacement_id for update;
 if r.id is null or r.status<>'pending' or not exists(select 1 from public.group_members where id in (r.outgoing_member_id,r.incoming_member_id) and user_id=actor) then raise exception 'Only a replacement participant may consent' using errcode='42501';end if;
 perform private.gm_replacement_check(r);
 if exists(select 1 from public.group_members where id=r.incoming_member_id and user_id=actor) then
 if not exists(select 1 from public.group_agreements where member_id=r.incoming_member_id and rules_version_id=r.rules_version_id and snapshot#>>'{replacement,id}'=r.id::text) then raise exception 'Review and accept the replacement agreement first' using errcode='22023';end if;
 update public.membership_replacements set incoming_accepted_at=coalesce(incoming_accepted_at,now()) where id=r.id;
 else update public.membership_replacements set outgoing_accepted_at=coalesce(outgoing_accepted_at,now()) where id=r.id;end if;
 perform private.gm_event(r.group_id,case when private.gm_owns(r.incoming_member_id) then r.incoming_member_id else r.outgoing_member_id end,'replacement.accepted','Future obligations transfer only',jsonb_build_object('replacement_id',r.id));end $$;

create function public.complete_group_member_replacement(replacement_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare r public.membership_replacements;actor uuid;o public.group_member_obligations;begin
 select * into r from public.membership_replacements where id=replacement_id;actor:=private.repa_manage(r.group_id);perform 1 from public.repa_groups where id=r.group_id for update;select * into r from public.membership_replacements where id=replacement_id for update;
 if r.status<>'pending' or r.outgoing_accepted_at is null or r.incoming_accepted_at is null then raise exception 'Both participants must accept this pending replacement' using errcode='22023';end if;perform private.gm_replacement_check(r);
 for o in select * from public.group_member_obligations where group_id=r.group_id and private.gm_obligation_owner(id)=r.outgoing_member_id and round_number>=r.from_round loop insert into public.membership_obligation_transfers(obligation_id,replacement_id,from_member_id,to_member_id) values(o.id,r.id,r.outgoing_member_id,r.incoming_member_id);end loop;
 update public.group_members set status='withdrawn',revision=revision+1,updated_at=now() where id=r.outgoing_member_id;perform private.gm_sync_access(r.outgoing_member_id);
 update public.group_members set status='active',slot=r.member_slot,revision=revision+1,updated_at=now() where id=r.incoming_member_id;perform private.gm_sync_access(r.incoming_member_id);
 update public.membership_replacements set status='completed',completed_at=now() where id=r.id;
 update public.membership_requests set status='approved',review_reason='Controlled replacement completed',reviewed_by=actor,reviewed_at=now() where member_id=r.incoming_member_id and status='pending';
 perform private.gm_event(r.group_id,r.outgoing_member_id,'replacement.completed',r.reason,jsonb_build_object('replacement_id',r.id,'incoming_member',r.incoming_member_id,'from_round',r.from_round,'historical_obligations_retained',true));
 perform private.gm_event(r.group_id,r.incoming_member_id,'replacement.joined',r.reason,jsonb_build_object('replacement_id',r.id,'slot',r.member_slot));end $$;
create function public.cancel_group_member_replacement(replacement_id uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
 declare r public.membership_replacements;begin select * into r from public.membership_replacements where id=replacement_id;perform private.repa_manage(r.group_id);perform 1 from public.repa_groups where id=r.group_id for update;
 if coalesce(char_length(btrim(reason)),0) not between 10 and 1000 then raise exception 'Cancellation reason required' using errcode='22023';end if;
 update public.membership_replacements set status='cancelled' where id=r.id and status='pending';if not found then raise exception 'Only pending replacements can be cancelled' using errcode='22023';end if;perform private.gm_event(r.group_id,r.outgoing_member_id,'replacement.cancelled',btrim(reason),jsonb_build_object('replacement_id',r.id));end $$;

create function private.gm_refresh_closure(target uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.group_member_obligations o where o.group_id=target and o.due_minor>(select coalesce(sum(f.amount_minor),0) from public.group_member_financial_events f where f.obligation_id=o.id)) then
 insert into public.organization_closure_blocks(organization_id,source_kind,source_id,reason) select organization_id,'group_membership_obligations',id,'Recorded REPA membership obligations remain outstanding' from public.repa_groups where id=target
 on conflict(source_kind,source_id) do update set resolved_at=null;
 else update public.organization_closure_blocks set resolved_at=now() where source_kind='group_membership_obligations' and source_id=target and resolved_at is null;end if;end $$;
do $$declare gid uuid;begin for gid in select id from public.repa_groups where accepted_version_id is not null loop perform private.gm_refresh_closure(gid);end loop;end $$;
create function private.gm_completion_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='completed' and old.status<>'completed' and exists(select 1 from public.group_member_obligations o where o.group_id=new.id and o.due_minor>(select coalesce(sum(f.amount_minor),0) from public.group_member_financial_events f where f.obligation_id=o.id)) then raise exception 'Outstanding recorded member obligations prevent completion' using errcode='22023';end if;return new;end $$;
create trigger group_membership_completion before update of status on public.repa_groups for each row execute function private.gm_completion_guard();

create function public.get_group_agreement(target uuid,rules_version uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare actor uuid:=private.require_account();g public.repa_groups;m public.group_members;vid uuid;begin
 select * into g from public.repa_groups where id=target;select * into m from public.group_members where group_id=target and user_id=actor;
 if g.id is null or (m.id is null and not private.gm_can(target,'members.read')) then raise exception 'Membership required to review this agreement' using errcode='42501';end if;
 vid:=coalesce(rules_version,g.accepted_version_id,g.latest_version_id);
 if vid not in (g.latest_version_id,coalesce(g.accepted_version_id,g.latest_version_id)) then raise exception 'Select the current candidate or accepted version' using errcode='22023';end if;
 return jsonb_build_object('group',jsonb_build_object('id',g.id,'name',g.name,'status',g.status,'organization_id',g.organization_id),'member',to_jsonb(m),'version_id',vid,
 'version_number',(select version_number from public.group_config_versions where id=vid),'configuration',private.repa_config(vid),
 'policies',(select to_jsonb(p) from public.group_agreement_policies p where p.version_id=vid),
 'agreement',(select to_jsonb(a) from public.group_agreements a where a.member_id=m.id and a.rules_version_id=vid and (m.status<>'pending' or a.agreement_context=(select 'replacement:'||r.id::text from public.membership_replacements r where r.incoming_member_id=m.id and r.status='pending')) order by a.accepted_at desc limit 1),
 'replacement',(select to_jsonb(r) from public.membership_replacements r where r.group_id=target and r.incoming_member_id=m.id and r.rules_version_id=vid and r.status='pending'));
end $$;

create function public.get_group_membership_workspace(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare actor uuid:=private.require_account();full_roster boolean;g public.repa_groups;caps jsonb;begin
 if private.repa_can_read(target) is distinct from true then raise exception 'Group access denied' using errcode='42501';end if;
 select * into g from public.repa_groups where id=target;full_roster:=coalesce(private.gm_can(target,'members.read'),false) or coalesce(private.gm_can(target,'finance.read'),false);
 select coalesce(jsonb_agg(cap),'[]') into caps from unnest(array['members.read','members.invite','members.review','members.suspend','finance.read','finance.record','rewards.record']) cap where private.gm_can(target,cap);
 return jsonb_build_object('group_id',target,'capabilities',caps,'can_manage',private.authorized(g.organization_id,'groups.manage',target),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'user_id',m.user_id,'name',p.full_name,'status',m.status,'slot',m.slot,'revision',m.revision,'accepted_rules_version',m.accepted_rules_version,'accepted_at',m.accepted_at,
 'agreement_complete',exists(select 1 from public.group_agreements a where a.member_id=m.id and a.rules_version_id=g.latest_version_id and a.member_slot=m.slot),
 'financial',case when m.user_id=actor or private.gm_can(target,'finance.read') then private.gm_financial_summary(m.id) else null end,
 'reward_received',exists(select 1 from public.group_member_financial_events f where f.member_id=m.id and f.kind='reward_received')) order by m.created_at),'[]') from public.group_members m join public.profiles p on p.id=m.user_id where m.group_id=target and (full_roster or m.user_id=actor)),
 'requests',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('name',p.full_name) order by r.created_at desc),'[]') from public.membership_requests r join public.group_members m on m.id=r.member_id join public.profiles p on p.id=m.user_id where r.group_id=target and (private.gm_can(target,'members.review') or m.user_id=actor)),
 'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'max_uses',i.max_uses,'use_count',i.use_count,'expires_at',i.expires_at,'revoked_at',i.revoked_at) order by i.created_at desc),'[]') from public.group_invitations i where i.group_id=target and private.gm_can(target,'members.invite')),
 'replacements',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('outgoing_name',(select p.full_name from public.group_members m join public.profiles p on p.id=m.user_id where m.id=r.outgoing_member_id),'incoming_name',(select p.full_name from public.group_members m join public.profiles p on p.id=m.user_id where m.id=r.incoming_member_id)) order by r.created_at desc),'[]') from public.membership_replacements r where r.group_id=target and (full_roster or private.gm_owns(r.outgoing_member_id) or private.gm_owns(r.incoming_member_id))),
 'staff',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.group_staff_permissions s where s.group_id=target and private.authorized(g.organization_id,'groups.manage',target)),
 'events',(select coalesce(jsonb_agg(e order by e.id desc),'[]') from (select * from public.membership_events e where e.group_id=target and (private.gm_can(target,'members.read') or private.gm_owns(e.member_id) or (private.gm_can(target,'finance.read') and e.event_type like 'financial_history.%')) order by e.id desc limit 100) e),
 'policies',(select to_jsonb(p) from public.group_agreement_policies p where p.version_id=g.latest_version_id),
 'reserved_members',(select count(*) from public.group_members where group_id=target and status in ('approved','active','suspended')),
 'member_limit',(private.repa_config(coalesce(g.accepted_version_id,g.latest_version_id))#>>'{membership,limit}')::integer);
end $$;

create function public.get_group_member_profile(member_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare actor uuid:=private.require_account();m public.group_members;can_finance boolean;begin
 select * into m from public.group_members where id=member_id;
 if m.id is null or (not private.gm_owns(m.id) and not private.gm_can(m.group_id,'members.read') and not private.gm_can(m.group_id,'finance.read')) then raise exception 'Member profile access denied' using errcode='42501';end if;
 can_finance:=private.gm_owns(m.id) or private.gm_can(m.group_id,'finance.read');
 return jsonb_build_object('member',to_jsonb(m),'profile',(select jsonb_build_object('full_name',p.full_name,'email',case when private.gm_owns(m.id) or private.gm_can(m.group_id,'members.read') then p.email else null end,'mobile_number',case when private.gm_owns(m.id) or private.gm_can(m.group_id,'members.read') then p.mobile_number else null end,'city_name',p.city_name,'province_name',p.province_name,'region_name',p.region_name) from public.profiles p where p.id=m.user_id),
 'financial',case when can_finance then private.gm_financial_summary(m.id) else null end,
 'obligations',(select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('current_member_id',private.gm_obligation_owner(o.id),'credited_minor',(select coalesce(sum(f.amount_minor),0) from public.group_member_financial_events f where f.obligation_id=o.id)) order by o.round_number),'[]') from public.group_member_obligations o where can_finance and o.group_id=m.group_id and (o.original_member_id=m.id or (exists(select 1 from public.membership_obligation_transfers t where t.obligation_id=o.id and t.to_member_id=m.id) and private.gm_obligation_owner(o.id)=m.id))),
 'financial_events',(select coalesce(jsonb_agg(to_jsonb(f) order by f.recorded_at),'[]') from public.group_member_financial_events f where can_finance and f.member_id=m.id),
 'agreements',(select coalesce(jsonb_agg(to_jsonb(a) order by a.accepted_at desc),'[]') from public.group_agreements a where a.member_id=m.id and (private.gm_owns(m.id) or private.gm_can(m.group_id,'members.read'))),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id desc),'[]') from public.membership_events e where e.member_id=m.id and (private.gm_owns(m.id) or private.gm_can(m.group_id,'members.read') or e.event_type like 'financial_history.%')));end $$;

do $$begin execute replace(pg_get_functiondef('public.get_access_context()'::regprocedure),'FUNCTION public.get_access_context(','FUNCTION private.phase3_get_access_context(');end $$;
create or replace function public.get_access_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare result jsonb:=private.phase3_get_access_context();org jsonb;orgs jsonb:='[]';extras jsonb;begin
 for org in select * from jsonb_array_elements(result->'organizations') loop
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'role','treasurer','permissions',to_jsonb(array_prepend('groups.assigned.read',s.permissions)))),'[]') into extras from public.group_staff_permissions s join public.repa_groups g on g.id=s.group_id where s.user_id=auth.uid() and g.organization_id=(org->>'id')::uuid and private.gm_can(g.id,'group.access') and not exists(select 1 from jsonb_array_elements(org->'groups') x where x->>'id'=g.id::text);
 orgs:=orgs||jsonb_build_array(jsonb_set(org,'{groups}',(org->'groups')||extras));end loop;
 return jsonb_set(result,'{organizations}',orgs);end $$;

alter table public.group_agreement_policies add unique(version_id,id);
alter table public.membership_requests add foreign key(group_id,member_id) references public.group_members(group_id,id);
alter table public.group_agreements add foreign key(group_id,member_id) references public.group_members(group_id,id),add foreign key(group_id,rules_version_id) references public.group_config_versions(group_id,id),add foreign key(rules_version_id,policy_id) references public.group_agreement_policies(version_id,id);
alter table public.membership_events add foreign key(group_id,member_id) references public.group_members(group_id,id);
alter table public.group_member_obligations add unique(group_id,id),add foreign key(group_id,original_member_id) references public.group_members(group_id,id),add foreign key(group_id,rules_version_id) references public.group_config_versions(group_id,id);
alter table public.group_member_financial_events add foreign key(group_id,member_id) references public.group_members(group_id,id),add foreign key(group_id,rules_version_id) references public.group_config_versions(group_id,id),add foreign key(group_id,obligation_id) references public.group_member_obligations(group_id,id);
alter table public.membership_replacements add foreign key(group_id,outgoing_member_id) references public.group_members(group_id,id),add foreign key(group_id,incoming_member_id) references public.group_members(group_id,id),add foreign key(group_id,rules_version_id) references public.group_config_versions(group_id,id);

create function private.gm_identity_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'Membership identities are permanent; change status instead' using errcode='42501';end if;
 if row(new.id,new.group_id,new.user_id,new.created_at) is distinct from row(old.id,old.group_id,old.user_id,old.created_at) then raise exception 'Membership identity cannot be reassigned' using errcode='42501';end if;return new;end $$;
create trigger group_members_identity before update or delete on public.group_members for each row execute function private.gm_identity_guard();
create trigger agreement_policy_immutable before update or delete on public.group_agreement_policies for each row execute function private.repa_immutable();
create trigger group_agreements_immutable before update or delete on public.group_agreements for each row execute function private.repa_immutable();
create trigger membership_events_immutable before update or delete on public.membership_events for each row execute function private.repa_immutable();
create trigger member_obligations_immutable before update or delete on public.group_member_obligations for each row execute function private.repa_immutable();
create trigger member_financial_events_immutable before update or delete on public.group_member_financial_events for each row execute function private.repa_immutable();
create trigger obligation_transfers_immutable before update or delete on public.membership_obligation_transfers for each row execute function private.repa_immutable();

create or replace function private.repa_upload_access(path text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$declare gid uuid;begin
 if path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|jpeg|webp|pdf|txt)$' then return false;end if;gid:=split_part(path,'/',1)::uuid;
 return private.repa_can_read(gid) and case when writing then split_part(path,'/',2)=auth.uid()::text and (
 private.gm_can(gid,'members.review') or exists(select 1 from public.group_members m where m.group_id=gid and m.user_id=auth.uid() and (m.status in ('approved','active') or (m.status='pending' and exists(select 1 from public.membership_replacements r where r.incoming_member_id=m.id and r.status='pending')))))
 else split_part(path,'/',2)=auth.uid()::text or private.gm_can(gid,'members.read') or exists(select 1 from public.group_rules r join public.group_config_versions v on v.id=r.version_id where v.group_id=gid and (r.basic_image_path=path or jsonb_path_exists(r.reward_custom_values,'$.** ? (@ == $file)',jsonb_build_object('file',path)))) end;end $$;

alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;
alter table public.membership_requests enable row level security;
alter table public.group_agreement_policies enable row level security;
alter table public.group_agreements enable row level security;
alter table public.membership_events enable row level security;
alter table public.group_staff_permissions enable row level security;
alter table public.group_member_obligations enable row level security;
alter table public.group_member_financial_events enable row level security;
alter table public.membership_replacements enable row level security;
alter table public.membership_obligation_transfers enable row level security;
revoke all on public.group_members,public.group_invitations,public.membership_requests,public.group_agreement_policies,public.group_agreements,public.membership_events,public.group_staff_permissions,public.group_member_obligations,public.group_member_financial_events,public.membership_replacements,public.membership_obligation_transfers from public,anon,authenticated;
grant select on public.group_members,public.membership_requests,public.group_agreement_policies,public.group_agreements,public.membership_events,public.group_staff_permissions,public.group_member_obligations,public.group_member_financial_events,public.membership_replacements,public.membership_obligation_transfers to authenticated;
grant select(id,group_id,email,max_uses,use_count,allows_organization_join,invited_by,expires_at,revoked_at,created_at) on public.group_invitations to authenticated;
create policy group_members_read on public.group_members for select to authenticated using(private.gm_owns(id) or private.gm_can(group_id,'members.read') or private.gm_can(group_id,'finance.read'));
create policy group_invitations_read on public.group_invitations for select to authenticated using(private.gm_can(group_id,'members.invite'));
create policy membership_requests_read on public.membership_requests for select to authenticated using(private.gm_owns(member_id) or private.gm_can(group_id,'members.review'));
create policy group_agreement_policies_read on public.group_agreement_policies for select to authenticated using(private.repa_version_read(version_id));
create policy group_agreements_read on public.group_agreements for select to authenticated using(private.gm_owns(member_id) or private.gm_can(group_id,'members.read'));
create policy membership_events_read on public.membership_events for select to authenticated using(private.gm_owns(member_id) or private.gm_can(group_id,'members.read') or (private.gm_can(group_id,'finance.read') and event_type like 'financial_history.%'));
create policy group_staff_permissions_read on public.group_staff_permissions for select to authenticated using((user_id=(select auth.uid()) and private.active_user()) or private.gm_can(group_id,'members.read'));
create policy member_obligations_read on public.group_member_obligations for select to authenticated using(private.gm_owns(original_member_id) or private.gm_owns(private.gm_obligation_owner(id)) or private.gm_can(group_id,'finance.read'));
create policy member_financial_events_read on public.group_member_financial_events for select to authenticated using(private.gm_owns(member_id) or private.gm_can(group_id,'finance.read'));
create policy membership_replacements_read on public.membership_replacements for select to authenticated using(private.gm_owns(outgoing_member_id) or private.gm_owns(incoming_member_id) or private.gm_can(group_id,'members.read'));
create policy obligation_transfers_read on public.membership_obligation_transfers for select to authenticated using(private.gm_owns(from_member_id) or private.gm_owns(to_member_id) or exists(select 1 from public.group_member_obligations o where o.id=obligation_id and private.gm_can(o.group_id,'finance.read')));

do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'gm_%' or p.proname in ('authorized','phase3_authorized','phase3_check_repa_activation','phase3_get_access_context')) loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['publish_group_agreement_policy','request_group_membership','review_group_membership','set_repa_member','create_group_invitation','inspect_group_invitation','redeem_group_invitation','revoke_group_invitation','claim_group_invitation_delivery','accept_group_agreement','consent_repa_rules','check_repa_activation','change_group_member_status','set_group_staff_permissions','record_group_member_financial_event','propose_group_member_replacement','accept_group_member_replacement','complete_group_member_replacement','cancel_group_member_replacement','get_group_agreement','get_group_membership_workspace','get_group_member_profile','get_access_context']) loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;
end $$;
grant execute on function private.gm_can(uuid,text),private.gm_owns(uuid),private.gm_obligation_owner(uuid),private.authorized(uuid,text,uuid) to authenticated;
commit;
