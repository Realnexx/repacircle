begin;
create table public.repa_groups (
 id uuid primary key references public.group_scopes(id), organization_id uuid not null references public.organizations(id),
 name text not null check(char_length(name)<=100), description text not null default '', image_path text not null default '',
 visibility text not null check(visibility in ('organization','invite_only')), currency text not null check(currency in ('PHP','USD','EUR')),
 mechanism text not null check(mechanism in ('rotating','random_draw','pooled_savings')), start_date date not null,
 status text not null default 'draft' check(status in ('draft','enrollment_open','enrollment_closed','active','paused','completed','cancelled','archived')),
 revision integer not null default 0, latest_version_id uuid, accepted_version_id uuid,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(id,organization_id) references public.group_scopes(id,organization_id)
);
create index repa_groups_org_status_idx on public.repa_groups(organization_id,status,created_at desc);
create table public.group_config_versions (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.repa_groups(id),version_number integer not null,
 previous_version_id uuid references public.group_config_versions(id),change_summary text not null check(char_length(change_summary) between 3 and 1000),changes jsonb not null,
 approval_status text not null default 'pending' check(approval_status in ('pending','approved','rejected')),
 changed_by uuid not null references auth.users(id),approved_by uuid references auth.users(id),approved_at timestamptz,effective_date timestamptz not null,
 created_at timestamptz not null default now(),unique(group_id,version_number),unique(group_id,id)
);
alter table public.repa_groups add foreign key(id,latest_version_id) references public.group_config_versions(group_id,id);
alter table public.repa_groups add foreign key(id,accepted_version_id) references public.group_config_versions(group_id,id);
create table public.group_rules (
 version_id uuid primary key references public.group_config_versions(id), mechanism text not null, mechanism_options jsonb not null,
 basic_name text not null,
 basic_description text not null,
 basic_image_path text not null,
 basic_organization_id uuid not null,
 basic_visibility text not null,
 basic_currency text not null,
 basic_start_date date not null,
 reward_kind text not null,
 reward_title text not null,
 reward_unit_cost_minor bigint not null,
 reward_quantity integer not null,
 reward_delivery_per_payout_minor bigint not null,
 reward_details text not null,
 reward_custom_values jsonb not null,
 contribution_amount_minor bigint not null,
 contribution_policy text not null,
 contribution_member_count integer not null,
 contribution_round_count integer not null,
 contribution_member_amounts jsonb not null,
 contribution_partial_payments boolean not null,
 contribution_late_policy text not null,
 contribution_late_fee_minor bigint not null,
 payment_methods text[] not null,
 payment_instructions text not null,
 payment_custom_label text not null,
 payment_gateway_provider text not null,
 distribution_rule text not null,
 distribution_eligibility text not null,
 distribution_minimum_percent integer not null,
 distribution_approval_count integer not null,
 distribution_rotation_order integer[] not null,
 distribution_fixed_shares jsonb not null,
 membership_limit integer not null,
 membership_invitation_rule text not null,
 membership_approval_required boolean not null,
 membership_terms text not null,
 membership_consent_required boolean not null,
 funding_disclosed_fees_minor bigint not null,
 funding_opening_funding_minor bigint not null,
 funding_opening_funding_confirmed boolean not null,
 funding_funding_source text not null,
 check(basic_visibility in ('organization','invite_only') and basic_currency in ('PHP','USD','EUR')),
 check(char_length(basic_name)<=100 and char_length(basic_description)<=2000 and char_length(membership_terms)<=10000),
 check(reward_kind in ('cash','physical_product','digital_product','service','mixed','custom')),
 check(contribution_policy in ('fixed','configurable') and contribution_member_count between 2 and 1000 and contribution_round_count between 1 and 1000),
 check(contribution_late_policy in ('flag','reject','fee') and distribution_eligibility in ('fully_paid','minimum_percent')),
 check(distribution_rule in ('fixed_rotation','secure_random','contribution_based','equal','fixed_share')),
 check(distribution_minimum_percent between 1 and 100 and distribution_approval_count between 1 and 5 and membership_limit between 2 and 1000),
 check(membership_invitation_rule in ('organizer_only','members_can_request')),
 check(reward_quantity between 1 and 1000),
 check(reward_unit_cost_minor between 0 and 1000000000),
 check(reward_delivery_per_payout_minor between 0 and 1000000000),
 check(contribution_amount_minor between 0 and 1000000000),
 check(contribution_late_fee_minor between 0 and 1000000000),
 check(funding_disclosed_fees_minor between 0 and 1000000000),
 check(funding_opening_funding_minor between 0 and 1000000000)
);
create table public.schedule_definitions (
 version_id uuid primary key references public.group_config_versions(id),
 frequency text not null,
 every_days integer not null,
 start_date date not null,
 cutoff_time time not null,
 timezone text not null,
 grace_hours integer not null,
 check(frequency in ('daily','weekly','biweekly','monthly','custom') and every_days between 1 and 365 and grace_hours between 0 and 168 and timezone in ('Asia/Manila','UTC'))
);
create table public.form_field_definitions (
 version_id uuid not null references public.group_config_versions(id), field_key text not null check(field_key ~ '^custom_[a-z][a-z0-9_]{0,39}$'),
 category text not null check(category in ('reward','membership')),label text not null,field_type text not null,
 required boolean not null,min_value numeric,max_value numeric,options jsonb,condition jsonb,children jsonb,position integer not null,
 primary key(version_id,field_key)
);
create table public.group_activation_checks (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.repa_groups(id),version_id uuid not null references public.group_config_versions(id),
 passed boolean not null,result jsonb not null,checked_by uuid not null references auth.users(id),checked_at timestamptz not null default now()
);
create index group_activation_checks_group_idx on public.group_activation_checks(group_id,checked_at desc);
create table public.repa_member_consents (
 version_id uuid not null references public.group_config_versions(id),user_id uuid not null references auth.users(id),custom_values jsonb not null default '{}',accepted_at timestamptz not null default now(),primary key(version_id,user_id)
);

alter table public.group_role_assignments add column repa_slot integer check(repa_slot between 1 and 1000 and role='member');
create unique index repa_member_slot_unique on public.group_role_assignments(group_id,repa_slot) where repa_slot is not null;

create function private.repa_can_read(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.repa_groups g where g.id=target and private.active_user() and (
 private.authorized(g.organization_id,'groups.manage',g.id) or (private.is_organization_member(g.organization_id) and
 ((g.visibility='organization' and g.status<>'draft') or exists(select 1 from public.group_role_assignments a where a.group_id=g.id and a.user_id=auth.uid())))));
$$;
create function private.repa_manage(target uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_account(true);org uuid;
begin select organization_id into org from public.repa_groups where id=target;
 if org is null or not private.authorized(org,'groups.manage',target) then raise exception 'REPA management access required' using errcode='42501';end if;return actor;end $$;
create function private.repa_version_read(target uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.group_config_versions v where v.id=target and private.repa_can_read(v.group_id));$$;
revoke all on function private.repa_can_read(uuid),private.repa_manage(uuid),private.repa_version_read(uuid) from public,anon;
grant execute on function private.repa_can_read(uuid),private.repa_version_read(uuid) to authenticated;
alter table public.repa_groups enable row level security; revoke all on public.repa_groups from anon,authenticated; grant select on public.repa_groups to authenticated;
create policy repa_groups_read on public.repa_groups for select to authenticated using(private.repa_can_read(id));
alter table public.group_config_versions enable row level security; revoke all on public.group_config_versions from anon,authenticated; grant select on public.group_config_versions to authenticated;
create policy group_config_versions_read on public.group_config_versions for select to authenticated using(private.repa_can_read(group_id));
alter table public.group_rules enable row level security; revoke all on public.group_rules from anon,authenticated; grant select on public.group_rules to authenticated;
create policy group_rules_read on public.group_rules for select to authenticated using(private.repa_version_read(version_id));
alter table public.schedule_definitions enable row level security; revoke all on public.schedule_definitions from anon,authenticated; grant select on public.schedule_definitions to authenticated;
create policy schedule_definitions_read on public.schedule_definitions for select to authenticated using(private.repa_version_read(version_id));
alter table public.form_field_definitions enable row level security; revoke all on public.form_field_definitions from anon,authenticated; grant select on public.form_field_definitions to authenticated;
create policy form_field_definitions_read on public.form_field_definitions for select to authenticated using(private.repa_version_read(version_id));
alter table public.group_activation_checks enable row level security; revoke all on public.group_activation_checks from anon,authenticated; grant select on public.group_activation_checks to authenticated;
create policy group_activation_checks_read on public.group_activation_checks for select to authenticated using(private.repa_can_read(group_id));
alter table public.repa_member_consents enable row level security; revoke all on public.repa_member_consents from anon,authenticated; grant select on public.repa_member_consents to authenticated;
create policy repa_member_consents_read on public.repa_member_consents for select to authenticated using(private.repa_version_read(version_id) and (user_id=auth.uid() or exists(select 1 from public.group_config_versions v join public.repa_groups g on g.id=v.group_id where v.id=version_id and private.authorized(g.organization_id,'groups.manage',g.id))));

create function private.repa_config(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('mechanism',r.mechanism,'mechanism_options',r.mechanism_options,
 'basic',jsonb_build_object('name',r.basic_name,'description',r.basic_description,'image_path',r.basic_image_path,'organization_id',r.basic_organization_id,'visibility',r.basic_visibility,'currency',r.basic_currency,'start_date',r.basic_start_date),
 'reward',jsonb_build_object('kind',r.reward_kind,'title',r.reward_title,'unit_cost_minor',r.reward_unit_cost_minor,'quantity',r.reward_quantity,'delivery_per_payout_minor',r.reward_delivery_per_payout_minor,'details',r.reward_details,'custom_values',r.reward_custom_values),
 'contribution',jsonb_build_object('amount_minor',r.contribution_amount_minor,'policy',r.contribution_policy,'member_count',r.contribution_member_count,'round_count',r.contribution_round_count,'member_amounts',r.contribution_member_amounts,'partial_payments',r.contribution_partial_payments,'late_policy',r.contribution_late_policy,'late_fee_minor',r.contribution_late_fee_minor),
 'payment',jsonb_build_object('methods',r.payment_methods,'instructions',r.payment_instructions,'custom_label',r.payment_custom_label,'gateway_provider',r.payment_gateway_provider),
 'distribution',jsonb_build_object('rule',r.distribution_rule,'eligibility',r.distribution_eligibility,'minimum_percent',r.distribution_minimum_percent,'approval_count',r.distribution_approval_count,'rotation_order',r.distribution_rotation_order,'fixed_shares',r.distribution_fixed_shares),
 'membership',jsonb_build_object('limit',r.membership_limit,'invitation_rule',r.membership_invitation_rule,'approval_required',r.membership_approval_required,'terms',r.membership_terms,'consent_required',r.membership_consent_required),
 'funding',jsonb_build_object('disclosed_fees_minor',r.funding_disclosed_fees_minor,'opening_funding_minor',r.funding_opening_funding_minor,'opening_funding_confirmed',r.funding_opening_funding_confirmed,'funding_source',r.funding_funding_source),
 'schedule',jsonb_build_object('frequency',s.frequency,'every_days',s.every_days,'start_date',s.start_date,'cutoff_time',to_char(s.cutoff_time,'HH24:MI'),'timezone',s.timezone,'grace_hours',s.grace_hours),
 'fields',(select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key',f.field_key,'label',f.label,'type',f.field_type,'category',f.category,'required',f.required,'min',f.min_value,'max',f.max_value,'options',f.options,'condition',f.condition,'children',f.children)) order by f.position),'[]') from public.form_field_definitions f where f.version_id=target))
 from public.group_rules r join public.schedule_definitions s on s.version_id=r.version_id where r.version_id=target;
$$;
create function private.repa_diff(old_value jsonb,new_value jsonb,path text default '') returns jsonb language plpgsql immutable set search_path='' as $$
declare key text;result jsonb:='[]';begin
 if old_value is not distinct from new_value then return result;end if;
 if jsonb_typeof(old_value)='object' and jsonb_typeof(new_value)='object' then
 for key in select jsonb_object_keys(old_value||new_value) loop result:=result||private.repa_diff(old_value->key,new_value->key,case when path='' then key else path||'.'||key end);end loop;return result;end if;
 return jsonb_build_array(jsonb_build_object('path',path,'previous',coalesce(old_value,'null'::jsonb),'next',coalesce(new_value,'null'::jsonb)));end $$;
create function private.repa_shape(config jsonb) returns void language plpgsql immutable set search_path='' as $$
declare spec jsonb:='{"basic.name":"text","basic.description":"text","basic.image_path":"text","basic.organization_id":"uuid","basic.visibility":"text","basic.currency":"text","basic.start_date":"date","reward.kind":"text","reward.title":"text","reward.unit_cost_minor":"bigint","reward.quantity":"integer","reward.delivery_per_payout_minor":"bigint","reward.details":"text","reward.custom_values":"jsonb","contribution.amount_minor":"bigint","contribution.policy":"text","contribution.member_count":"integer","contribution.round_count":"integer","contribution.member_amounts":"jsonb","contribution.partial_payments":"boolean","contribution.late_policy":"text","contribution.late_fee_minor":"bigint","payment.methods":"jsonb","payment.instructions":"text","payment.custom_label":"text","payment.gateway_provider":"text","distribution.rule":"text","distribution.eligibility":"text","distribution.minimum_percent":"integer","distribution.approval_count":"integer","distribution.rotation_order":"jsonb","distribution.fixed_shares":"jsonb","membership.limit":"integer","membership.invitation_rule":"text","membership.approval_required":"boolean","membership.terms":"text","membership.consent_required":"boolean","funding.disclosed_fees_minor":"bigint","funding.opening_funding_minor":"bigint","funding.opening_funding_confirmed":"boolean","funding.funding_source":"text","schedule.frequency":"text","schedule.every_days":"integer","schedule.start_date":"date","schedule.cutoff_time":"time","schedule.timezone":"text","schedule.grace_hours":"integer"}';entry record;parts text[];v jsonb;expected text;section text;allowed text[];
begin
 if jsonb_typeof(config) is distinct from 'object' or config-array['basic','mechanism','mechanism_options','reward','contribution','schedule','payment','distribution','membership','funding','fields']<>'{}' then raise exception 'Unknown or invalid configuration fields' using errcode='22023';end if;
 for section in select unnest(array['basic','reward','contribution','schedule','payment','distribution','membership','funding']) loop
 if jsonb_typeof(config->section) is distinct from 'object' then raise exception 'Missing configuration section %',section using errcode='22023';end if;
 select array_agg(split_part(key,'.',2)) into allowed from jsonb_object_keys(spec) key where split_part(key,'.',1)=section;
 if (config->section)-allowed<>'{}' then raise exception 'Unknown configuration fields in %',section using errcode='22023';end if;end loop;
 for entry in select * from jsonb_each_text(spec) loop
 parts:=string_to_array(entry.key,'.');v:=config#>parts;
 expected:=case when entry.value in ('bigint','integer') then 'number' when entry.value='boolean' then 'boolean' when entry.value='jsonb' then case when entry.key in ('reward.custom_values') then 'object' else 'array' end else 'string' end;
 if jsonb_typeof(v) is distinct from expected then raise exception 'Invalid or missing field %',entry.key using errcode='22023';end if;
 if entry.value='date' and ((v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char((v#>>'{}')::date,'YYYY-MM-DD')<>(v#>>'{}')) then raise exception 'Invalid calendar date' using errcode='22023';end if;
 if entry.value='time' and (v#>>'{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid cutoff time' using errcode='22023';end if;
 if entry.value in ('bigint','integer') and ((v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) or (v#>>'{}')::numeric<0 or (v#>>'{}')::numeric>1000000000) then raise exception 'Invalid integer field %',entry.key using errcode='22023';end if;
 if expected='string' and char_length(v#>>'{}')>10000 then raise exception 'Field too long' using errcode='22023';end if;
 end loop;
 if jsonb_typeof(config->'fields') is distinct from 'array' or jsonb_array_length(config->'fields')>30 then raise exception 'Invalid custom definitions' using errcode='22023';end if;
 if config->>'mechanism' not in ('rotating','random_draw','pooled_savings') or config->>'mechanism' is null then raise exception 'Invalid mechanism' using errcode='22023';end if;
 if config->>'mechanism'='rotating' and config->'mechanism_options'<>'{"cycle":"one_payout_per_member"}'::jsonb then raise exception 'Invalid rotating configuration' using errcode='22023';end if;
 if config->>'mechanism'='random_draw' and config->'mechanism_options'<>'{"draw_policy":"without_replacement","algorithm":"server_csprng"}'::jsonb then raise exception 'Invalid secure draw configuration' using errcode='22023';end if;
 if config->>'mechanism'='pooled_savings' and (jsonb_typeof(config#>'{mechanism_options,target_minor}') is distinct from 'number' or config#>'{mechanism_options,distribute_at_end}'<>'true'::jsonb or (config->'mechanism_options')-array['target_minor','distribute_at_end']<>'{}') then raise exception 'Invalid pooled configuration' using errcode='22023';end if;
end $$;
create function private.repa_insert_rules(target uuid,config jsonb) returns void language plpgsql security definer set search_path='' as $$declare f jsonb;pos integer:=0;begin
 insert into public.group_rules(version_id,mechanism,mechanism_options,basic_name,basic_description,basic_image_path,basic_organization_id,basic_visibility,basic_currency,basic_start_date,reward_kind,reward_title,reward_unit_cost_minor,reward_quantity,reward_delivery_per_payout_minor,reward_details,reward_custom_values,contribution_amount_minor,contribution_policy,contribution_member_count,contribution_round_count,contribution_member_amounts,contribution_partial_payments,contribution_late_policy,contribution_late_fee_minor,payment_methods,payment_instructions,payment_custom_label,payment_gateway_provider,distribution_rule,distribution_eligibility,distribution_minimum_percent,distribution_approval_count,distribution_rotation_order,distribution_fixed_shares,membership_limit,membership_invitation_rule,membership_approval_required,membership_terms,membership_consent_required,funding_disclosed_fees_minor,funding_opening_funding_minor,funding_opening_funding_confirmed,funding_funding_source) values(target,config->>'mechanism',config->'mechanism_options',(config#>>'{basic,name}')::text,(config#>>'{basic,description}')::text,(config#>>'{basic,image_path}')::text,(config#>>'{basic,organization_id}')::uuid,(config#>>'{basic,visibility}')::text,(config#>>'{basic,currency}')::text,(config#>>'{basic,start_date}')::date,(config#>>'{reward,kind}')::text,(config#>>'{reward,title}')::text,(config#>>'{reward,unit_cost_minor}')::bigint,(config#>>'{reward,quantity}')::integer,(config#>>'{reward,delivery_per_payout_minor}')::bigint,(config#>>'{reward,details}')::text,config#>'{reward,custom_values}',(config#>>'{contribution,amount_minor}')::bigint,(config#>>'{contribution,policy}')::text,(config#>>'{contribution,member_count}')::integer,(config#>>'{contribution,round_count}')::integer,config#>'{contribution,member_amounts}',(config#>>'{contribution,partial_payments}')::boolean,(config#>>'{contribution,late_policy}')::text,(config#>>'{contribution,late_fee_minor}')::bigint,array(select jsonb_array_elements_text(config#>'{payment,methods}')),(config#>>'{payment,instructions}')::text,(config#>>'{payment,custom_label}')::text,(config#>>'{payment,gateway_provider}')::text,(config#>>'{distribution,rule}')::text,(config#>>'{distribution,eligibility}')::text,(config#>>'{distribution,minimum_percent}')::integer,(config#>>'{distribution,approval_count}')::integer,array(select jsonb_array_elements_text(config#>'{distribution,rotation_order}'))::integer[],config#>'{distribution,fixed_shares}',(config#>>'{membership,limit}')::integer,(config#>>'{membership,invitation_rule}')::text,(config#>>'{membership,approval_required}')::boolean,(config#>>'{membership,terms}')::text,(config#>>'{membership,consent_required}')::boolean,(config#>>'{funding,disclosed_fees_minor}')::bigint,(config#>>'{funding,opening_funding_minor}')::bigint,(config#>>'{funding,opening_funding_confirmed}')::boolean,(config#>>'{funding,funding_source}')::text);
 insert into public.schedule_definitions(version_id,frequency,every_days,start_date,cutoff_time,timezone,grace_hours) values(target,(config#>>'{schedule,frequency}')::text,(config#>>'{schedule,every_days}')::integer,(config#>>'{schedule,start_date}')::date,(config#>>'{schedule,cutoff_time}')::time,(config#>>'{schedule,timezone}')::text,(config#>>'{schedule,grace_hours}')::integer);
 for f in select * from jsonb_array_elements(config->'fields') loop
 insert into public.form_field_definitions(version_id,field_key,category,label,field_type,required,min_value,max_value,options,condition,children,position)
 values(target,f->>'key',f->>'category',f->>'label',f->>'type',(f->>'required')::boolean,(f->>'min')::numeric,(f->>'max')::numeric,f->'options',f->'condition',f->'children',pos);pos:=pos+1;end loop;
end $$;

create function private.repa_validate_fields(defs jsonb,depth integer default 0) returns void language plpgsql immutable set search_path='' as $$
declare f jsonb;seen text[]:='{}';key text;option_count integer;
begin
 if jsonb_typeof(defs) is distinct from 'array' or jsonb_array_length(defs)>30 or depth>1 then raise exception 'Invalid custom field definitions' using errcode='22023';end if;
 for f in select * from jsonb_array_elements(defs) loop
 key:=f->>'key';
 if jsonb_typeof(f) is distinct from 'object' or f-array['key','label','type','required','category','min','max','options','condition','children']<>'{}'
 or key is null or key !~ '^custom_[a-z][a-z0-9_]{0,39}$' or key=any(seen)
 or coalesce(char_length(btrim(f->>'label')),0) not between 1 and 100 or jsonb_typeof(f->'required') is distinct from 'boolean'
 or coalesce(f->>'category','') not in ('reward','membership') or coalesce(f->>'type','') not in ('text','number','currency','date','time','select','multi_select','checkbox','radio','file','image','textarea','repeating') then raise exception 'Invalid or duplicate custom field; protected fields cannot be overridden' using errcode='22023';end if;
 seen:=array_append(seen,key);
 if (f?'min' and (jsonb_typeof(f->'min')<>'number' or (f->>'min')::numeric<0)) or (f?'max' and (jsonb_typeof(f->'max')<>'number' or (f->>'max')::numeric>1000000000)) or (f?'min' and f?'max' and (f->>'min')::numeric>(f->>'max')::numeric) then raise exception 'Invalid field limits' using errcode='22023';end if;
 if f->>'type' in ('select','multi_select','radio') then
 if jsonb_typeof(f->'options') is distinct from 'array' or jsonb_array_length(f->'options') not between 1 and 30 then raise exception 'Selection options required' using errcode='22023';end if;
 select count(distinct value) into option_count from jsonb_array_elements(f->'options');
 if option_count<>jsonb_array_length(f->'options') or exists(select 1 from jsonb_array_elements(f->'options') e where jsonb_typeof(e)<>'string' or char_length(btrim(e#>>'{}')) not between 1 and 100) then raise exception 'Invalid selection options' using errcode='22023';end if;end if;
 if f?'condition' then
 if jsonb_typeof(f->'condition') is distinct from 'object' or (f->'condition')-array['key','equals']<>'{}' or jsonb_typeof(f#>'{condition,equals}') not in ('string','boolean') or not exists(select 1 from jsonb_array_elements(defs) other where other->>'key'=f#>>'{condition,key}' and other->>'category'=f->>'category' and not(other?'condition') and other->>'key'<>key) then raise exception 'Invalid conditional field reference' using errcode='22023';end if;end if;
 if f->>'type'='repeating' then if depth=1 then raise exception 'Nested repeating groups are not supported' using errcode='22023';end if;
 if jsonb_typeof(f->'children') is distinct from 'array' or jsonb_array_length(f->'children') not between 1 and 10 then raise exception 'Repeating child definitions required' using errcode='22023';end if;
 perform private.repa_validate_fields(f->'children',depth+1);
 else if f?'children' then raise exception 'Only repeating fields support children' using errcode='22023';end if;end if;
 end loop;
end $$;

create function private.repa_dynamic_errors(defs jsonb,vals jsonb,enforce_required boolean default true) returns jsonb language plpgsql immutable set search_path='' as $$
declare f jsonb;v jsonb;row_value jsonb;key text;label text;errors jsonb:='[]';minimum numeric;maximum numeric;empty boolean;typ text;
begin
 if jsonb_typeof(vals) is distinct from 'object' then return '["Custom values must be an object."]';end if;
 if exists(select 1 from jsonb_object_keys(vals) k where not exists(select 1 from jsonb_array_elements(defs) d where d->>'key'=k)) then errors:=errors||jsonb_build_array('Unknown custom field values are not allowed.');end if;
 for f in select * from jsonb_array_elements(defs) loop
 key:=f->>'key';label:=f->>'label';typ:=f->>'type';v:=vals->key;
 if f?'condition' and vals->(f#>>'{condition,key}') is distinct from f#>'{condition,equals}' then continue;end if;
 empty:=v is null or v='null'::jsonb or v='""'::jsonb or v='[]'::jsonb;
 if empty then if enforce_required and (f->>'required')::boolean then errors:=errors||jsonb_build_array(label||' is required.');end if;continue;end if;
 minimum:=(f->>'min')::numeric;maximum:=(f->>'max')::numeric;
 if typ='checkbox' then if jsonb_typeof(v)<>'boolean' or (enforce_required and (f->>'required')::boolean and v<>'true'::jsonb) then errors:=errors||jsonb_build_array(label||' must be accepted.');end if;
 elsif typ in ('number','currency') then
 if jsonb_typeof(v)<>'number' then errors:=errors||jsonb_build_array(label||' requires a number.');
 elsif (minimum is not null and (v#>>'{}')::numeric<minimum) or (maximum is not null and (v#>>'{}')::numeric>maximum) or (typ='currency' and (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric)) then errors:=errors||jsonb_build_array(label||' is outside its numeric limits.');end if;
 elsif typ in ('multi_select','repeating') then
 if jsonb_typeof(v)<>'array' then errors:=errors||jsonb_build_array(label||' requires an array.');continue;end if;
 if jsonb_array_length(v)<coalesce(minimum,0) or jsonb_array_length(v)>coalesce(maximum,case when typ='repeating' then 20 else 30 end) then errors:=errors||jsonb_build_array(label||' has an invalid item count.');end if;
 if typ='multi_select' then if exists(select 1 from jsonb_array_elements(v) x where not(f->'options' @> jsonb_build_array(x))) or (select count(distinct value) from jsonb_array_elements(v))<>jsonb_array_length(v) then errors:=errors||jsonb_build_array(label||' has an invalid selection.');end if;
 else for row_value in select * from jsonb_array_elements(v) loop errors:=errors||private.repa_dynamic_errors(f->'children',row_value,enforce_required);end loop;end if;
 else
 if jsonb_typeof(v)<>'string' or char_length(v#>>'{}')>coalesce(maximum,4000) or char_length(v#>>'{}')<coalesce(minimum,0) then errors:=errors||jsonb_build_array(label||' has an invalid value.');continue;end if;
 if typ in ('select','radio') and not(f->'options' @> jsonb_build_array(v)) then errors:=errors||jsonb_build_array(label||' has an invalid choice.');end if;
 if typ='date' then begin if (v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char((v#>>'{}')::date,'YYYY-MM-DD')<>(v#>>'{}') then errors:=errors||jsonb_build_array(label||' needs a valid date.');end if;exception when others then errors:=errors||jsonb_build_array(label||' needs a valid date.');end;end if;
 if typ='time' and (v#>>'{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then errors:=errors||jsonb_build_array(label||' needs a valid time.');end if;
 if typ='image' and (v#>>'{}') !~ '\.(png|jpg|jpeg|webp)$' then errors:=errors||jsonb_build_array(label||' requires an image.');end if;
 if typ in ('file','image') and (v#>>'{}') !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(pdf|txt|png|jpg|jpeg|webp)$' then errors:=errors||jsonb_build_array(label||' needs an uploaded file.');end if;
 end if;
 end loop;return errors;
end $$;

create function private.repa_config_errors(c jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare errors jsonb:='[]';n integer:=(c#>>'{contribution,member_count}')::integer;rounds integer:=(c#>>'{contribution,round_count}')::integer;arr jsonb;rule text:=c#>>'{distribution,rule}';
begin
 if char_length(btrim(c#>>'{basic,name}'))<2 then errors:=errors||'["Enter a group name of at least two characters."]';end if;
 if c#>>'{reward,title}'='' or (c#>>'{reward,unit_cost_minor}')::bigint<=0 or (c#>>'{contribution,amount_minor}')::bigint<=0 then errors:=errors||'["Positive contribution and disclosed reward costs are required."]';end if;
 if c#>>'{basic,start_date}'<>c#>>'{schedule,start_date}' then errors:=errors||'["Group and schedule start dates must match."]';end if;
 if (c#>>'{membership,limit}')::integer<>n or char_length(btrim(c#>>'{membership,terms}'))<20 or c#>'{membership,consent_required}'<>'true' then errors:=errors||'["Matching member limits, group terms and explicit member consent are required."]';end if;
 if c#>>'{schedule,cutoff_time}' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then errors:=errors||'["Enter a valid cutoff time."]';end if;
 arr:=c#>'{payment,methods}';
 if jsonb_array_length(arr)=0 or (select count(distinct value) from jsonb_array_elements(arr))<>jsonb_array_length(arr) or exists(select 1 from jsonb_array_elements_text(arr) m where m not in ('cash','gcash_manual','maya_manual','bank_transfer','gateway','custom')) then errors:=errors||'["Select valid, unique payment methods."]';end if;
 if arr ? 'gateway' then errors:=errors||'["Integrated gateway activation is unavailable in Phase 3; select a manual payment method."]';end if;
 if arr ? 'custom' and btrim(c#>>'{payment,custom_label}')='' then errors:=errors||'["Name the custom payment method."]';end if;
 if arr ?| array['gcash_manual','maya_manual','bank_transfer','custom'] and btrim(c#>>'{payment,instructions}')='' then errors:=errors||'["Provide manual payment instructions."]';end if;
 if c#>>'{contribution,late_policy}'='fee' and (c#>>'{contribution,late_fee_minor}')::bigint<=0 then errors:=errors||'["Disclose the late fee; late fees cannot fund expected rewards."]';end if;
 if (c#>>'{funding,opening_funding_minor}')::bigint>0 and (c#>'{funding,opening_funding_confirmed}'<>'true' or btrim(c#>>'{funding,funding_source}')='') then errors:=errors||'["Confirm the source of declared opening funding."]';end if;
 if c#>>'{distribution,eligibility}'='minimum_percent' and c#>'{contribution,partial_payments}'<>'true' then errors:=errors||'["Minimum-percent eligibility requires partial payments."]';end if;
 if c#>>'{contribution,policy}'='configurable' then
 arr:=c#>'{contribution,member_amounts}';
 if jsonb_array_length(arr)<>n then errors:=errors||'["Configure a contribution for every member slot."]';else
 begin if (select count(distinct (value->>'slot')::integer) from jsonb_array_elements(arr))<>n or exists(select 1 from jsonb_array_elements(arr) a where (a->>'slot')::integer not between 1 and n or (a->>'amount_minor')::numeric<(c#>>'{contribution,amount_minor}')::bigint or (a->>'amount_minor')::numeric<>trunc((a->>'amount_minor')::numeric) or (a->>'amount_minor')::numeric>1000000000 or a-array['slot','amount_minor']<>'{}' or not(a ?& array['slot','amount_minor'])) then errors:=errors||'["Invalid or duplicate member contribution slots."]';end if;exception when others then errors:=errors||'["Invalid member contribution amounts."]';end;end if;end if;
 if c->>'mechanism' in ('rotating','random_draw') then
 if rounds<>n then errors:=errors||'["A full cycle requires one round per member."]';end if;
 if rule<>(case when c->>'mechanism'='rotating' then 'fixed_rotation' else 'secure_random' end) then errors:=errors||'["Distribution rule must match the mechanism."]';end if;
 else if rule not in ('equal','contribution_based','fixed_share') or (c#>>'{mechanism_options,target_minor}')::numeric<=0 or (c#>>'{mechanism_options,target_minor}')::numeric>1000000000 or (c#>>'{mechanism_options,target_minor}')::numeric<>trunc((c#>>'{mechanism_options,target_minor}')::numeric) then errors:=errors||'["Set a valid pooled target and allocation rule."]';end if;end if;
 if rule='fixed_rotation' then arr:=c#>'{distribution,rotation_order}';begin
 if jsonb_array_length(arr)<>n or (select count(distinct value) from jsonb_array_elements(arr))<>n or exists(select 1 from jsonb_array_elements_text(arr) x where x::numeric<>trunc(x::numeric) or x::numeric not between 1 and n) then errors:=errors||'["Rotation must include every member slot once."]';end if;
 exception when others then errors:=errors||'["Invalid rotation order."]';end;end if;
 if rule='fixed_share' then arr:=c#>'{distribution,fixed_shares}';begin
 if jsonb_array_length(arr)<>n or (select count(distinct (value->>'slot')::integer) from jsonb_array_elements(arr))<>n or (select sum((value->>'basis_points')::numeric) from jsonb_array_elements(arr))<>10000 or exists(select 1 from jsonb_array_elements(arr) x where (x->>'slot')::integer not between 1 and n or (x->>'basis_points')::numeric not between 1 and 10000 or (x->>'basis_points')::numeric<>trunc((x->>'basis_points')::numeric) or not(x ?& array['slot','basis_points'])) then errors:=errors||'["Fixed shares must cover each member slot and total 100%."]';end if;
 exception when others then errors:=errors||'["Invalid fixed shares."]';end;end if;
 select coalesce(jsonb_agg(value),'[]') into arr from jsonb_array_elements(c->'fields') where value->>'category'='reward';
 return errors||private.repa_dynamic_errors(arr,c#>'{reward,custom_values}',true);
end $$;

create function private.repa_schedule(c jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:='[]';i integer;due date;cutoff timestamptz;per_round bigint;balance bigint;cost bigint;payouts integer;anchor date:=(c#>>'{schedule,start_date}')::date;freq text:=c#>>'{schedule,frequency}';rounds integer:=(c#>>'{contribution,round_count}')::integer;n integer:=(c#>>'{contribution,member_count}')::integer;
begin
 if c#>>'{contribution,policy}'='fixed' then per_round:=(c#>>'{contribution,amount_minor}')::bigint*n;else select coalesce(sum((value->>'amount_minor')::bigint),0) into per_round from jsonb_array_elements(c#>'{contribution,member_amounts}');end if;
 balance:=(c#>>'{funding,opening_funding_minor}')::bigint-(c#>>'{funding,disclosed_fees_minor}')::bigint;
 cost:=(c#>>'{reward,unit_cost_minor}')::bigint*(c#>>'{reward,quantity}')::integer+(c#>>'{reward,delivery_per_payout_minor}')::bigint;
 for i in 0..rounds-1 loop
 due:=case when freq='monthly' then (anchor+make_interval(months=>i))::date else anchor+(i*case freq when 'daily' then 1 when 'weekly' then 7 when 'biweekly' then 14 else (c#>>'{schedule,every_days}')::integer end) end;
 cutoff:=(due+(c#>>'{schedule,cutoff_time}')::time) at time zone (c#>>'{schedule,timezone}');
 payouts:=case when c->>'mechanism'='pooled_savings' then case when i=rounds-1 then n else 0 end else 1 end;
 balance:=balance+per_round-cost*payouts;
 result:=result||jsonb_build_array(jsonb_build_object('round',i+1,'date',due,'cutoff_at',cutoff,'grace_ends_at',cutoff+make_interval(hours=>(c#>>'{schedule,grace_hours}')::integer),'collections_minor',per_round,'payout_count',payouts,'projected_balance_minor',balance));
 end loop;return result;
end $$;
create function private.repa_funding(c jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare errors jsonb:=private.repa_config_errors(c);schedule jsonb;expected bigint;rewards bigint;delivery bigint;fees bigint;available bigint;required bigint;shortfall bigint;liquidity bigint;payouts integer;
begin
 if jsonb_array_length(errors)>0 then return jsonb_build_object('valid',false,'errors',errors);end if;
 schedule:=private.repa_schedule(c);select sum((value->>'collections_minor')::bigint),greatest(0,max(-(value->>'projected_balance_minor')::bigint)) into expected,liquidity from jsonb_array_elements(schedule);
 payouts:=case when c->>'mechanism'='pooled_savings' then (c#>>'{contribution,member_count}')::integer else (c#>>'{contribution,round_count}')::integer end;
 rewards:=(c#>>'{reward,unit_cost_minor}')::bigint*(c#>>'{reward,quantity}')::integer*payouts;delivery:=(c#>>'{reward,delivery_per_payout_minor}')::bigint*payouts;fees:=(c#>>'{funding,disclosed_fees_minor}')::bigint;
 available:=expected+(c#>>'{funding,opening_funding_minor}')::bigint;required:=greatest(rewards+delivery+fees,case when c->>'mechanism'='pooled_savings' then (c#>>'{mechanism_options,target_minor}')::bigint else 0 end);shortfall:=greatest(0,required-available);
 if shortfall>0 then errors:=errors||'["Total funding shortfall."]';end if;if liquidity>0 then errors:=errors||'["At least one scheduled payout is unfunded."]';end if;
 return jsonb_build_object('valid',jsonb_array_length(errors)=0,'errors',errors,'expected_collections_minor',expected,'reward_costs_minor',rewards,'delivery_costs_minor',delivery,'disclosed_fees_minor',fees,'available_funding_minor',available,'required_funding_minor',required,'shortfall_minor',shortfall,'liquidity_shortfall_minor',liquidity,'payouts',payouts,'product_quantity',payouts*(c#>>'{reward,quantity}')::integer);
end $$;

create function private.repa_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Version snapshots, consent and checks are immutable; create a new rules version' using errcode='42501';end $$;
create trigger rules_immutable before update or delete on public.group_rules for each row execute function private.repa_immutable();
create trigger schedule_immutable before update or delete on public.schedule_definitions for each row execute function private.repa_immutable();
create trigger fields_immutable before update or delete on public.form_field_definitions for each row execute function private.repa_immutable();
create trigger consent_immutable before update or delete on public.repa_member_consents for each row execute function private.repa_immutable();
create trigger checks_immutable before update or delete on public.group_activation_checks for each row execute function private.repa_immutable();
create function private.repa_version_immutable() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'Version history cannot be deleted' using errcode='42501';end if;
 if old.approval_status<>'pending' or new.approval_status not in ('approved','rejected') or to_jsonb(old)-array['approval_status','approved_by','approved_at']<>to_jsonb(new)-array['approval_status','approved_by','approved_at'] then raise exception 'Accepted versions cannot be edited' using errcode='42501';end if;return new;end $$;
create trigger version_immutable before update or delete on public.group_config_versions for each row execute function private.repa_version_immutable();
create function private.repa_group_lock() returns trigger language plpgsql set search_path='' as $$begin
 if old.accepted_version_id is not null and (new.accepted_version_id is distinct from old.accepted_version_id or row(new.name,new.description,new.image_path,new.visibility,new.currency,new.mechanism,new.start_date,new.organization_id) is distinct from row(old.name,old.description,old.image_path,old.visibility,old.currency,old.mechanism,old.start_date,old.organization_id)) then raise exception 'Accepted financial rules are locked; submit a future version proposal' using errcode='42501';end if;return new;end $$;
create trigger repa_group_lock before update on public.repa_groups for each row execute function private.repa_group_lock();
create function private.repa_membership_lock() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.repa_groups where id=case when tg_op='DELETE' then old.group_id else new.group_id end for update;
 if (tg_op<>'INSERT' and old.role='member' and exists(select 1 from public.repa_groups where id=old.group_id and accepted_version_id is not null)) or (tg_op<>'DELETE' and new.role='member' and exists(select 1 from public.repa_groups where id=new.group_id and accepted_version_id is not null)) then raise exception 'Accepted REPA membership cannot be changed by a scope assignment' using errcode='42501';end if;
 if tg_op<>'DELETE' and exists(select 1 from public.repa_groups where id=new.group_id) then
 if new.role='member' then
 if new.repa_slot is null then select min(slot) into new.repa_slot from generate_series(1,(select membership_limit from public.group_rules where version_id=(select latest_version_id from public.repa_groups where id=new.group_id))) slot where not exists(select 1 from public.group_role_assignments a where a.group_id=new.group_id and a.repa_slot=slot and a.user_id<>new.user_id);end if;
 if new.repa_slot is null then raise exception 'No available REPA member slot' using errcode='22023';end if;
 else new.repa_slot:=null;end if;end if;
 if tg_op='DELETE' then return old;else return new;end if;end $$;
create trigger repa_membership_lock before insert or update or delete on public.group_role_assignments for each row execute function private.repa_membership_lock();

create function public.save_repa_draft(target_organization uuid,group_id uuid,expected_revision integer,configuration jsonb,change_summary text,effective_date timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_account(true);g public.repa_groups;gid uuid;vid uuid;previous uuid;old_config jsonb;
begin
 if not private.authorized(target_organization,'groups.manage') then raise exception 'Organizer permission required' using errcode='42501';end if;
 if expected_revision is null or expected_revision<0 or not isfinite(effective_date) then raise exception 'Valid revision and finite effective date required' using errcode='22023';end if;
 perform private.repa_shape(configuration);perform private.repa_validate_fields(configuration->'fields');
 if (configuration#>>'{basic,organization_id}')::uuid<>target_organization or coalesce(char_length(btrim(change_summary)),0) not between 3 and 1000 or effective_date is null then raise exception 'Invalid organization, change summary or effective date' using errcode='22023';end if;
 if group_id is null then
 if expected_revision<>0 then raise exception 'Stale draft revision' using errcode='40001';end if;
 gid:=gen_random_uuid();insert into public.group_scopes(id,organization_id,name) values(gid,target_organization,coalesce(nullif(configuration#>>'{basic,name}',''),'Untitled REPA'));
 insert into public.repa_groups(id,organization_id,name,description,image_path,visibility,currency,mechanism,start_date,created_by) values(gid,target_organization,configuration#>>'{basic,name}',configuration#>>'{basic,description}',configuration#>>'{basic,image_path}',configuration#>>'{basic,visibility}',configuration#>>'{basic,currency}',configuration->>'mechanism',(configuration#>>'{basic,start_date}')::date,actor);
 end if;
 gid:=coalesce(group_id,gid);select * into g from public.repa_groups where id=gid for update;
 if g.id is null or g.organization_id<>target_organization then raise exception 'Group unavailable' using errcode='42501';end if;
 if g.revision<>expected_revision then raise exception 'Draft changed in another session. Reload before saving' using errcode='40001';end if;
 if g.status in ('completed','cancelled','archived') then raise exception 'This group no longer accepts configuration changes' using errcode='22023';end if;
 if g.accepted_version_id is not null and effective_date<=now() then raise exception 'Active group proposals require a future effective date' using errcode='22023';end if;
 if configuration#>>'{basic,image_path}'<>'' and configuration#>>'{basic,image_path}' !~ ('^'||gid::text||'/[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$') then raise exception 'Invalid group image path' using errcode='22023';end if;
 previous:=g.latest_version_id;old_config:=case when previous is not null then private.repa_config(previous) else '{}'::jsonb end;
 insert into public.group_config_versions(group_id,version_number,previous_version_id,change_summary,changes,changed_by,effective_date)
 values(gid,g.revision+1,previous,btrim(change_summary),private.repa_diff(old_config,configuration),actor,effective_date) returning id into vid;
 perform private.repa_insert_rules(vid,configuration);
 update public.repa_groups set latest_version_id=vid,revision=revision+1,updated_at=now(),
 name=case when accepted_version_id is null then configuration#>>'{basic,name}' else name end,
 description=case when accepted_version_id is null then configuration#>>'{basic,description}' else description end,
 image_path=case when accepted_version_id is null then configuration#>>'{basic,image_path}' else image_path end,
 visibility=case when accepted_version_id is null then configuration#>>'{basic,visibility}' else visibility end,
 currency=case when accepted_version_id is null then configuration#>>'{basic,currency}' else currency end,
 mechanism=case when accepted_version_id is null then configuration->>'mechanism' else mechanism end,
 start_date=case when accepted_version_id is null then (configuration#>>'{basic,start_date}')::date else start_date end where id=gid;
 if g.accepted_version_id is null then update public.group_scopes set name=coalesce(nullif(configuration#>>'{basic,name}',''),'Untitled REPA') where id=gid;end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(target_organization,actor,'repa.rules_proposed',gid);return gid;
end $$;

create function private.repa_upload_errors(defs jsonb,vals jsonb,gid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f jsonb;v jsonb;row_value jsonb;errors jsonb:='[]';begin
 for f in select * from jsonb_array_elements(defs) loop
 v:=vals->(f->>'key');if f?'condition' and vals->(f#>>'{condition,key}') is distinct from f#>'{condition,equals}' then continue;end if;
 if f->>'type' in ('file','image') and jsonb_typeof(v)='string' and v<>'""'::jsonb then
 if split_part(v#>>'{}','/',1)<>gid::text or not exists(select 1 from storage.objects where bucket_id='repa-uploads' and name=v#>>'{}') then errors:=errors||jsonb_build_array((f->>'label')||' must reference an existing upload for this group.');end if;
 elsif f->>'type'='repeating' and jsonb_typeof(v)='array' then for row_value in select * from jsonb_array_elements(v) loop errors:=errors||private.repa_upload_errors(f->'children',row_value,gid);end loop;end if;
 end loop;return errors;end $$;
create function public.check_repa_activation(target uuid,version_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.repa_manage(target);c jsonb;report jsonb;members integer;consents integer;approvers integer;g public.repa_groups;errors jsonb;
begin
 select * into g from public.repa_groups where id=target;
 if g.latest_version_id<>version_id or version_id is null then raise exception 'Select the latest rules version' using errcode='40001';end if;
 c:=private.repa_config(version_id);report:=private.repa_funding(c);errors:=report->'errors';
 errors:=errors||private.repa_upload_errors((select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(c->'fields') where value->>'category'='reward'),c#>'{reward,custom_values}',target);
 if c#>>'{basic,image_path}'<>'' and not exists(select 1 from storage.objects where bucket_id='repa-uploads' and name=c#>>'{basic,image_path}') then errors:=errors||'["Group image upload is missing."]';end if;
 select count(*) into members from public.group_role_assignments a join public.profiles p on p.id=a.user_id join auth.users u on u.id=p.id where a.group_id=target and a.role='member' and p.account_status='active' and p.profile_completed_at is not null and u.email_confirmed_at is not null;
 select count(*) into consents from public.group_role_assignments a join public.repa_member_consents mc on mc.user_id=a.user_id and mc.version_id=check_repa_activation.version_id where a.group_id=target and a.role='member';
 select count(distinct m.user_id) into approvers from public.organization_members m join public.profiles p on p.id=m.user_id join auth.users u on u.id=m.user_id join auth.mfa_factors mf on mf.user_id=m.user_id and mf.status='verified' where m.organization_id=g.organization_id and m.role in ('owner','organizer') and p.account_status='active' and p.profile_completed_at is not null and u.email_confirmed_at is not null;
 if members<>(c#>>'{contribution,member_count}')::integer or (select count(*) from public.group_role_assignments where group_id=target and role='member')<>members or exists(select 1 from public.group_role_assignments where group_id=target and role='member' and (repa_slot is null or repa_slot>(c#>>'{contribution,member_count}')::integer)) then errors:=errors||'["Assign exactly the configured number of verified, active members before activation."]';end if;
 if consents<>members then errors:=errors||'["Every assigned member must accept this exact rules version."]';end if;
 if approvers<(c#>>'{distribution,approval_count}')::integer then errors:=errors||'["Not enough verified, MFA-enrolled staff with payout-management access for the configured approval count."]';end if;
 if g.accepted_version_id is null and (c#>>'{basic,start_date}')::date<(now() at time zone (c#>>'{schedule,timezone}'))::date then errors:=errors||'["The initial start date must not be in the past."]';end if;
 report:=report||jsonb_build_object('errors',errors,'valid',jsonb_array_length(errors)=0,'assigned_members',members,'member_consents',consents,'eligible_approvers',approvers);
 insert into public.group_activation_checks(group_id,version_id,passed,result,checked_by) values(target,version_id,(report->>'valid')::boolean,report,actor);return report;
end $$;
create function public.consent_repa_rules(target_version uuid,custom_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_account();v public.group_config_versions;defs jsonb;c jsonb;errors jsonb;
begin
 select * into v from public.group_config_versions where id=target_version;
 if v.id is null or not exists(select 1 from public.group_role_assignments a where a.group_id=v.group_id and a.user_id=actor and a.role='member') or not private.repa_can_read(v.group_id) then raise exception 'Assigned group membership required' using errcode='42501';end if;
 if v.approval_status='rejected' then raise exception 'Rejected rules cannot be accepted' using errcode='22023';end if;
 c:=private.repa_config(v.id);errors:=private.repa_config_errors(c);
 select coalesce(jsonb_agg(value),'[]') into defs from jsonb_array_elements(c->'fields') where value->>'category'='membership';
 errors:=errors||private.repa_dynamic_errors(defs,custom_values,true)||private.repa_upload_errors(defs,custom_values,v.group_id);
 if jsonb_array_length(errors)>0 then raise exception 'Complete required agreement fields: %',errors using errcode='22023';end if;
 if exists(select 1 from public.repa_member_consents mc where mc.version_id=target_version and mc.user_id=actor) then return;end if;
 insert into public.repa_member_consents(version_id,user_id,custom_values) values(target_version,actor,consent_repa_rules.custom_values);
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) select organization_id,actor,'repa.rules_accepted',v.group_id from public.repa_groups where id=v.group_id;
end $$;

create function public.activate_repa_group(target uuid,target_version uuid,accepted_terms boolean) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.repa_manage(target);g public.repa_groups;report jsonb;v public.group_config_versions;
begin
 select * into g from public.repa_groups where id=target for update;
 if g.status='active' and g.accepted_version_id=target_version then return;end if;
 if g.status not in ('draft','enrollment_closed') or accepted_terms is distinct from true then raise exception 'Close enrollment and accept the rules before activation' using errcode='22023';end if;
 select * into v from public.group_config_versions where id=target_version and group_id=target for update;
 if v.approval_status<>'pending' or v.id is null or v.effective_date>now() then raise exception 'Select a pending rules version whose effective date has arrived' using errcode='22023';end if;
 report:=public.check_repa_activation(target,target_version);
 if (report->>'valid')::boolean is distinct from true then raise exception 'Activation blocked: %',report->'errors' using errcode='22023';end if;
 update public.group_config_versions set approval_status='approved',approved_by=actor,approved_at=now() where id=target_version;
 update public.repa_groups set status='active',accepted_version_id=target_version,updated_at=now() where id=target;
 insert into public.organization_closure_blocks(organization_id,source_kind,source_id,reason) values(g.organization_id,'repa_group',target,'Active REPA rules require completion or cancellation before organization closure');
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(g.organization_id,actor,'repa.activated',target);
end $$;
create function public.approve_repa_proposal(target uuid,target_version uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.repa_manage(target);g public.repa_groups;v public.group_config_versions;report jsonb;
begin
 select * into g from public.repa_groups where id=target for update;
 select * into v from public.group_config_versions where id=target_version and group_id=target for update;
 if g.accepted_version_id is null or g.status not in ('active','paused') or g.latest_version_id<>target_version or v.approval_status<>'pending' or v.effective_date<=now() then raise exception 'Only future proposals for active or paused groups can be approved' using errcode='22023';end if;
 report:=public.check_repa_activation(target,target_version);if (report->>'valid')::boolean is distinct from true then raise exception 'Proposal blocked: %',report->'errors' using errcode='22023';end if;
 update public.group_config_versions set approval_status='approved',approved_by=actor,approved_at=now() where id=target_version;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(g.organization_id,actor,'repa.future_rules_approved',target);
end $$;
create function public.transition_repa_group(target uuid,expected_status text,new_status text,reason text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.repa_manage(target);g public.repa_groups;allowed text[];
begin
 select * into g from public.repa_groups where id=target for update;
 if expected_status is null or g.status<>expected_status then raise exception 'Group state changed. Reload before continuing' using errcode='40001';end if;
 allowed:=case g.status when 'draft' then array['enrollment_open','cancelled'] when 'enrollment_open' then array['enrollment_closed','cancelled'] when 'enrollment_closed' then array['enrollment_open','cancelled'] when 'active' then array['paused','completed','cancelled'] when 'paused' then array['active','cancelled'] when 'completed' then array['archived'] when 'cancelled' then array['archived'] else '{}' end;
 if new_status is null or not(new_status=any(allowed)) or coalesce(char_length(btrim(reason)),0) not between 3 and 500 then raise exception 'Invalid state transition or missing reason' using errcode='22023';end if;
 if new_status in ('enrollment_open','enrollment_closed') and jsonb_array_length(private.repa_config_errors(private.repa_config(g.latest_version_id)))>0 then raise exception 'Complete the group configuration before enrollment' using errcode='22023';end if;
 if new_status='completed' and (private.repa_schedule(private.repa_config(g.accepted_version_id))->-1->>'grace_ends_at')::timestamptz>now() then raise exception 'The configured schedule has not ended' using errcode='22023';end if;
 update public.repa_groups set status=new_status,updated_at=now() where id=target;
 if new_status in ('completed','cancelled') then update public.organization_closure_blocks set resolved_at=now() where source_kind='repa_group' and source_id=target and resolved_at is null;end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(g.organization_id,actor,'repa.status.'||new_status||': '||btrim(reason),target);
end $$;

create function public.set_repa_member(target uuid,member_user uuid,assigned boolean) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.repa_manage(target);g public.repa_groups;begin
 select * into g from public.repa_groups where id=target for update;
 if g.accepted_version_id is not null then raise exception 'Accepted membership is locked' using errcode='42501';end if;
 if g.status not in ('draft','enrollment_open','enrollment_closed') then raise exception 'This group no longer accepts membership changes' using errcode='22023';end if;
 if assigned is null or not exists(select 1 from public.organization_members where organization_id=g.organization_id and user_id=member_user) then raise exception 'Choose a current organization member' using errcode='22023';end if;
 if assigned then
 if exists(select 1 from public.group_role_assignments where group_id=target and user_id=member_user and role<>'member') then raise exception 'This user has a separate staff assignment' using errcode='22023';end if;
 if not exists(select 1 from public.group_role_assignments where group_id=target and user_id=member_user) and (select count(*) from public.group_role_assignments where group_id=target and role='member')>=(select membership_limit from public.group_rules where version_id=g.latest_version_id) then raise exception 'Configured member limit reached' using errcode='22023';end if;
 insert into public.group_role_assignments(organization_id,group_id,user_id,role,assigned_by) values(g.organization_id,target,member_user,'member',actor) on conflict(group_id,user_id) do nothing;
 else delete from public.group_role_assignments where group_id=target and user_id=member_user and role='member';end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(g.organization_id,actor,case when assigned then 'repa.member_added' else 'repa.member_removed' end,target);
 end $$;

create function public.get_repa_group(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.repa_groups;actor uuid:=auth.uid();manager boolean;
begin
 if not private.repa_can_read(target) then raise exception 'Group unavailable' using errcode='42501';end if;
 select * into g from public.repa_groups where id=target;manager:=private.authorized(g.organization_id,'groups.manage',g.id);
 return jsonb_build_object('group',to_jsonb(g),'configuration',private.repa_config(g.latest_version_id),'accepted_configuration',private.repa_config(g.accepted_version_id),
 'versions',(select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('member_consent_count',(select count(*) from public.repa_member_consents mc where mc.version_id=v.id)) order by v.version_number desc),'[]') from public.group_config_versions v where v.group_id=target),
 'checks',(select coalesce(jsonb_agg(x),'[]') from (select * from public.group_activation_checks where group_id=target order by checked_at desc limit 20) x),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'name',p.full_name,'role',a.role,'slot',a.repa_slot,'consented',exists(select 1 from public.repa_member_consents mc where mc.version_id=g.latest_version_id and mc.user_id=a.user_id))),'[]') from public.group_role_assignments a join public.profiles p on p.id=a.user_id where a.group_id=target),
 'my_consent',(select to_jsonb(mc) from public.repa_member_consents mc where mc.version_id=g.latest_version_id and mc.user_id=actor),'can_manage',manager,
 'schedule',case when jsonb_array_length(private.repa_config_errors(private.repa_config(g.latest_version_id)))=0 then private.repa_schedule(private.repa_config(g.latest_version_id)) else '[]'::jsonb end);
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('repa-uploads','repa-uploads',false,2097152,array['image/png','image/jpeg','image/webp','application/pdf','text/plain']);
create function private.repa_upload_access(path text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$declare gid uuid;begin
 if path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|jpeg|webp|pdf|txt)$' then return false;end if;
 gid:=split_part(path,'/',1)::uuid;
 return private.repa_can_read(gid) and case when writing then split_part(path,'/',2)=auth.uid()::text and exists(select 1 from public.repa_groups g where g.id=gid and (private.authorized(g.organization_id,'groups.manage',g.id) or exists(select 1 from public.group_role_assignments a where a.group_id=g.id and a.user_id=auth.uid() and a.role='member')))
 else split_part(path,'/',2)=auth.uid()::text or exists(select 1 from public.repa_groups g where g.id=gid and private.authorized(g.organization_id,'groups.manage',g.id)) or exists(select 1 from public.group_rules r join public.group_config_versions v on v.id=r.version_id where v.group_id=gid and (r.basic_image_path=path or jsonb_path_exists(r.reward_custom_values,'$.** ? (@ == $file)',jsonb_build_object('file',path)))) end;
end $$;
create policy repa_upload_read on storage.objects for select to authenticated using(bucket_id='repa-uploads' and private.repa_upload_access(name,false));
create policy repa_upload_insert on storage.objects for insert to authenticated with check(bucket_id='repa-uploads' and private.repa_upload_access(name,true));
create policy repa_upload_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'repa-uploads' or private.repa_upload_access(name,false));
create policy repa_upload_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'repa-uploads' or private.repa_upload_access(name,true));
create policy repa_upload_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'repa-uploads') with check(bucket_id<>'repa-uploads');
create policy repa_upload_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'repa-uploads');
create policy repa_upload_no_anon on storage.objects as restrictive for all to anon using(bucket_id<>'repa-uploads') with check(bucket_id<>'repa-uploads');
revoke all on function private.repa_upload_access(text,boolean) from public,anon;grant execute on function private.repa_upload_access(text,boolean) to authenticated;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'repa_%' and p.proname not in ('repa_can_read','repa_version_read','repa_upload_access') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['save_repa_draft','check_repa_activation','consent_repa_rules','activate_repa_group','approve_repa_proposal','transition_repa_group','get_repa_group','set_repa_member']) loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;
end $$;
commit;
