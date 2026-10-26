begin;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 email text not null,
 full_name text not null default '' check(char_length(full_name)<=120),
 mobile_number text not null default '' check(char_length(mobile_number)<=30),
 address text check(char_length(address)<=500),
 avatar_path text,
 account_status text not null default 'active' check(account_status in ('active','suspended')),
 notification_settings jsonb not null default '{"email":true,"push":true}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(jsonb_typeof(notification_settings)='object' and notification_settings ?& array['email','push'] and notification_settings - array['email','push']='{}'::jsonb and jsonb_typeof(notification_settings->'email')='boolean' and jsonb_typeof(notification_settings->'push')='boolean')
);
insert into public.profiles(id,email,full_name) select id,coalesce(email,''),left(coalesce(raw_user_meta_data->>'full_name',''),120) from auth.users on conflict do nothing;
create function private.sync_auth_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,email,full_name) values(new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',''),120))
 on conflict(id) do update set email=excluded.email,updated_at=now();
 return new;
end $$;
create trigger sync_auth_profile after insert or update of email on auth.users for each row execute function private.sync_auth_profile();

alter table public.organizations add column description text not null default '' check(char_length(description)<=2000),
 add column logo_path text,add column status text not null default 'active' check(status in ('active','archived')),
 add column updated_at timestamptz not null default now();
alter table public.organization_members add column id uuid not null default gen_random_uuid(),add column updated_at timestamptz not null default now();
alter table public.organization_members drop constraint organization_members_pkey;
alter table public.organization_members add primary key(id), add unique(organization_id,user_id);
alter table public.organization_members drop constraint organization_members_role_check;
alter table public.organization_members add check(role in ('owner','organizer','treasurer','member'));
create unique index one_owner_per_organization on public.organization_members(organization_id) where role='owner';

-- Group identity anchors only. REPA financial configuration belongs to a later migration.
create table public.group_scopes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 name text not null check(char_length(btrim(name)) between 2 and 100),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,organization_id)
);
create table public.group_role_assignments (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 group_id uuid not null,user_id uuid not null,role text not null check(role in ('treasurer','member')),
 assigned_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(group_id,organization_id) references public.group_scopes(id,organization_id),
 foreign key(organization_id,user_id) references public.organization_members(organization_id,user_id) on delete cascade,
 unique(group_id,user_id)
);
create index group_roles_user_idx on public.group_role_assignments(user_id,organization_id);
create index group_scopes_org_idx on public.group_scopes(organization_id);

create table public.organization_invitations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 email text not null check(email=lower(btrim(email)) and char_length(email)<=254),
 role text not null check(role in ('organizer','treasurer','member')),
 token_hash text not null unique,invited_by uuid not null references auth.users(id),
 expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz,accepted_by uuid references auth.users(id),revoked_at timestamptz,
 delivery_attempted_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index one_pending_invitation on public.organization_invitations(organization_id,email) where accepted_at is null and revoked_at is null;
create index invitations_org_idx on public.organization_invitations(organization_id,created_at);

create table public.audit_logs (
 id uuid primary key default gen_random_uuid(),organization_id uuid references public.organizations(id),
 actor_id uuid references auth.users(id),action text not null,entity_id uuid,
 details jsonb not null default '{}',created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs(organization_id,created_at);
create index audit_logs_actor_idx on public.audit_logs(actor_id,created_at);
insert into public.audit_logs(id,organization_id,actor_id,action,entity_id,created_at) select id,organization_id,actor_id,action,entity_id,created_at from public.audit_events;
create trigger immutable_audit_logs before update or delete on public.audit_logs for each row execute function private.reject_audit_mutation();
create function private.mirror_audit_event() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.audit_logs(id,organization_id,actor_id,action,entity_id,created_at) values(new.id,new.organization_id,new.actor_id,new.action,new.entity_id,new.created_at);return new;end $$;
create trigger mirror_audit_event after insert on public.audit_events for each row execute function private.mirror_audit_event();

-- Written only by trusted database administration. No browser-facing grant RPC exists.
create table private.platform_administrators(user_id uuid primary key references auth.users(id),created_at timestamptz not null default now());
alter table private.platform_administrators enable row level security;
create function private.audit_platform_grant() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.audit_logs(actor_id,action,entity_id) values(auth.uid(),case when tg_op='INSERT' then 'platform.admin_granted' else 'platform.admin_revoked' end,case when tg_op='INSERT' then new.user_id else old.user_id end);return null;end $$;
create trigger platform_grant_audit after insert or delete on private.platform_administrators for each row execute function private.audit_platform_grant();
create table public.platform_settings(id boolean primary key default true check(id),support_email text not null default '',updated_at timestamptz not null default now());
insert into public.platform_settings(id) values(true);
-- Future financial modules must register and resolve blockers in their own transactions.
-- No hard delete endpoint exists, even when this registry is empty.
create table public.organization_closure_blocks(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),source_kind text not null,source_id uuid not null,reason text not null,resolved_at timestamptz,created_at timestamptz not null default now(),unique(source_kind,source_id));
create index closure_blocks_org_idx on public.organization_closure_blocks(organization_id) where resolved_at is null;

create function private.active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=auth.uid() and u.email_confirmed_at is not null and p.account_status='active');
$$;
create function private.verified_mfa() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(auth.jwt()->>'aal','aal1')='aal2' and exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified');
$$;
create function private.require_account(mfa boolean default false) returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if not private.active_user() then raise exception 'A verified, active account is required' using errcode='42501';end if;
 if mfa and not private.verified_mfa() then raise exception 'MFA verification is required' using errcode='42501';end if;
 return auth.uid();
end $$;
create or replace function private.is_organization_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.active_user() and exists(select 1 from public.organization_members where organization_id=target and user_id=auth.uid());
$$;
create or replace function private.is_organization_owner(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.active_user() and private.verified_mfa() and exists(select 1 from public.organization_members where organization_id=target and user_id=auth.uid() and role='owner');
$$;
create function private.authorized(target uuid,permission text,group_scope uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
declare member_role text;
begin
 if not private.active_user() then return false;end if;
 if permission in ('profile.self','personal.read') then return true;end if;
 if target is null then
  return private.verified_mfa() and permission in ('platform.accounts.manage','platform.settings.manage','platform.support.resolve','platform.disputes.resolve','platform.analytics.read') and exists(select 1 from private.platform_administrators where user_id=auth.uid());
 end if;
 if not exists(select 1 from public.organizations where id=target and status='active') then return false;end if;
 select role into member_role from public.organization_members where organization_id=target and user_id=auth.uid();
 if member_role is null then return false;end if;
 if permission='organization.read' then return true;end if;
 if not private.verified_mfa() and member_role in ('owner','organizer','treasurer') then return false;end if;
 if permission='groups.join' then return group_scope is null or exists(select 1 from public.group_scopes where id=group_scope and organization_id=target);end if;
 if permission='treasurer.workspace' and member_role='treasurer' then return true;end if;
 if member_role='owner' and permission in ('organization.update','organization.staff.manage','organization.archive','organization.audit.read') then return true;end if;
 if member_role in ('owner','organizer') and permission in ('groups.manage','group.members.manage','group.rules.manage','payments.verify','payouts.manage','reports.organization.read','organization.members.read') then
  return group_scope is null or exists(select 1 from public.group_scopes where id=group_scope and organization_id=target);
 end if;
 if group_scope is null then return false;end if;
 return exists(select 1 from public.group_role_assignments a where a.group_id=group_scope and a.organization_id=target and a.user_id=auth.uid() and ((a.role='treasurer' and member_role='treasurer' and permission in ('groups.assigned.read','payments.cash.record','payments.review','collections.reconcile','reports.assigned.read')) or (a.role='member' and permission in ('groups.joined.read','contributions.self.submit','receipts.self.read','payouts.self.read','obligations.self.read','statements.self.read'))));
end $$;

alter table public.profiles enable row level security;
alter table public.group_scopes enable row level security;
alter table public.group_role_assignments enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_settings enable row level security;
alter table public.organization_closure_blocks enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or private.authorized(null,'platform.accounts.manage'));
create policy group_scopes_read on public.group_scopes for select to authenticated using(private.authorized(organization_id,'groups.manage') or private.authorized(organization_id,'groups.assigned.read',id) or private.authorized(organization_id,'groups.joined.read',id));
create policy assignments_read on public.group_role_assignments for select to authenticated using((user_id=auth.uid() and private.active_user()) or private.authorized(organization_id,'organization.staff.manage'));
create policy invitations_read on public.organization_invitations for select to authenticated using(private.authorized(organization_id,'organization.staff.manage'));
create policy audit_logs_read on public.audit_logs for select to authenticated using(private.authorized(organization_id,'organization.audit.read') or (organization_id is null and actor_id=auth.uid()) or private.authorized(null,'platform.analytics.read'));
create policy platform_settings_read on public.platform_settings for select to authenticated using(private.authorized(null,'platform.settings.manage'));
create policy closure_blocks_read on public.organization_closure_blocks for select to authenticated using(private.authorized(organization_id,'organization.archive'));
revoke all on public.profiles,public.group_scopes,public.group_role_assignments,public.organization_invitations,public.audit_logs,public.platform_settings,public.organization_closure_blocks from anon,authenticated;
grant select on public.profiles,public.group_scopes,public.group_role_assignments,public.audit_logs,public.platform_settings,public.organization_closure_blocks to authenticated;
grant select(id,organization_id,email,role,invited_by,expires_at,accepted_at,accepted_by,revoked_at,created_at,updated_at,delivery_attempted_at) on public.organization_invitations to authenticated;

create function public.update_my_profile(full_name text,mobile_number text,address text,avatar_path text,notification_settings jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_account();
begin
 if full_name is null or char_length(btrim(full_name)) not between 2 and 120 or mobile_number is null or (mobile_number<>'' and mobile_number !~ '^\+?[0-9\s()-]{7,30}$') then raise exception 'Invalid profile details' using errcode='22023';end if;
 if avatar_path is not null and (split_part(avatar_path,'/',1)<>actor::text or avatar_path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$') then raise exception 'Invalid avatar path' using errcode='22023';end if;
 update public.profiles p set full_name=btrim(update_my_profile.full_name),mobile_number=btrim(update_my_profile.mobile_number),address=nullif(btrim(update_my_profile.address),''),avatar_path=update_my_profile.avatar_path,notification_settings=update_my_profile.notification_settings,updated_at=now() where p.id=actor;
 insert into public.audit_logs(actor_id,action,entity_id) values(actor,'profile.updated',actor);
end $$;

create or replace function public.create_organization(organization_name text,request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_account(true);organization uuid;existing_name text;
begin
 if organization_name is null or char_length(btrim(organization_name)) not between 2 and 80 or request_id is null then raise exception 'Valid organization name and request ID required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request_id::text,0));
 select id,name into organization,existing_name from public.organizations o where o.created_by=actor and o.request_id=create_organization.request_id;
 if organization is not null then
  if existing_name<>btrim(organization_name) or not private.is_organization_member(organization) then raise exception 'Request ID already used' using errcode='22023';end if;return organization;
 end if;
 insert into public.organizations(name,created_by,request_id) values(btrim(organization_name),actor,request_id) returning id into organization;
 insert into public.organization_members(organization_id,user_id,role) values(organization,actor,'owner');
 insert into public.audit_events(organization_id,actor_id,action,entity_id) values(organization,actor,'organization.created',organization);
 return organization;
end $$;
create function public.update_organization(target uuid,new_name text,new_description text,new_logo_path text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_account(true);perform 1 from public.organizations where id=target for update;
 if not private.authorized(target,'organization.update') then raise exception 'Organization update denied' using errcode='42501';end if;
 if new_logo_path is not null and (split_part(new_logo_path,'/',1)<>target::text or new_logo_path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$') then raise exception 'Invalid logo path' using errcode='22023';end if;
 update public.organizations set name=btrim(new_name),description=new_description,logo_path=new_logo_path,updated_at=now() where id=target;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(target,auth.uid(),'organization.updated',target);
end $$;
create function public.create_organization_with_details(organization_name text,organization_description text,request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 target:=public.create_organization(organization_name,request_id);
 perform public.update_organization(target,organization_name,organization_description,null);
 return target;
end $$;

create function public.get_access_context() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();result jsonb;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
 if not private.active_user() then
  return jsonb_build_object('account_status',(select account_status from public.profiles where id=actor),'verified',(select email_confirmed_at is not null from auth.users where id=actor),'requires_mfa',false,'aal',coalesce(auth.jwt()->>'aal','aal1'),'platform_permissions','[]'::jsonb,'organizations','[]'::jsonb);
 end if;
 select jsonb_build_object('account_status',p.account_status,'verified',u.email_confirmed_at is not null,
 'requires_mfa',exists(select 1 from public.organization_members where user_id=actor and role in ('owner','organizer','treasurer')) or exists(select 1 from private.platform_administrators where user_id=actor),
 'aal',case when private.verified_mfa() then 'aal2' else 'aal1' end,
 'platform_permissions',(select coalesce(jsonb_agg(permission),'[]') from unnest(array['platform.accounts.manage','platform.settings.manage','platform.support.resolve','platform.disputes.resolve','platform.analytics.read']) permission where private.authorized(null,permission)),
 'organizations',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role,'status',o.status,
 'permissions',(select coalesce(jsonb_agg(permission),'[]') from unnest(array['organization.read','organization.update','organization.staff.manage','organization.archive','organization.audit.read','organization.members.read','groups.manage','group.members.manage','group.rules.manage','payments.verify','payouts.manage','reports.organization.read','treasurer.workspace','groups.join']) permission where private.authorized(o.id,permission)),
 'groups',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'role',a.role,'permissions',(select coalesce(jsonb_agg(permission),'[]') from unnest(array['groups.assigned.read','payments.cash.record','payments.review','collections.reconcile','reports.assigned.read','groups.joined.read','contributions.self.submit','receipts.self.read','payouts.self.read','obligations.self.read','statements.self.read']) permission where private.authorized(o.id,permission,g.id)))),'[]') from public.group_role_assignments a join public.group_scopes g on g.id=a.group_id where a.user_id=actor and a.organization_id=o.id))),'[]') from public.organization_members m join public.organizations o on o.id=m.organization_id where m.user_id=actor)) into result from public.profiles p join auth.users u on u.id=p.id where p.id=actor;
 return result;
end $$;

create function public.organization_directory(target uuid) returns table(user_id uuid,full_name text,email text,role text,mfa_enrolled boolean) language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_account();
 if not private.is_organization_member(target) then raise exception 'Organization access denied' using errcode='42501';end if;
 return query select m.user_id,p.full_name,case when private.authorized(target,'organization.staff.manage') then p.email else null end,m.role,
 case when private.authorized(target,'organization.staff.manage') then exists(select 1 from auth.mfa_factors f where f.user_id=m.user_id and f.status='verified') else false end
 from public.organization_members m join public.profiles p on p.id=m.user_id where m.organization_id=target order by m.created_at;
end $$;

create function public.create_organization_invitation(target uuid,invite_email text,invite_role text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_account(true);raw_token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');invitation uuid;canonical text:=lower(btrim(invite_email));
begin
 perform 1 from public.organizations where id=target for update;
 if not private.authorized(target,'organization.staff.manage') then raise exception 'Invitation denied' using errcode='42501';end if;
 if invite_role is null or invite_role not in ('organizer','treasurer','member') or canonical is null or canonical !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(canonical)>254 then raise exception 'Invalid email or role' using errcode='22023';end if;
 if canonical=(select lower(email) from auth.users where id=actor) then raise exception 'You cannot invite yourself' using errcode='42501';end if;
 if exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=target and lower(u.email)=canonical) then raise exception 'This account already belongs to the organization' using errcode='22023';end if;
 if (select count(*) from public.organization_invitations where invited_by=actor and created_at>now()-interval '1 hour')>=20 then raise exception 'Invitation rate limit reached' using errcode='22023';end if;
 update public.organization_invitations set revoked_at=now(),updated_at=now() where organization_id=target and email=canonical and expires_at<=now() and accepted_at is null and revoked_at is null;
 insert into public.organization_invitations(organization_id,email,role,token_hash,invited_by) values(target,canonical,invite_role,encode(sha256(convert_to(raw_token,'UTF8')),'hex'),actor) returning id into invitation;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id,details) values(target,actor,'invitation.created',invitation,jsonb_build_object('role',invite_role));
 return jsonb_build_object('id',invitation,'token',raw_token,'email',canonical,'role',invite_role);
end $$;

create function public.inspect_organization_invitation(invitation_id uuid,invitation_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_account();invitation public.organization_invitations;
begin
 select * into invitation from public.organization_invitations where id=invitation_id and token_hash=encode(sha256(convert_to(invitation_token,'UTF8')),'hex') and email=(select lower(email) from auth.users where id=actor);
 if invitation.id is null or invitation.revoked_at is not null or (invitation.accepted_at is null and invitation.expires_at<=now()) or not exists(select 1 from public.organizations where id=invitation.organization_id and status='active') then raise exception 'Invitation is invalid, expired, revoked, or belongs to another email' using errcode='22023';end if;
 return jsonb_build_object('organization_id',invitation.organization_id,'organization_name',(select name from public.organizations where id=invitation.organization_id),'role',invitation.role,'accepted',invitation.accepted_at is not null);
end $$;
create function public.accept_organization_invitation(invitation_id uuid,invitation_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_account();invitation public.organization_invitations;target uuid;
begin
 select organization_id into target from public.organization_invitations where id=invitation_id;
 perform 1 from public.organizations where id=target and status='active' for update;
 if not found then raise exception 'Invitation unavailable' using errcode='22023';end if;
 select * into invitation from public.organization_invitations where id=invitation_id for update;
 if invitation_token is null or invitation.token_hash<>encode(sha256(convert_to(invitation_token,'UTF8')),'hex') or invitation.email<>(select lower(email) from auth.users where id=actor) or invitation.revoked_at is not null or (invitation.accepted_at is null and invitation.expires_at<=now()) then raise exception 'Invitation is invalid, expired, revoked, or belongs to another email' using errcode='22023';end if;
 if invitation.accepted_at is not null then
  if invitation.accepted_by=actor and private.is_organization_member(target) then return target;end if;
  raise exception 'Invitation already used' using errcode='22023';
 end if;
 if invitation.role in ('organizer','treasurer') then perform private.require_account(true);end if;
 if exists(select 1 from public.organization_members where organization_id=target and user_id=actor) then raise exception 'Already a member; ask the owner to manage your role' using errcode='22023';end if;
 insert into public.organization_members(organization_id,user_id,role) values(target,actor,invitation.role);
 update public.organization_invitations set accepted_at=now(),accepted_by=actor,updated_at=now() where id=invitation_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(target,actor,'invitation.accepted',invitation_id);
 return target;
end $$;

create function public.revoke_organization_invitation(invitation_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 perform private.require_account(true);select organization_id into target from public.organization_invitations where id=invitation_id;
 perform 1 from public.organizations where id=target for update;
 if not private.authorized(target,'organization.staff.manage') then raise exception 'Revocation denied' using errcode='42501';end if;
 update public.organization_invitations set revoked_at=now(),updated_at=now() where id=invitation_id and accepted_at is null and revoked_at is null;
 if found then insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(target,auth.uid(),'invitation.revoked',invitation_id);end if;
end $$;

create function public.claim_invitation_delivery(invitation_id uuid,invitation_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.organization_invitations;target uuid;
begin
 perform private.require_account(true);select organization_id into target from public.organization_invitations where id=invitation_id;
 perform 1 from public.organizations where id=target for update;
 if not private.authorized(target,'organization.staff.manage') then raise exception 'Delivery denied' using errcode='42501';end if;
 select * into invitation from public.organization_invitations where id=invitation_id for update;
 if invitation.token_hash<>encode(sha256(convert_to(invitation_token,'UTF8')),'hex') or invitation_token is null or invitation.expires_at<=now() or invitation.accepted_at is not null or invitation.revoked_at is not null then raise exception 'Invitation unavailable' using errcode='22023';end if;
 if invitation.delivery_attempted_at>now()-interval '1 minute' then raise exception 'Wait before retrying delivery' using errcode='22023';end if;
 update public.organization_invitations set delivery_attempted_at=now(),updated_at=now() where id=invitation_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(target,auth.uid(),'invitation.delivery_requested',invitation_id);
 return jsonb_build_object('email',invitation.email,'organization_name',(select name from public.organizations where id=target));
end $$;

create function public.set_organization_member_role(target uuid,member_user uuid,new_role text) returns void language plpgsql security definer set search_path='' as $$
declare old_role text;
begin
 perform private.require_account(true);perform 1 from public.organizations where id=target for update;
 if not private.authorized(target,'organization.staff.manage') or member_user=auth.uid() then raise exception 'Role change denied' using errcode='42501';end if;
 if new_role is null or new_role not in ('organizer','treasurer','member') then raise exception 'Invalid staff role' using errcode='22023';end if;
 select role into old_role from public.organization_members where organization_id=target and user_id=member_user;
 if old_role is null or old_role='owner' then raise exception 'Use ownership transfer for the owner' using errcode='42501';end if;
 if new_role in ('organizer','treasurer') and not exists(select 1 from auth.mfa_factors where user_id=member_user and status='verified') then raise exception 'Staff must enroll MFA before promotion' using errcode='22023';end if;
 update public.organization_members set role=new_role,updated_at=now() where organization_id=target and user_id=member_user;
 if new_role<>'treasurer' then delete from public.group_role_assignments where organization_id=target and user_id=member_user and role='treasurer';end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id,details) values(target,auth.uid(),'membership.role_changed',member_user,jsonb_build_object('from',old_role,'to',new_role));
end $$;

create function public.transfer_organization_ownership(target uuid,new_owner uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_account(true);perform 1 from public.organizations where id=target for update;
 if not private.authorized(target,'organization.staff.manage') or new_owner=auth.uid() then raise exception 'Transfer denied' using errcode='42501';end if;
 if not exists(select 1 from public.organization_members m join public.profiles p on p.id=m.user_id join auth.users u on u.id=p.id where m.organization_id=target and m.user_id=new_owner and p.account_status='active' and u.email_confirmed_at is not null) or not exists(select 1 from auth.mfa_factors where user_id=new_owner and status='verified') then raise exception 'New owner must be a verified, active member with MFA enrolled' using errcode='22023';end if;
 update public.organization_members set role='organizer',updated_at=now() where organization_id=target and role='owner';
 update public.organization_members set role='owner',updated_at=now() where organization_id=target and user_id=new_owner;
 update public.organization_invitations set revoked_at=now(),updated_at=now() where organization_id=target and accepted_at is null and revoked_at is null;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(target,auth.uid(),'organization.ownership_transferred',new_owner);
end $$;
create function public.leave_organization(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_account();perform 1 from public.organizations where id=target for update;
 if not private.is_organization_member(target) then raise exception 'Membership required' using errcode='42501';end if;
 if exists(select 1 from public.organization_members where organization_id=target and user_id=auth.uid() and role='owner') then raise exception 'Transfer ownership before leaving' using errcode='42501';end if;
 if exists(select 1 from public.organization_closure_blocks where organization_id=target and resolved_at is null) then raise exception 'Resolve organization obligations before leaving' using errcode='22023';end if;
 delete from public.organization_members where organization_id=target and user_id=auth.uid();
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(target,auth.uid(),'membership.left',auth.uid());
end $$;
create function public.archive_organization(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_account(true);perform 1 from public.organizations where id=target for update;
 if not private.authorized(target,'organization.archive') then raise exception 'Archive denied' using errcode='42501';end if;
 if exists(select 1 from public.organization_closure_blocks where organization_id=target and resolved_at is null) then raise exception 'Unresolved financial or operational records prevent archival' using errcode='22023';end if;
 update public.organizations set status='archived',updated_at=now() where id=target;
 update public.organization_invitations set revoked_at=now(),updated_at=now() where organization_id=target and accepted_at is null and revoked_at is null;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(target,auth.uid(),'organization.archived',target);
end $$;
create function public.remove_organization_member(target uuid,member_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_account(true);perform 1 from public.organizations where id=target for update;
 if not private.authorized(target,'organization.staff.manage') or member_user=auth.uid() or not exists(select 1 from public.organization_members where organization_id=target and user_id=member_user and role<>'owner') then raise exception 'Member removal denied' using errcode='42501';end if;
 if exists(select 1 from public.organization_closure_blocks where organization_id=target and resolved_at is null) then raise exception 'Resolve obligations before removing members' using errcode='22023';end if;
 delete from public.organization_members where organization_id=target and user_id=member_user;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(target,auth.uid(),'membership.removed',member_user);
end $$;

create function public.create_group_scope(target uuid,scope_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare scope_id uuid;
begin
 perform private.require_account(true);perform 1 from public.organizations where id=target for update;
 if not private.authorized(target,'organization.staff.manage') then raise exception 'Scope creation denied' using errcode='42501';end if;
 insert into public.group_scopes(organization_id,name) values(target,btrim(scope_name)) returning id into scope_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(target,auth.uid(),'group_scope.created',scope_id);return scope_id;
end $$;
create function public.assign_group_role(target uuid,scope_id uuid,member_user uuid,assigned_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_account(true);perform 1 from public.organizations where id=target for update;
 if not private.authorized(target,'organization.staff.manage') or member_user=auth.uid() then raise exception 'Assignment denied' using errcode='42501';end if;
 if not exists(select 1 from public.group_scopes where id=scope_id and organization_id=target) then raise exception 'Group scope belongs to a different organization' using errcode='42501';end if;
 if assigned_role is null or assigned_role not in ('treasurer','member') or not exists(select 1 from public.organization_members where organization_id=target and user_id=member_user and (assigned_role='member' or role='treasurer')) then raise exception 'Invalid assignment or membership' using errcode='22023';end if;
 insert into public.group_role_assignments(organization_id,group_id,user_id,role,assigned_by) values(target,scope_id,member_user,assigned_role,auth.uid()) on conflict(group_id,user_id) do update set role=excluded.role,assigned_by=excluded.assigned_by,updated_at=now();
 insert into public.audit_logs(organization_id,actor_id,action,entity_id,details) values(target,auth.uid(),'group_role.assigned',member_user,jsonb_build_object('group_id',scope_id,'role',assigned_role));
end $$;
create function public.remove_group_role(target uuid,scope_id uuid,member_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_account(true);perform 1 from public.organizations where id=target for update;
 if not private.authorized(target,'organization.staff.manage') then raise exception 'Assignment removal denied' using errcode='42501';end if;
 delete from public.group_role_assignments where organization_id=target and group_id=scope_id and user_id=member_user;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id,details) values(target,auth.uid(),'group_role.removed',member_user,jsonb_build_object('group_id',scope_id));
end $$;
create function public.authorize_operation(target uuid,permission text,scope_id uuid default null) returns boolean language sql stable security definer set search_path='' as $$select private.authorized(target,permission,scope_id);$$;

create function public.platform_accounts() returns table(id uuid,email text,full_name text,account_status text,created_at timestamptz) language plpgsql security definer set search_path='' as $$
begin
 if not private.authorized(null,'platform.accounts.manage') then raise exception 'Platform access denied' using errcode='42501';end if;
 insert into public.audit_logs(actor_id,action) values(auth.uid(),'platform.accounts_viewed');
 return query select p.id,p.email,p.full_name,p.account_status,p.created_at from public.profiles p order by p.created_at desc limit 500;
end $$;
create function public.set_account_status(account_id uuid,new_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.authorized(null,'platform.accounts.manage') or account_id=auth.uid() or exists(select 1 from private.platform_administrators where user_id=account_id) then raise exception 'Account change denied' using errcode='42501';end if;
 if new_status is null or new_status not in ('active','suspended') then raise exception 'Invalid account status' using errcode='22023';end if;
 update public.profiles set account_status=new_status,updated_at=now() where id=account_id;
 if not found then raise exception 'Account not found' using errcode='22023';end if;
 if new_status='suspended' then update public.organization_invitations set revoked_at=now(),updated_at=now() where invited_by=account_id and accepted_at is null and revoked_at is null;end if;
 insert into public.audit_logs(actor_id,action,entity_id,details) values(auth.uid(),'platform.account_status_changed',account_id,jsonb_build_object('status',new_status));
end $$;
create function public.update_platform_settings(support_email text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.authorized(null,'platform.settings.manage') then raise exception 'Platform access denied' using errcode='42501';end if;
 if char_length(support_email)>254 or support_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid support email' using errcode='22023';end if;
 update public.platform_settings set support_email=lower(btrim(update_platform_settings.support_email)),updated_at=now() where id=true;
 insert into public.audit_logs(actor_id,action) values(auth.uid(),'platform.settings_updated');
end $$;
create function public.platform_analytics() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.authorized(null,'platform.analytics.read') then raise exception 'Platform access denied' using errcode='42501';end if;
 insert into public.audit_logs(actor_id,action) values(auth.uid(),'platform.analytics_viewed');
 return jsonb_build_object('organizations',(select count(*) from public.organizations where status='active'),'accounts',(select count(*) from public.profiles),'pending_invitations',(select count(*) from public.organization_invitations where revoked_at is null and accepted_at is null and expires_at>now()));
end $$;
create function public.platform_organizations() returns table(id uuid,name text,status text,created_at timestamptz) language plpgsql security definer set search_path='' as $$
begin
 if not private.authorized(null,'platform.accounts.manage') then raise exception 'Platform access denied' using errcode='42501';end if;
 insert into public.audit_logs(actor_id,action) values(auth.uid(),'platform.organizations_viewed');
 return query select o.id,o.name,o.status,o.created_at from public.organizations o order by o.created_at desc limit 500;
end $$;

-- Deny implicit PUBLIC execution on every function introduced by this migration.
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['update_my_profile','create_organization','update_organization','create_organization_with_details','get_access_context','organization_directory','create_organization_invitation','inspect_organization_invitation','accept_organization_invitation','revoke_organization_invitation','claim_invitation_delivery','set_organization_member_role','transfer_organization_ownership','leave_organization','archive_organization','remove_organization_member','create_group_scope','assign_group_role','remove_group_role','authorize_operation','platform_accounts','set_account_status','update_platform_settings','platform_analytics','platform_organizations']) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;
end $$;
grant execute on function private.active_user(),private.is_organization_member(uuid),private.is_organization_owner(uuid),private.authorized(uuid,text,uuid) to authenticated;
commit;

