begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 2 and 80),
 created_by uuid not null references auth.users(id),
 request_id uuid not null,
 created_at timestamptz not null default now(),
 unique(created_by, request_id)
);
create table public.organization_members (
 organization_id uuid not null references public.organizations(id),
 user_id uuid not null references auth.users(id),
 role text not null check (role in ('owner','treasurer','member')),
 created_at timestamptz not null default now(),
 primary key (organization_id,user_id)
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 actor_id uuid not null references auth.users(id),
 action text not null,
 entity_id uuid not null,
 created_at timestamptz not null default now()
);
create index organization_members_user_idx on public.organization_members(user_id);
create index audit_events_org_idx on public.audit_events(organization_id,created_at);

create function private.is_organization_member(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.organization_members where organization_id=target and user_id=(select auth.uid())); $$;
create function private.is_organization_owner(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.organization_members where organization_id=target and user_id=(select auth.uid()) and role='owner'); $$;
revoke all on function private.is_organization_member(uuid), private.is_organization_owner(uuid) from public;
grant execute on function private.is_organization_member(uuid), private.is_organization_owner(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.audit_events enable row level security;
create policy organization_read on public.organizations for select to authenticated using (private.is_organization_member(id));
create policy memberships_read on public.organization_members for select to authenticated using (private.is_organization_member(organization_id));
create policy audit_owner_read on public.audit_events for select to authenticated using (private.is_organization_owner(organization_id));
revoke all on public.organizations,public.organization_members,public.audit_events from anon,authenticated;
grant select on public.organizations,public.organization_members,public.audit_events to authenticated;

create function public.create_organization(organization_name text,request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); organization uuid; existing_name text;
begin
 if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if organization_name is null or char_length(btrim(organization_name)) not between 2 and 80 then
   raise exception 'Organization name must contain 2 to 80 characters' using errcode='22023';
 end if;
 if request_id is null then raise exception 'Request ID required' using errcode='22023'; end if;
 -- Serialize retries for the same caller and request, including concurrent requests.
 perform pg_advisory_xact_lock(hashtextextended(actor::text || request_id::text,0));
 select id,name into organization,existing_name from public.organizations o where o.created_by=actor and o.request_id=create_organization.request_id;
 if organization is not null then
   if existing_name <> btrim(organization_name) then raise exception 'Request ID already used with different input' using errcode='22023'; end if;
   return organization;
 end if;
 insert into public.organizations(name,created_by,request_id) values(btrim(organization_name),actor,request_id) returning id into organization;
 insert into public.organization_members(organization_id,user_id,role) values(organization,actor,'owner');
 insert into public.audit_events(organization_id,actor_id,action,entity_id) values(organization,actor,'organization.created',organization);
 return organization;
end; $$;
revoke all on function public.create_organization(text,uuid) from public,anon;
grant execute on function public.create_organization(text,uuid) to authenticated;

create function private.reject_audit_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Audit events cannot be changed'; end; $$;
create trigger immutable_audit before update or delete on public.audit_events for each row execute function private.reject_audit_mutation();
commit;
