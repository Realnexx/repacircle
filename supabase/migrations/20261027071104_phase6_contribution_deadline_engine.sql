begin;
-- Accepted schedule/rule extensions. Existing rule and obligation rows remain immutable.
alter table public.schedule_definitions drop constraint schedule_definitions_check;
alter table public.schedule_definitions add check(frequency in ('daily','weekly','biweekly','monthly','custom','weekdays','monthly_dates','custom_dates') and every_days between 1 and 365 and grace_hours between 0 and 168 and timezone in ('Asia/Manila','UTC'));
create table public.contribution_rule_definitions(
 version_id uuid primary key references public.group_config_versions(id),weekdays integer[] not null default '{}',monthly_dates integer[] not null default '{}',custom_dates date[] not null default '{}',
 fee_mode text not null default 'none' check(fee_mode in ('none','fixed','percentage')),fixed_minor bigint not null default 0 check(fixed_minor between 0 and 1000000000),rate_basis_points integer not null default 0 check(rate_basis_points between 0 and 10000),cap_minor bigint not null default 0 check(cap_minor between 0 and 1000000000),
 review_reference text not null default '',reviewed_by text not null default '',reviewed_on date,disclosure text not null default '',has_fee_rule boolean not null default false
);
create function private.ce_dates(s jsonb,n integer) returns table(round_number integer,local_date date) language plpgsql immutable set search_path='' as $$
 declare anchor date:=(s->>'start_date')::date;candidate date;month_start date;i integer;found integer:=0;freq text:=s->>'frequency';dates jsonb:=coalesce(s->'custom_dates','[]');choices jsonb;step integer;begin
 if n is null or n not between 1 and 1000 then raise exception 'Choose 1 to 1000 rounds' using errcode='22023';end if;
 if freq='custom_dates' then
 if jsonb_array_length(dates)<>n then raise exception 'Enter one ascending custom date per round' using errcode='22023';end if;
 for i in 0..n-1 loop candidate:=(dates->>i)::date;if candidate<anchor or (i>0 and candidate<=(dates->>(i-1))::date) then raise exception 'Custom dates must be unique, ascending and on or after the start date' using errcode='22023';end if;round_number:=i+1;local_date:=candidate;return next;end loop;return;
 elsif freq in ('weekdays','monthly_dates') then
 choices:=coalesce(s->case when freq='weekdays' then 'weekdays' else 'monthly_dates' end,'[]');
 if jsonb_array_length(choices)=0 then raise exception 'Choose specific weekdays or monthly dates' using errcode='22023';end if;
 for i in 0..n*62+366 loop candidate:=anchor+i;if extract(year from candidate) not between 1 and 9999 then raise exception 'Schedule calendar range exceeded' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements_text(choices) v where v::integer=case when freq='weekdays' then extract(isodow from candidate)::integer else extract(day from candidate)::integer end) then found:=found+1;round_number:=found;local_date:=candidate;return next;exit when found=n;end if;end loop;
 if found<>n then raise exception 'Schedule calendar range exceeded' using errcode='22023';end if;return;
 end if;
 step:=case freq when 'daily' then 1 when 'weekly' then 7 when 'biweekly' then 14 when 'custom' then (s->>'every_days')::integer when 'monthly' then 1 end;
 if step is null or step not between 1 and 365 then raise exception 'Invalid schedule frequency or interval' using errcode='22023';end if;
 for i in 0..n-1 loop
 if freq='monthly' then month_start:=(date_trunc('month',anchor)+make_interval(months=>i))::date;candidate:=month_start+least(extract(day from anchor)::integer,extract(day from month_start+interval '1 month - 1 day')::integer)-1;
 else candidate:=anchor+i*step;end if;
 if extract(year from candidate) not between 1 and 9999 then raise exception 'Schedule calendar range exceeded' using errcode='22023';end if;
 round_number:=i+1;local_date:=candidate;return next;end loop;end $$;

create function private.ce_base(c jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_set(jsonb_set(c,'{schedule}',case when c#>>'{schedule,frequency}' in ('weekdays','monthly_dates','custom_dates') then jsonb_set((c->'schedule')-array['weekdays','monthly_dates','custom_dates'],'{frequency}','"daily"') else (c->'schedule')-array['weekdays','monthly_dates','custom_dates'] end),'{contribution}',(c->'contribution')-'late_fee_rule');$$;
create function private.ce_rule_shape(c jsonb) returns void language plpgsql immutable set search_path='' as $$
 declare key text;a jsonb;v jsonb;f jsonb:=c#>'{contribution,late_fee_rule}';begin
 if c#>>'{schedule,frequency}' not in ('daily','weekly','biweekly','monthly','custom','weekdays','monthly_dates','custom_dates') then raise exception 'Invalid schedule frequency' using errcode='22023';end if;
 for key in select unnest(array['weekdays','monthly_dates','custom_dates']) loop a:=c->'schedule'->key;if a is null then continue;end if;
 if jsonb_typeof(a) is distinct from 'array' or jsonb_array_length(a)>(case key when 'weekdays' then 7 when 'monthly_dates' then 31 else 1000 end) then raise exception 'Invalid schedule date list' using errcode='22023';end if;
 for v in select * from jsonb_array_elements(a) loop
 if key='custom_dates' then if jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char((v#>>'{}')::date,'YYYY-MM-DD')<>v#>>'{}' then raise exception 'Invalid custom date' using errcode='22023';end if;
 elsif jsonb_typeof(v) is distinct from 'number' or (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) or (v#>>'{}')::numeric not between 1 and (case key when 'weekdays' then 7 else 31 end) then raise exception 'Invalid calendar day' using errcode='22023';end if;end loop;
 if (select count(distinct value) from jsonb_array_elements(a))<>jsonb_array_length(a) then raise exception 'Calendar selections must be unique' using errcode='22023';end if;end loop;
 if f is not null then
 if jsonb_typeof(f) is distinct from 'object' or not(f ?& array['mode','fixed_minor','rate_basis_points','cap_minor','review_reference','reviewed_by','reviewed_on','disclosure']) or f-array['mode','fixed_minor','rate_basis_points','cap_minor','review_reference','reviewed_by','reviewed_on','disclosure']<>'{}' or f->>'mode' not in ('none','fixed','percentage') then raise exception 'Invalid late fee rule' using errcode='22023';end if;
 for key in select unnest(array['fixed_minor','rate_basis_points','cap_minor']) loop v:=f->key;if jsonb_typeof(v) is distinct from 'number' or (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) or (v#>>'{}')::numeric not between 0 and (case key when 'rate_basis_points' then 10000 else 1000000000 end) then raise exception 'Invalid late fee amount/rate/cap' using errcode='22023';end if;end loop;
 for key in select unnest(array['review_reference','reviewed_by','reviewed_on','disclosure']) loop if jsonb_typeof(f->key) is distinct from 'string' or char_length(f->>key)>(case key when 'review_reference' then 500 when 'reviewed_by' then 200 when 'reviewed_on' then 10 else 4000 end) then raise exception 'Invalid late fee disclosure or review' using errcode='22023';end if;end loop;
 if f->>'reviewed_on'<>'' and to_char((f->>'reviewed_on')::date,'YYYY-MM-DD')<>f->>'reviewed_on' then raise exception 'Invalid review date' using errcode='22023';end if;
 end if;end $$;

-- Keep function OIDs: policies and existing callers continue through the extended validation.
do $$begin
 execute replace(pg_get_functiondef('private.repa_shape(jsonb)'::regprocedure),'FUNCTION private.repa_shape(','FUNCTION private.phase5_repa_shape(');
 execute replace(pg_get_functiondef('private.repa_config(uuid)'::regprocedure),'FUNCTION private.repa_config(','FUNCTION private.phase5_repa_config(');
 execute replace(pg_get_functiondef('private.repa_config_errors(jsonb)'::regprocedure),'FUNCTION private.repa_config_errors(','FUNCTION private.phase5_repa_config_errors(');
 execute replace(pg_get_functiondef('private.repa_insert_rules(uuid,jsonb)'::regprocedure),'FUNCTION private.repa_insert_rules(','FUNCTION private.phase5_repa_insert_rules(');
end $$;
create or replace function private.repa_shape(config jsonb) returns void language plpgsql stable security definer set search_path='' as $$begin perform private.ce_rule_shape(config);perform private.phase5_repa_shape(private.ce_base(config));end $$;
create or replace function private.repa_insert_rules(target uuid,config jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare f jsonb:=config#>'{contribution,late_fee_rule}';begin
 perform private.phase5_repa_insert_rules(target,config);
 insert into public.contribution_rule_definitions(version_id,weekdays,monthly_dates,custom_dates,fee_mode,fixed_minor,rate_basis_points,cap_minor,review_reference,reviewed_by,reviewed_on,disclosure,has_fee_rule)
 values(target,array(select jsonb_array_elements_text(coalesce(config#>'{schedule,weekdays}','[]'))::integer),array(select jsonb_array_elements_text(coalesce(config#>'{schedule,monthly_dates}','[]'))::integer),array(select jsonb_array_elements_text(coalesce(config#>'{schedule,custom_dates}','[]'))::date),coalesce(f->>'mode','none'),coalesce((f->>'fixed_minor')::bigint,0),coalesce((f->>'rate_basis_points')::integer,0),coalesce((f->>'cap_minor')::bigint,0),coalesce(f->>'review_reference',''),coalesce(f->>'reviewed_by',''),nullif(f->>'reviewed_on','')::date,coalesce(f->>'disclosure',''),f is not null);end $$;
create or replace function private.repa_config(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare c jsonb:=private.phase5_repa_config(target);r public.contribution_rule_definitions;begin select * into r from public.contribution_rule_definitions where version_id=target;if r.version_id is null then return c;end if;
 c:=jsonb_set(c,'{schedule}',c->'schedule'||jsonb_build_object('weekdays',r.weekdays,'monthly_dates',r.monthly_dates,'custom_dates',r.custom_dates));
 if r.has_fee_rule then c:=jsonb_set(c,'{contribution,late_fee_rule}',jsonb_build_object('mode',r.fee_mode,'fixed_minor',r.fixed_minor,'rate_basis_points',r.rate_basis_points,'cap_minor',r.cap_minor,'review_reference',r.review_reference,'reviewed_by',r.reviewed_by,'reviewed_on',coalesce(r.reviewed_on::text,''),'disclosure',r.disclosure));end if;return c;end $$;
create or replace function private.repa_config_errors(c jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare errors jsonb;f jsonb:=c#>'{contribution,late_fee_rule}';begin
 perform private.ce_rule_shape(c);errors:=private.phase5_repa_config_errors(case when f is not null and f->>'mode'<>'none' then jsonb_set(private.ce_base(c),'{contribution,late_fee_minor}','1') else private.ce_base(c) end);
 begin perform * from private.ce_dates(c->'schedule',(c#>>'{contribution,round_count}')::integer);exception when others then errors:=errors||jsonb_build_array(SQLERRM);end;
 if c#>>'{contribution,late_policy}'='fee' and f is not null and f->>'mode'<>'none' and ( (f->>'cap_minor')::bigint=0 or (f->>'mode'='fixed' and (f->>'fixed_minor')::bigint=0) or (f->>'mode'='percentage' and (f->>'rate_basis_points')::integer=0) or char_length(btrim(f->>'review_reference'))<3 or char_length(btrim(f->>'reviewed_by'))<2 or coalesce(f->>'reviewed_on','')='' or (f->>'reviewed_on')::date>current_date or char_length(btrim(f->>'disclosure'))<20) then errors:=errors||'["Record a legal review, clear fee disclosure, valid fee/rate and a positive maximum before activation."]';end if;
 if c#>>'{contribution,late_policy}'='fee' and (f is null or f->>'mode'='none') then errors:=errors||'["Automatic late fees require reviewed terms in this accepted rules version."]';end if;
 return errors;end $$;
create or replace function private.repa_schedule(c jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare row_value record;result jsonb:='[]';due timestamptz;collections bigint;balance bigint:=(c#>>'{funding,opening_funding_minor}')::bigint-(c#>>'{funding,disclosed_fees_minor}')::bigint;payouts integer;cost bigint;plan jsonb;begin
 collections:=case when c#>>'{contribution,policy}'='fixed' then (c#>>'{contribution,amount_minor}')::bigint*(c#>>'{contribution,member_count}')::integer else (select coalesce(sum((v->>'amount_minor')::bigint),0) from jsonb_array_elements(c#>'{contribution,member_amounts}') v) end;
 if c#>>'{reward,plan_id}' is not null then plan:=private.reward_plan_cost((c#>>'{reward,plan_id}')::uuid);end if;
 for row_value in select * from private.ce_dates(c->'schedule',(c#>>'{contribution,round_count}')::integer) loop
 due:=(row_value.local_date+(c#>>'{schedule,cutoff_time}')::time) at time zone (c#>>'{schedule,timezone}');payouts:=case when c->>'mechanism'='pooled_savings' then case when row_value.round_number=(c#>>'{contribution,round_count}')::integer then (c#>>'{contribution,member_count}')::integer else 0 end else 1 end;
 if plan is not null then select (v->>'required_minor')::bigint into cost from jsonb_array_elements(plan->'rounds') v where (v->>'round')::integer=row_value.round_number;
 else cost:=((c#>>'{reward,unit_cost_minor}')::bigint*(c#>>'{reward,quantity}')::integer+(c#>>'{reward,delivery_per_payout_minor}')::bigint)*payouts;end if;
 balance:=balance+collections-cost;result:=result||jsonb_build_array(jsonb_build_object('round',row_value.round_number,'date',row_value.local_date,'cutoff_at',due,'grace_ends_at',due+make_interval(hours=>(c#>>'{schedule,grace_hours}')::integer),'collections_minor',collections,'payout_count',payouts,'projected_balance_minor',balance));end loop;return result;end $$;

create unique index contribution_slot_round_unique on public.group_member_obligations(group_id,rules_version_id,member_slot,round_number);
create table public.contribution_obligation_terms(
 obligation_id uuid primary key references public.group_member_obligations(id),currency text not null check(currency in ('PHP','USD','EUR')),timezone text not null check(timezone in ('Asia/Manila','UTC')),local_due_date date not null,partial_payments boolean not null,late_policy text not null check(late_policy in ('flag','reject','fee'))
);
create function private.ce_snapshot_terms() returns trigger language plpgsql security definer set search_path='' as $$declare c jsonb:=private.repa_config(new.rules_version_id);begin insert into public.contribution_obligation_terms values(new.id,c#>>'{basic,currency}',c#>>'{schedule,timezone}',(new.due_at at time zone (c#>>'{schedule,timezone}'))::date,(c#>>'{contribution,partial_payments}')::boolean,c#>>'{contribution,late_policy}') on conflict do nothing;return new;end $$;
create trigger contribution_obligation_terms_snapshot after insert on public.group_member_obligations for each row execute function private.ce_snapshot_terms();
insert into public.contribution_obligation_terms select o.id,r.basic_currency,s.timezone,(o.due_at at time zone s.timezone)::date,r.contribution_partial_payments,r.contribution_late_policy from public.group_member_obligations o join public.group_rules r on r.version_id=o.rules_version_id join public.schedule_definitions s on s.version_id=o.rules_version_id;
create or replace function private.gm_snapshot_obligations(target uuid) returns void language plpgsql security definer set search_path='' as $$
 declare g public.repa_groups;c jsonb;begin select * into g from public.repa_groups where id=target;if g.accepted_version_id is null then return;end if;c:=private.repa_config(g.accepted_version_id);
 insert into public.group_member_obligations(group_id,original_member_id,rules_version_id,member_slot,round_number,due_minor,due_at,grace_ends_at)
 select target,m.id,g.accepted_version_id,m.slot,(r->>'round')::integer,case when c#>>'{contribution,policy}'='fixed' then (c#>>'{contribution,amount_minor}')::bigint else (select (v->>'amount_minor')::bigint from jsonb_array_elements(c#>'{contribution,member_amounts}') v where (v->>'slot')::integer=m.slot) end,(r->>'cutoff_at')::timestamptz,(r->>'grace_ends_at')::timestamptz
 from public.group_members m cross join jsonb_array_elements(private.repa_schedule(c)) r where m.group_id=target and m.status in ('active','suspended') and m.slot is not null and not exists(select 1 from public.group_member_obligations o where o.group_id=target and o.rules_version_id=g.accepted_version_id and o.member_slot=m.slot and o.round_number=(r->>'round')::integer) on conflict do nothing;end $$;

create table public.contribution_adjustments(
 id uuid primary key default gen_random_uuid(),obligation_id uuid not null references public.group_member_obligations(id),group_id uuid not null references public.repa_groups(id),kind text not null check(kind in ('late_fee','fee_waiver','extension','waiver','cancellation')),
 amount_minor bigint not null default 0 check(amount_minor between 0 and 1000000000),extended_due_at timestamptz,reason text not null,created_by uuid references auth.users(id),request_id uuid not null,created_at timestamptz not null default now(),unique(group_id,request_id)
);
create unique index contribution_fee_once on public.contribution_adjustments(obligation_id) where kind='late_fee';
create unique index contribution_terminal_once on public.contribution_adjustments(obligation_id) where kind in ('waiver','cancellation');
create index contribution_adjustments_obligation_idx on public.contribution_adjustments(obligation_id,created_at);
create table public.contribution_receipts(
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.repa_groups(id),obligation_id uuid not null references public.group_member_obligations(id),member_id uuid not null references public.group_members(id),principal_event_id uuid unique references public.group_member_financial_events(id),
 principal_minor bigint not null check(principal_minor>=0),fee_minor bigint not null check(fee_minor>=0),payment_method text not null check(payment_method in ('cash','gcash_manual','maya_manual','bank_transfer','gateway','custom')),
 external_reference text not null,evidence_note text not null,verified_by uuid not null references auth.users(id),verified_at timestamptz not null default now(),request_id uuid not null,unique(group_id,request_id),unique(group_id,external_reference),check(principal_minor+fee_minor>0),check((principal_minor>0)=(principal_event_id is not null))
);
create index contribution_receipts_obligation_idx on public.contribution_receipts(obligation_id,verified_at);
create index contribution_receipts_member_idx on public.contribution_receipts(member_id,verified_at);
create function private.ce_can_read(target uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.group_member_obligations o where o.id=target and (private.gm_owns(private.gm_obligation_owner(o.id)) or private.gm_can(o.group_id,'finance.read')));$$;

create function private.ce_state(target uuid,as_of timestamptz default now()) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare o public.group_member_obligations;t public.contribution_obligation_terms;r public.contribution_rule_definitions;paid bigint;fee bigint;fee_paid bigint;waived bigint;owed bigint;remaining bigint;due timestamptz;grace timestamptz;at_grace bigint;terminal text;status text;begin
 select * into o from public.group_member_obligations where id=target;if o.id is null then raise exception 'Obligation unavailable' using errcode='22023';end if;select * into t from public.contribution_obligation_terms where obligation_id=target;select * into r from public.contribution_rule_definitions where version_id=o.rules_version_id;
 select coalesce(sum(f.amount_minor),0) into paid from public.group_member_financial_events f where f.obligation_id=target and f.kind='contribution_credit';
 select coalesce(max(a.extended_due_at),o.due_at),coalesce(sum(a.amount_minor) filter(where a.kind='fee_waiver'),0),max(case a.kind when 'waiver' then 'waived' when 'cancellation' then 'cancelled' end) into due,waived,terminal from public.contribution_adjustments a where a.obligation_id=target;
 grace:=due+(o.grace_ends_at-o.due_at);select a.amount_minor into fee from public.contribution_adjustments a where a.obligation_id=target and a.kind='late_fee';
 if fee is null then fee:=0;
 if terminal is null and as_of>grace and t.late_policy='fee' and r.fee_mode in ('fixed','percentage') and exists(select 1 from public.repa_groups rg where rg.id=o.group_id and rg.status in ('active','paused')) then
 select greatest(0,o.due_minor-coalesce(sum(f.amount_minor),0)) into at_grace from public.group_member_financial_events f where f.obligation_id=target and f.recorded_at<=grace;
 if at_grace>0 then fee:=least(r.cap_minor,case when r.fee_mode='fixed' then r.fixed_minor else ceil(at_grace::numeric*r.rate_basis_points/10000)::bigint end);end if;end if;end if;
 select coalesce(sum(p.fee_minor),0) into fee_paid from public.contribution_receipts p where p.obligation_id=target;
 owed:=case when terminal is null then o.due_minor+greatest(0,fee-waived) else paid+fee_paid end;remaining:=greatest(0,owed-paid-fee_paid);
 status:=case when terminal is not null then terminal when remaining=0 then 'paid' when as_of>grace then 'overdue' when paid+fee_paid>0 then 'partially_paid' when (as_of at time zone t.timezone)::date<(due at time zone t.timezone)::date then 'upcoming' else 'unpaid' end;
 return jsonb_build_object('id',o.id,'group_id',o.group_id,'member_id',private.gm_obligation_owner(o.id),'rules_version_id',o.rules_version_id,'round',o.round_number,'member_slot',o.member_slot,'currency',t.currency,'timezone',t.timezone,'principal_due_minor',o.due_minor,'principal_verified_minor',paid,'principal_remaining_minor',greatest(0,o.due_minor-paid),'fee_minor',fee,'fee_waived_minor',waived,'fee_verified_minor',fee_paid,'fee_remaining_minor',greatest(0,fee-waived-fee_paid),'due_minor',owed,'verified_minor',paid+fee_paid,'remaining_minor',remaining,'original_due_at',o.due_at,'due_at',due,'local_due_date',(due at time zone t.timezone)::date,'grace_ends_at',grace,'grace_hours',extract(epoch from o.grace_ends_at-o.due_at)/3600,'partial_payments',t.partial_payments,'late_policy',t.late_policy,'status',status);end $$;
create function private.ce_assess(target uuid,as_of timestamptz default now()) returns void language plpgsql security definer set search_path='' as $$declare s jsonb:=private.ce_state(target,as_of);begin if (s->>'fee_minor')::bigint>0 and not exists(select 1 from public.contribution_adjustments where obligation_id=target and kind='late_fee') then insert into public.contribution_adjustments(obligation_id,group_id,kind,amount_minor,reason,request_id) values(target,(s->>'group_id')::uuid,'late_fee',(s->>'fee_minor')::bigint,'One-time fee under reviewed, accepted rules at grace expiry',gen_random_uuid()) on conflict do nothing;end if;end $$;

-- Legacy verified credits remain authoritative; all entry points enforce accepted partial/deadline rules.
do $$begin execute replace(replace(pg_get_functiondef('public.record_group_member_financial_event(uuid,text,uuid,integer,bigint,text,text)'::regprocedure),'FUNCTION public.record_group_member_financial_event(','FUNCTION private.phase5_record_group_member_financial_event('),'record_group_member_financial_event.','phase5_record_group_member_financial_event.');end $$;
create or replace function public.record_group_member_financial_event(member_id uuid,event_kind text,obligation_id uuid,round_number integer,amount_minor bigint,external_reference text,evidence_note text) returns uuid language plpgsql security definer set search_path='' as $$
 declare gid uuid;s jsonb;begin
 select group_id into gid from public.group_members where id=member_id;perform private.gm_require(gid,case when event_kind='contribution_credit' then 'finance.record' else 'rewards.record' end);perform 1 from public.repa_groups where id=gid for update;
 if event_kind='contribution_credit' and not exists(select 1 from public.group_member_financial_events f where f.group_id=gid and f.external_reference=btrim(record_group_member_financial_event.external_reference)) then
 s:=private.ce_state(obligation_id);
 if s->>'status' in ('waived','cancelled') then raise exception 'Obligation is closed to new credits' using errcode='22023';end if;
 if not (s->>'partial_payments')::boolean and amount_minor is distinct from (s->>'principal_remaining_minor')::bigint then raise exception 'Partial contributions are not enabled in the accepted rules' using errcode='22023';end if;
 if s->>'late_policy'='reject' and now()>(s->>'grace_ends_at')::timestamptz then raise exception 'The accepted deadline rejects late contributions; obtain an extension first' using errcode='22023';end if;
 perform private.ce_assess(obligation_id);
 end if;
 return private.phase5_record_group_member_financial_event(member_id,event_kind,obligation_id,round_number,amount_minor,external_reference,evidence_note);end $$;

create table public.contribution_obligation_status(
 obligation_id uuid primary key references public.group_member_obligations(id),group_id uuid not null references public.repa_groups(id),status text not null check(status in ('upcoming','unpaid','partially_paid','paid','overdue','waived','cancelled')),remaining_minor bigint not null,checked_at timestamptz not null
);
create index contribution_status_group_idx on public.contribution_obligation_status(group_id,status);
create table public.contribution_status_events(
 id bigint generated always as identity primary key,obligation_id uuid not null references public.group_member_obligations(id),group_id uuid not null references public.repa_groups(id),previous_status text,new_status text not null,detected_at timestamptz not null
);
create index contribution_status_events_obligation_idx on public.contribution_status_events(obligation_id,id desc);
create table public.contribution_rounds(
 group_id uuid not null references public.repa_groups(id),rules_version_id uuid not null references public.group_config_versions(id),round_number integer not null,
 status text not null check(status in ('upcoming','collecting','grace','overdue','ready')),expected_minor bigint not null,verified_minor bigint not null,outstanding_minor bigint not null,funding_gap_minor bigint not null,obligation_count integer not null,collection_ready boolean not null,can_progress boolean not null,grace_ends_at timestamptz not null,checked_at timestamptz not null,primary key(group_id,rules_version_id,round_number)
);
create table public.contribution_group_state(
 group_id uuid primary key references public.repa_groups(id),current_round integer not null,cycle_ready boolean not null,last_checked_at timestamptz not null
);
create index contribution_group_check_idx on public.contribution_group_state(last_checked_at,group_id);
create table public.contribution_job_runs(
 group_id uuid not null references public.repa_groups(id),rules_version_id uuid not null references public.group_config_versions(id),job_kind text not null check(job_kind in ('generation','deadline_check','grace_expiry','overdue_detection','reminders','collection_readiness','round_progression')),run_at timestamptz not null,completed_at timestamptz,primary key(group_id,rules_version_id,job_kind,run_at)
);
create table public.contribution_reminders(
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.repa_groups(id),obligation_id uuid not null references public.group_member_obligations(id),user_id uuid not null references auth.users(id),kind text not null check(kind in ('upcoming','due_today','overdue')),deadline_at timestamptz not null,scheduled_for timestamptz not null,status text not null default 'scheduled' check(status in ('scheduled','cancelled','dismissed')),unique(obligation_id,user_id,kind,deadline_at)
);
create index contribution_reminders_user_idx on public.contribution_reminders(user_id,status,scheduled_for);
create function private.ce_refresh_status(target uuid,as_of timestamptz default now()) returns void language plpgsql security definer set search_path='' as $$
 declare o record;s jsonb;old_status text;begin
 for o in select id from public.group_member_obligations where group_id=target loop s:=private.ce_state(o.id,as_of);select status into old_status from public.contribution_obligation_status where obligation_id=o.id;
 if old_status is distinct from s->>'status' then insert into public.contribution_status_events(obligation_id,group_id,previous_status,new_status,detected_at) values(o.id,target,old_status,s->>'status',as_of);end if;
 insert into public.contribution_obligation_status values(o.id,target,s->>'status',(s->>'remaining_minor')::bigint,as_of) on conflict(obligation_id) do update set status=excluded.status,remaining_minor=excluded.remaining_minor,checked_at=excluded.checked_at;end loop;end $$;
create function private.ce_refresh_rounds(target uuid,as_of timestamptz default now()) returns void language plpgsql security definer set search_path='' as $$
 declare g public.repa_groups;c jsonb;r record;count_expected integer;is_ready boolean;earlier_ready boolean:=true;state text;current_round integer:=1;begin
 select * into g from public.repa_groups where id=target;if g.accepted_version_id is null then return;end if;c:=private.repa_config(g.accepted_version_id);count_expected:=(c#>>'{contribution,member_count}')::integer;
 for r in with rows as materialized(select o.round_number,o.due_minor,private.ce_state(o.id,as_of) s from public.group_member_obligations o where o.group_id=target and o.rules_version_id=g.accepted_version_id)
 select round_number,count(*)::integer n,sum(due_minor)::bigint expected,sum((s->>'principal_verified_minor')::bigint)::bigint paid,sum((s->>'remaining_minor')::bigint)::bigint outstanding,min((s->>'due_at')::timestamptz) due,max((s->>'grace_ends_at')::timestamptz) grace from rows group by round_number order by round_number loop
 is_ready:=r.n=count_expected and r.outstanding=0 and r.paid>=r.expected and g.status='active';
 state:=case when is_ready and as_of>=r.grace and earlier_ready then 'ready' when as_of>r.grace then 'overdue' when as_of>r.due then 'grace' when (as_of at time zone (c#>>'{schedule,timezone}'))::date<(r.due at time zone (c#>>'{schedule,timezone}'))::date then 'upcoming' else 'collecting' end;
 insert into public.contribution_rounds values(target,g.accepted_version_id,r.round_number,state,r.expected,r.paid,r.outstanding,greatest(0,r.expected-r.paid),r.n,is_ready,is_ready and as_of>=r.grace and earlier_ready,r.grace,as_of) on conflict(group_id,rules_version_id,round_number) do update set status=excluded.status,expected_minor=excluded.expected_minor,verified_minor=excluded.verified_minor,outstanding_minor=excluded.outstanding_minor,funding_gap_minor=excluded.funding_gap_minor,obligation_count=excluded.obligation_count,collection_ready=excluded.collection_ready,can_progress=excluded.can_progress,grace_ends_at=excluded.grace_ends_at,checked_at=excluded.checked_at;
 if state='ready' and earlier_ready then current_round:=r.round_number+1;else earlier_ready:=false;end if;end loop;
 insert into public.contribution_group_state values(target,current_round,earlier_ready and current_round>(c#>>'{contribution,round_count}')::integer,as_of) on conflict(group_id) do update set current_round=excluded.current_round,cycle_ready=excluded.cycle_ready,last_checked_at=excluded.last_checked_at;end $$;
create function private.ce_schedule_reminders(target uuid,as_of timestamptz default now()) returns void language plpgsql security definer set search_path='' as $$
 declare o record;s jsonb;recipient uuid;kind text;begin
 for o in select x.id,m.user_id,m.status from public.group_member_obligations x join public.group_members m on m.id=private.gm_obligation_owner(x.id) where x.group_id=target loop
 s:=private.ce_state(o.id,as_of);recipient:=o.user_id;
 update public.contribution_reminders set status='cancelled' where obligation_id=o.id and status='scheduled' and (user_id<>recipient or o.status<>'active' or (s->>'remaining_minor')::bigint=0 or deadline_at<>(s->>'due_at')::timestamptz);
 if o.status<>'active' or (s->>'remaining_minor')::bigint=0 then continue;end if;
 kind:=case when s->>'status'='overdue' then 'overdue' when (as_of at time zone (s->>'timezone'))::date=(s->>'local_due_date')::date then 'due_today' when (s->>'due_at')::timestamptz between as_of and as_of+interval '3 days' then 'upcoming' end;
 if kind is not null then insert into public.contribution_reminders(group_id,obligation_id,user_id,kind,deadline_at,scheduled_for) values(target,o.id,recipient,kind,(s->>'due_at')::timestamptz,as_of) on conflict do nothing;end if;end loop;end $$;
create function private.ce_run_group(target uuid,as_of timestamptz default now()) returns integer language plpgsql security definer set search_path='' as $$
 declare g public.repa_groups;kind text;o record;runs integer:=0;begin select * into g from public.repa_groups where id=target for update;if g.accepted_version_id is null or g.status not in ('active','paused') then return 0;end if;
 for kind in select unnest(array['generation','deadline_check','grace_expiry','overdue_detection','reminders','collection_readiness','round_progression']) loop
 insert into public.contribution_job_runs(group_id,rules_version_id,job_kind,run_at) values(target,g.accepted_version_id,kind,date_trunc('minute',as_of)) on conflict do nothing;if not found then continue;end if;
 if kind='generation' then perform private.gm_snapshot_obligations(target);
 elsif kind in ('deadline_check','overdue_detection') then perform private.ce_refresh_status(target,as_of);
 elsif kind='grace_expiry' then for o in select id from public.group_member_obligations where group_id=target loop perform private.ce_assess(o.id,as_of);end loop;
 elsif kind='reminders' then perform private.ce_schedule_reminders(target,as_of);
 else perform private.ce_refresh_rounds(target,as_of);end if;
 update public.contribution_job_runs set completed_at=clock_timestamp() where group_id=target and rules_version_id=g.accepted_version_id and job_kind=kind and run_at=date_trunc('minute',as_of);runs:=runs+1;end loop;
 perform private.gm_refresh_closure(target);return runs;end $$;
create table private.ce_job_failures(group_id uuid not null references public.repa_groups(id),failed_at timestamptz not null,error_message text not null,primary key(group_id,failed_at));
alter table private.ce_job_failures enable row level security;
revoke all on private.ce_job_failures from public,anon,authenticated;
create function private.ce_tick(batch_size integer default 50) returns jsonb language plpgsql security definer set search_path='' as $$
 declare g record;processed integer:=0;runs integer:=0;failures integer:=0;begin
 if batch_size not between 1 and 200 then raise exception 'Invalid deadline batch size' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(867241601) then return jsonb_build_object('processed',0,'busy',true);end if;
 for g in select r.id from public.repa_groups r left join public.contribution_group_state s on s.group_id=r.id where r.accepted_version_id is not null and r.status in ('active','paused') order by s.last_checked_at nulls first,r.id limit batch_size loop
 begin runs:=runs+private.ce_run_group(g.id);processed:=processed+1;
 exception when others then failures:=failures+1;insert into private.ce_job_failures values(g.id,clock_timestamp(),left(SQLERRM,2000));insert into public.contribution_group_state values(g.id,1,false,now()) on conflict(group_id) do update set last_checked_at=excluded.last_checked_at;end;end loop;
 return jsonb_build_object('processed',processed,'stage_runs',runs,'failed_groups',failures);end $$;

create function public.record_verified_contribution(target uuid,amount_minor bigint,payment_method text,external_reference text,evidence_note text,request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare o public.group_member_obligations;s jsonb;actor uuid;receipt public.contribution_receipts;principal bigint;event uuid;rid uuid;begin
 select * into o from public.group_member_obligations where id=target;actor:=private.gm_require(o.group_id,'finance.record');perform 1 from public.repa_groups where id=o.group_id for update;
 if request_id is null or amount_minor is null or amount_minor<=0 or amount_minor>2000000000 or coalesce(char_length(btrim(external_reference)),0) not between 3 and 200 or coalesce(char_length(btrim(evidence_note)),0) not between 10 and 2000 then raise exception 'Valid verified receipt, reference and evidence are required' using errcode='22023';end if;
 select * into receipt from public.contribution_receipts p where p.group_id=o.group_id and p.request_id=record_verified_contribution.request_id;
 if receipt.id is not null then if row(receipt.obligation_id,receipt.principal_minor+receipt.fee_minor,receipt.payment_method,receipt.external_reference,receipt.evidence_note) is distinct from row(target,amount_minor,payment_method,btrim(external_reference),btrim(evidence_note)) then raise exception 'Receipt retry changed its facts' using errcode='40001';end if;return receipt.id;end if;
 if exists(select 1 from public.group_member_financial_events f where f.group_id=o.group_id and f.external_reference=btrim(record_verified_contribution.external_reference)) or exists(select 1 from public.contribution_receipts p where p.group_id=o.group_id and p.external_reference=btrim(record_verified_contribution.external_reference)) then raise exception 'This group payment reference is already recorded' using errcode='23505';end if;
 if payment_method is null or not exists(select 1 from public.group_rules r where r.version_id=o.rules_version_id and payment_method=any(r.payment_methods)) then raise exception 'Choose a payment method in the accepted rules' using errcode='22023';end if;
 perform private.ce_assess(target);s:=private.ce_state(target);
 if s->>'status' in ('paid','waived','cancelled') or amount_minor>(s->>'remaining_minor')::bigint then raise exception 'Receipt exceeds the remaining balance or the obligation is closed' using errcode='22023';end if;
 if not(s->>'partial_payments')::boolean and amount_minor<>(s->>'remaining_minor')::bigint then raise exception 'Partial contributions are not enabled' using errcode='22023';end if;
 if s->>'late_policy'='reject' and now()>(s->>'grace_ends_at')::timestamptz then raise exception 'An approved payment extension is required after this deadline' using errcode='22023';end if;
 principal:=least(amount_minor,(s->>'principal_remaining_minor')::bigint);
 if principal>0 then event:=public.record_group_member_financial_event((s->>'member_id')::uuid,'contribution_credit',target,o.round_number,principal,btrim(external_reference),btrim(evidence_note));end if;
 insert into public.contribution_receipts(group_id,obligation_id,member_id,principal_event_id,principal_minor,fee_minor,payment_method,external_reference,evidence_note,verified_by,request_id) values(o.group_id,target,(s->>'member_id')::uuid,event,principal,amount_minor-principal,payment_method,btrim(external_reference),btrim(evidence_note),actor,request_id) returning id into rid;
 perform private.ce_refresh_status(o.group_id);perform private.ce_refresh_rounds(o.group_id);perform private.ce_schedule_reminders(o.group_id);perform private.gm_refresh_closure(o.group_id);return rid;end $$;
create function public.adjust_contribution_obligation(target uuid,adjustment_kind text,amount_minor bigint,extended_due_at timestamptz,reason text,request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare o public.group_member_obligations;s jsonb;actor uuid;existing public.contribution_adjustments;adjustment_id uuid;begin
 select * into o from public.group_member_obligations where group_member_obligations.id=target;actor:=private.repa_manage(o.group_id);perform 1 from public.repa_groups where repa_groups.id=o.group_id for update;
 if request_id is null or coalesce(char_length(btrim(reason)),0) not between 10 and 2000 or adjustment_kind is null or adjustment_kind not in ('fee_waiver','extension','waiver','cancellation') or amount_minor is null or amount_minor<0 then raise exception 'Valid adjustment and explanation required' using errcode='22023';end if;
 select * into existing from public.contribution_adjustments a where a.group_id=o.group_id and a.request_id=adjust_contribution_obligation.request_id;
 if existing.id is not null then if row(existing.obligation_id,existing.kind,existing.amount_minor,existing.extended_due_at,existing.reason) is distinct from row(target,adjustment_kind,amount_minor,extended_due_at,btrim(reason)) then raise exception 'Adjustment retry changed its facts' using errcode='40001';end if;return existing.id;end if;
 perform private.ce_assess(target);s:=private.ce_state(target);
 if s->>'status' in ('paid','waived','cancelled') then raise exception 'The obligation is already settled' using errcode='22023';end if;
 if adjustment_kind='fee_waiver' then if extended_due_at is not null or amount_minor<=0 or amount_minor>(s->>'fee_remaining_minor')::bigint then raise exception 'Waive only an unpaid assessed fee' using errcode='22023';end if;
 elsif adjustment_kind='extension' then if amount_minor<>0 or extended_due_at is null or extended_due_at<=greatest(now(),(s->>'due_at')::timestamptz) or extended_due_at>now()+interval '366 days' then raise exception 'Choose a future extension after the current deadline, within 366 days' using errcode='22023';end if;
 else if amount_minor<>0 or extended_due_at is not null or (s->>'verified_minor')::bigint<>0 or (s->>'fee_remaining_minor')::bigint<>0 then raise exception 'Only unpaid obligations without outstanding fees can be waived or cancelled; recorded payments are preserved' using errcode='22023';end if;
 if adjustment_kind='cancellation' and (o.due_at<=now() or not exists(select 1 from public.repa_groups where repa_groups.id=o.group_id and status='cancelled')) then raise exception 'Only future unpaid obligations of a cancelled group can be cancelled' using errcode='22023';end if;end if;
 insert into public.contribution_adjustments(obligation_id,group_id,kind,amount_minor,extended_due_at,reason,created_by,request_id) values(target,o.group_id,adjustment_kind,amount_minor,extended_due_at,btrim(reason),actor,request_id) returning contribution_adjustments.id into adjustment_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id,details) select organization_id,actor,'contribution.'||adjustment_kind,target,jsonb_build_object('adjustment_id',adjustment_id,'reason',btrim(reason)) from public.repa_groups where repa_groups.id=o.group_id;
 perform private.ce_refresh_status(o.group_id);perform private.ce_refresh_rounds(o.group_id);perform private.ce_schedule_reminders(o.group_id);perform private.gm_refresh_closure(o.group_id);return adjustment_id;end $$;

-- Existing payout eligibility, membership exits and closure checks consume effective balances/deadlines.
do $$declare definition text;begin
 definition:=pg_get_functiondef('private.gm_financial_summary(uuid,integer)'::regprocedure);
 definition:=replace(definition,'sum(o.due_minor)','sum((private.ce_state(o.id)->>''due_minor'')::bigint)');
 definition:=replace(definition,'(select coalesce(sum(f.amount_minor),0) from public.group_member_financial_events f where f.obligation_id=o.id)','(private.ce_state(o.id)->>''verified_minor'')::bigint');
 definition:=replace(definition,'where group_id=g.id and grace_ends_at<=now()','where group_id=g.id and (private.ce_state(id)->>''grace_ends_at'')::timestamptz<=now()');
 definition:=replace(definition,'select max(grace_ends_at) into cutoff','select max((private.ce_state(id)->>''grace_ends_at'')::timestamptz) into cutoff');execute definition;
 definition:=pg_get_functiondef('private.gm_replacement_check(public.membership_replacements)'::regprocedure);
 definition:=replace(definition,'o.due_minor>(select coalesce(sum(f.amount_minor),0) from public.group_member_financial_events f where f.obligation_id=o.id)','(private.ce_state(o.id)->>''remaining_minor'')::bigint>0');
 definition:=replace(definition,'if exists(select 1 from public.group_member_financial_events where member_id=r.outgoing_member_id', 'if exists(select 1 from public.group_member_financial_events where member_id=r.outgoing_member_id');
 -- A late-fee/extension/waiver is also financial history and cannot be silently transferred.
 definition:=replace(definition,'if exists(select 1 from public.group_member_financial_events where member_id=r.outgoing_member_id', 'if exists(select 1 from public.contribution_adjustments a join public.group_member_obligations o on o.id=a.obligation_id where o.group_id=r.group_id and private.gm_obligation_owner(o.id)=r.outgoing_member_id and o.round_number>=r.from_round) then raise exception ''Adjusted obligations require settlement before replacement'' using errcode=''22023'';end if; if exists(select 1 from public.group_member_financial_events where member_id=r.outgoing_member_id');execute definition;
end $$;
create or replace function private.gm_refresh_closure(target uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.group_member_obligations o where o.group_id=target and (private.ce_state(o.id)->>'remaining_minor')::bigint>0) then
 insert into public.organization_closure_blocks(organization_id,source_kind,source_id,reason) select organization_id,'group_membership_obligations',id,'Accepted contribution obligations or fees remain outstanding' from public.repa_groups where id=target on conflict(source_kind,source_id) do update set resolved_at=null;
 else update public.organization_closure_blocks set resolved_at=now() where source_kind='group_membership_obligations' and source_id=target and resolved_at is null;end if;end $$;
create or replace function private.gm_completion_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='completed' and old.status<>'completed' and exists(select 1 from public.group_member_obligations o where o.group_id=new.id and (private.ce_state(o.id)->>'remaining_minor')::bigint>0) then raise exception 'Outstanding obligations or fees prevent group completion' using errcode='22023';end if;return new;end $$;

create function public.list_contribution_groups(target_organization uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin perform private.require_account();return (select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'status',g.status,'currency',g.currency,'timezone',(private.repa_config(g.accepted_version_id)#>>'{schedule,timezone}'),'can_collect',private.gm_can(g.id,'finance.read')) order by g.created_at desc),'[]') from public.repa_groups g join public.organizations o on o.id=g.organization_id where g.organization_id=target_organization and o.status='active' and g.accepted_version_id is not null and (private.gm_can(g.id,'finance.read') or exists(select 1 from public.group_members m where m.group_id=g.id and m.user_id=auth.uid())));end $$;
create function public.get_contribution_workspace(target uuid,filter_status text default null,page_number integer default 1,page_size integer default 25,from_date date default null,to_date date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare actor uuid:=private.require_account();g public.repa_groups;staff boolean;rows jsonb;total integer;summary jsonb;rounds jsonb;reminders jsonb;c jsonb;begin
 select * into g from public.repa_groups where id=target;staff:=coalesce(private.gm_can(target,'finance.read'),false);
 if g.id is null or g.accepted_version_id is null or not exists(select 1 from public.organizations where id=g.organization_id and status='active') or (not staff and not exists(select 1 from public.group_members where group_id=target and user_id=actor)) then raise exception 'Contribution workspace access denied' using errcode='42501';end if;
 if page_number is null or page_number not between 1 and 1000000 or page_size is null or page_size not between 1 and 100 or (filter_status is not null and filter_status not in ('upcoming','unpaid','partially_paid','paid','overdue','waived','cancelled')) or (from_date is not null and to_date is not null and from_date>to_date) then raise exception 'Invalid obligation filters' using errcode='22023';end if;
 c:=private.repa_config(g.accepted_version_id);
 with all_rows as materialized(select private.ce_state(o.id)||jsonb_build_object('member_name',p.full_name,'member_status',m.status) s from public.group_member_obligations o join public.group_members m on m.id=private.gm_obligation_owner(o.id) join public.profiles p on p.id=m.user_id where o.group_id=target and (staff or m.user_id=actor)),
 filtered as materialized(select s from all_rows where (filter_status is null or s->>'status'=filter_status) and (from_date is null or (s->>'local_due_date')::date>=from_date) and (to_date is null or (s->>'local_due_date')::date<=to_date)),
 paged as(select s from filtered order by s->>'due_at',s->>'member_name',s->>'id' limit page_size offset (page_number-1)*page_size)
 select (select coalesce(jsonb_agg(s),'[]') from paged),(select count(*) from filtered),jsonb_build_object('due_minor',coalesce(sum((s->>'due_minor')::bigint),0),'verified_minor',coalesce(sum((s->>'verified_minor')::bigint),0),'remaining_minor',coalesce(sum((s->>'remaining_minor')::bigint),0),'overdue',count(*) filter(where s->>'status'='overdue'),'paid',count(*) filter(where s->>'status'='paid'),'obligations',count(*)) into rows,total,summary from all_rows;
 if staff then select coalesce(jsonb_agg(to_jsonb(r) order by round_number),'[]') into rounds from public.contribution_rounds r where r.group_id=target and r.rules_version_id=g.accepted_version_id;
 else with own as materialized(select o.round_number,private.ce_state(o.id) s from public.group_member_obligations o where o.group_id=target and private.gm_owns(private.gm_obligation_owner(o.id))) select coalesce(jsonb_agg(jsonb_build_object('round_number',round_number,'status',s->>'status','expected_minor',s->'due_minor','verified_minor',s->'verified_minor','outstanding_minor',s->'remaining_minor','grace_ends_at',s->>'grace_ends_at','collection_ready',s->>'status'='paid','can_progress',false) order by round_number),'[]') into rounds from own;end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by scheduled_for desc),'[]') into reminders from public.contribution_reminders r where r.group_id=target and r.user_id=actor and r.status='scheduled' and exists(select 1 from public.group_member_obligations o where o.id=r.obligation_id and private.gm_owns(private.gm_obligation_owner(o.id)) and (private.ce_state(o.id)->>'remaining_minor')::bigint>0 and r.deadline_at=(private.ce_state(o.id)->>'due_at')::timestamptz);
 return jsonb_build_object('group',jsonb_build_object('id',g.id,'name',g.name,'status',g.status,'currency',g.currency,'timezone',c#>>'{schedule,timezone}','rules_version_id',g.accepted_version_id),'configuration',c,'can_collect',staff,'can_record',private.gm_can(target,'finance.record'),'can_adjust',private.authorized(g.organization_id,'groups.manage',g.id),'obligations',rows,'total',total,'summary',summary,'rounds',rounds,'reminders',reminders,'engine',case when staff then (select to_jsonb(s) from public.contribution_group_state s where s.group_id=target) else null end,'last_job_runs',case when staff then (select coalesce(jsonb_agg(j),'[]') from (select job_kind,max(completed_at) completed_at from public.contribution_job_runs where group_id=target group by job_kind) j) else '[]' end);end $$;
create function public.get_contribution_obligation(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform private.require_account();if private.ce_can_read(target) is distinct from true then raise exception 'Obligation access denied' using errcode='42501';end if;
 return jsonb_build_object('obligation',private.ce_state(target),'payments',(select coalesce(jsonb_agg(p order by p->>'verified_at'),'[]') from (
 select jsonb_build_object('id',f.id,'principal_minor',f.amount_minor,'fee_minor',coalesce(p.fee_minor,0),'payment_method',coalesce(p.payment_method,'verified_history'),'external_reference',f.external_reference,'evidence_note',f.evidence_note,'verified_at',f.recorded_at,'verified_by',f.recorded_by) p from public.group_member_financial_events f left join public.contribution_receipts p on p.principal_event_id=f.id where f.obligation_id=target and f.kind='contribution_credit'
 union all select jsonb_build_object('id',p.id,'principal_minor',0,'fee_minor',p.fee_minor,'payment_method',p.payment_method,'external_reference',p.external_reference,'evidence_note',p.evidence_note,'verified_at',p.verified_at,'verified_by',p.verified_by) from public.contribution_receipts p where p.obligation_id=target and p.principal_event_id is null) rows),
 'adjustments',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at),'[]') from public.contribution_adjustments a where a.obligation_id=target),'status_history',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.contribution_status_events e where e.obligation_id=target));end $$;
create function public.refresh_contribution_deadlines(target uuid) returns integer language plpgsql security definer set search_path='' as $$begin perform private.gm_require(target,'finance.read');return private.ce_run_group(target);end $$;
create function public.dismiss_contribution_reminder(target uuid) returns void language plpgsql security definer set search_path='' as $$begin perform private.require_account();update public.contribution_reminders set status='dismissed' where id=target and user_id=auth.uid() and status='scheduled';if not found then raise exception 'Reminder unavailable' using errcode='42501';end if;end $$;

alter table public.contribution_adjustments add foreign key(group_id,obligation_id) references public.group_member_obligations(group_id,id);
alter table public.contribution_receipts add foreign key(group_id,obligation_id) references public.group_member_obligations(group_id,id),add foreign key(group_id,member_id) references public.group_members(group_id,id);
-- Freeze any accrued reviewed fee before a group leaves its running states.
create function private.ce_group_exit() returns trigger language plpgsql security definer set search_path='' as $$declare o record;begin if old.status in ('active','paused') and new.status not in ('active','paused') then for o in select id from public.group_member_obligations where group_id=old.id loop perform private.ce_assess(o.id);end loop;end if;return new;end $$;
create trigger contribution_group_fee_guard before update of status on public.repa_groups for each row execute function private.ce_group_exit();
-- RLS, write denial and immutable audit records. Projection/job tables are backend-maintained only.
do $$declare t text;begin
 for t in select unnest(array['contribution_rule_definitions','contribution_obligation_terms','contribution_adjustments','contribution_receipts','contribution_obligation_status','contribution_status_events','contribution_rounds','contribution_group_state','contribution_job_runs','contribution_reminders']) loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);end loop;
 for t in select unnest(array['contribution_rule_definitions','contribution_obligation_terms','contribution_adjustments','contribution_receipts','contribution_status_events']) loop execute format('create trigger %I before update or delete on public.%I for each row execute function private.repa_immutable()',t||'_immutable',t);end loop;end $$;
create policy contribution_rules_read on public.contribution_rule_definitions for select to authenticated using(private.repa_version_read(version_id));
create policy contribution_terms_read on public.contribution_obligation_terms for select to authenticated using(private.ce_can_read(obligation_id));
create policy contribution_adjustments_read on public.contribution_adjustments for select to authenticated using(private.ce_can_read(obligation_id));
create policy contribution_receipts_read on public.contribution_receipts for select to authenticated using(private.ce_can_read(obligation_id));
create policy contribution_status_read on public.contribution_obligation_status for select to authenticated using(private.ce_can_read(obligation_id));
create policy contribution_history_read on public.contribution_status_events for select to authenticated using(private.ce_can_read(obligation_id));
create policy contribution_rounds_read on public.contribution_rounds for select to authenticated using(private.gm_can(group_id,'finance.read'));
create policy contribution_engine_read on public.contribution_group_state for select to authenticated using(private.gm_can(group_id,'finance.read'));
create policy contribution_jobs_read on public.contribution_job_runs for select to authenticated using(private.gm_can(group_id,'finance.read'));
create policy contribution_reminders_read on public.contribution_reminders for select to authenticated using(user_id=auth.uid() and private.ce_can_read(obligation_id));
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'ce_%' or p.proname like 'phase5_%') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['list_contribution_groups','get_contribution_workspace','get_contribution_obligation','record_verified_contribution','adjust_contribution_obligation','refresh_contribution_deadlines','dismiss_contribution_reminder','record_group_member_financial_event']) loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;end $$;
grant execute on function private.ce_can_read(uuid) to authenticated;
-- Named schedule is idempotent. Unsupported local runtimes retain a callable SQL runner for tests.
do $$begin if exists(select 1 from pg_available_extensions where name='pg_cron') then
 create extension if not exists pg_cron;
 perform cron.schedule('repacircle-contribution-deadlines','* * * * *','select private.ce_tick();');
 else raise notice 'pg_cron unavailable in this runtime; contribution jobs can be exercised with private.ce_tick() by the database owner';end if;end $$;
commit;
