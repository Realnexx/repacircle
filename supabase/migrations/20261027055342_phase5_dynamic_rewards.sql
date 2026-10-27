begin;
create table public.reward_categories (
 id uuid primary key default gen_random_uuid(),organization_id uuid references public.organizations(id),name text not null check(char_length(btrim(name)) between 2 and 100),description text not null default '' check(char_length(description)<=2000),
 active boolean not null default true,revision integer not null default 1,created_by uuid references auth.users(id),created_at timestamptz not null default now()
);
create unique index reward_categories_name_unique on public.reward_categories(coalesce(organization_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name));
create index reward_categories_org_idx on public.reward_categories(organization_id,active);
create table public.reward_templates (
 id uuid primary key default gen_random_uuid(),organization_id uuid references public.organizations(id),name text not null check(char_length(btrim(name)) between 2 and 150),description text not null default '',
 category_id uuid references public.reward_categories(id),kind text not null check(kind in ('cash','physical_product','digital_product','service','mixed','custom')),defaults jsonb not null,
 created_by uuid references auth.users(id),created_at timestamptz not null default now()
);
create index reward_templates_org_idx on public.reward_templates(organization_id,created_at desc);
create table public.reward_items (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),name text not null,status text not null check(status in ('draft','published','archived')),
 current_version_id uuid,revision integer not null default 0,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index reward_items_org_idx on public.reward_items(organization_id,status,updated_at desc);
create table public.reward_item_versions (
 id uuid primary key default gen_random_uuid(),item_id uuid not null references public.reward_items(id),version_number integer not null,published boolean not null,
 name text not null,kind text not null check(kind in ('cash','physical_product','digital_product','service','mixed','custom')),
 category_id uuid references public.reward_categories(id),category_name text not null,description text not null,brand text not null,model text not null,sku text not null,
 currency text not null check(currency in ('PHP','USD','EUR')),estimated_unit_minor bigint not null check(estimated_unit_minor between 0 and 1000000000),actual_unit_minor bigint check(actual_unit_minor between 0 and 1000000000),
 quantity integer not null check(quantity between 1 and 1000),supplier text not null,warranty text not null,delivery_method text not null,cash_transfer_method text not null,
 shipping_fee_minor bigint not null check(shipping_fee_minor between 0 and 1000000000),expenses jsonb not null,attribute_values jsonb not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(item_id,version_number),unique(item_id,id)
);
alter table public.reward_items add foreign key(id,current_version_id) references public.reward_item_versions(item_id,id);
create table public.reward_attributes (
 version_id uuid not null references public.reward_item_versions(id),field_key text not null check(field_key ~ '^custom_[a-z][a-z0-9_]{0,39}$'),label text not null,field_type text not null,required boolean not null,
 min_value numeric,max_value numeric,options jsonb,condition jsonb,children jsonb,applies_to text[] not null check(cardinality(applies_to)>0 and applies_to <@ array['cash','physical_product','digital_product','service','mixed','custom']::text[]),position integer not null,
 primary key(version_id,field_key)
);
create table public.reward_images (
 version_id uuid not null references public.reward_item_versions(id),position integer not null,storage_path text not null,alt_text text not null,primary key(version_id,position),unique(version_id,storage_path)
);
create index reward_images_path_idx on public.reward_images(storage_path);
create table public.reward_item_components (
 parent_version_id uuid not null references public.reward_item_versions(id),component_version_id uuid not null references public.reward_item_versions(id),quantity integer not null check(quantity between 1 and 100),position integer not null,
 primary key(parent_version_id,component_version_id),check(parent_version_id<>component_version_id)
);
create index reward_components_child_idx on public.reward_item_components(component_version_id,parent_version_id);
create table public.reward_plans (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.repa_groups(id),name text not null check(char_length(btrim(name)) between 2 and 150),currency text not null check(currency in ('PHP','USD','EUR')),
 configuration_context jsonb not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index reward_plans_group_idx on public.reward_plans(group_id,created_at desc);
create table public.reward_distribution_rules (
 plan_id uuid not null references public.reward_plans(id),position integer not null,item_version_id uuid not null references public.reward_item_versions(id),scope text not null check(scope in ('each_payout','round')),
 round_number integer check(round_number between 1 and 1000),quantity integer not null check(quantity between 1 and 1000),primary key(plan_id,position),
 check((scope='each_payout' and round_number is null) or (scope='round' and round_number is not null))
);
create unique index reward_distribution_line_unique on public.reward_distribution_rules(plan_id,item_version_id,scope,coalesce(round_number,0));
create index reward_distribution_version_idx on public.reward_distribution_rules(item_version_id,plan_id);
alter table public.group_rules add column reward_plan_id uuid references public.reward_plans(id);
create index group_rules_reward_plan_idx on public.group_rules(reward_plan_id) where reward_plan_id is not null;

create function private.reward_manage(org uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_account(true);begin if not private.authorized(org,'groups.manage') then raise exception 'Organizer access required for the reward catalog' using errcode='42501';end if;return actor;end $$;
create function private.reward_plan_read(target uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.reward_plans p where p.id=target and private.repa_can_read(p.group_id));$$;
create function private.reward_version_read(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.active_user() and exists(select 1 from public.reward_item_versions v join public.reward_items i on i.id=v.item_id where v.id=target and (
 private.authorized(i.organization_id,'groups.manage') or exists(select 1 from public.reward_distribution_rules d where d.item_version_id=v.id and private.reward_plan_read(d.plan_id)) or
 exists(select 1 from public.reward_item_components c join public.reward_distribution_rules d on d.item_version_id=c.parent_version_id where c.component_version_id=v.id and private.reward_plan_read(d.plan_id))));$$;
create function private.reward_item_config(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',v.name,'kind',v.kind,'category_id',v.category_id,'description',v.description,'brand',v.brand,'model',v.model,'sku',v.sku,'currency',v.currency,'estimated_unit_minor',v.estimated_unit_minor,'actual_unit_minor',v.actual_unit_minor,'quantity',v.quantity,'supplier',v.supplier,'warranty',v.warranty,'delivery_method',v.delivery_method,'cash_transfer_method',v.cash_transfer_method,'shipping_fee_minor',v.shipping_fee_minor,'expenses',v.expenses,'values',v.attribute_values,
 'attributes',(select coalesce(jsonb_agg(jsonb_build_object('definition',jsonb_strip_nulls(jsonb_build_object('key',a.field_key,'label',a.label,'category','reward','type',a.field_type,'required',a.required,'min',a.min_value,'max',a.max_value,'options',a.options,'condition',a.condition,'children',a.children)),'applies_to',a.applies_to) order by a.position),'[]') from public.reward_attributes a where a.version_id=target),
 'images',(select coalesce(jsonb_agg(jsonb_build_object('path',i.storage_path,'alt',i.alt_text) order by i.position),'[]') from public.reward_images i where i.version_id=target),
 'components',(select coalesce(jsonb_agg(jsonb_build_object('version_id',c.component_version_id,'quantity',c.quantity) order by c.position),'[]') from public.reward_item_components c where c.parent_version_id=target)) from public.reward_item_versions v where v.id=target;$$;

create function private.reward_price(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare v public.reward_item_versions;estimate bigint;actual bigint;required bigint;extra bigint;child_delivery bigint:=0;child_extra bigint:=0;units bigint;physical bigint;child record;p jsonb;mult bigint;begin
 select * into v from public.reward_item_versions where id=target;
 if v.id is null then raise exception 'Reward version unavailable' using errcode='22023';end if;
 units:=v.quantity;physical:=case when v.kind='physical_product' then v.quantity else 0 end;estimate:=v.estimated_unit_minor*v.quantity;actual:=v.actual_unit_minor*v.quantity;required:=greatest(estimate,coalesce(actual,0));
 if v.kind='mixed' then estimate:=0;actual:=0;required:=0;units:=0;physical:=0;
 for child in select c.*,x.kind from public.reward_item_components c join public.reward_item_versions x on x.id=c.component_version_id where c.parent_version_id=target loop
 if child.kind='mixed' then raise exception 'Nested mixed bundles are not supported' using errcode='22023';end if;
 p:=private.reward_price(child.component_version_id);mult:=child.quantity::bigint*v.quantity;
 child_delivery:=child_delivery+(p->>'delivery_minor')::bigint*mult;child_extra:=child_extra+(p->>'additional_minor')::bigint*mult;units:=units+(p->>'unit_quantity')::bigint*mult;physical:=physical+(p->>'physical_quantity')::bigint*mult;estimate:=estimate+(p->>'estimated_minor')::bigint*mult;required:=required+(p->>'required_minor')::bigint*mult;
 if p->>'actual_minor' is null then actual:=null;elsif actual is not null then actual:=actual+(p->>'actual_minor')::bigint*mult;end if;end loop;end if;
 select coalesce(sum((e->>'amount_minor')::bigint),0) into extra from jsonb_array_elements(v.expenses) e;
 estimate:=estimate+v.shipping_fee_minor+extra;required:=required+v.shipping_fee_minor+extra;if actual is not null then actual:=actual+v.shipping_fee_minor+extra;end if;
 if required>1000000000000 then raise exception 'Reward bundle exceeds the exact supported cost limit' using errcode='22023';end if;
 return jsonb_build_object('estimated_minor',estimate::text,'actual_minor',actual::text,'required_minor',required::text,'delivery_minor',(v.shipping_fee_minor+child_delivery)::text,'additional_minor',(extra+child_extra)::text,'unit_quantity',units::text,'physical_quantity',physical::text,'funding_difference_minor',(actual-estimate)::text,'errors','[]'::jsonb);end $$;

create function private.reward_components_config(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('version_id',c.component_version_id,'item_id',v.item_id,'name',v.name,'kind',v.kind,'quantity',c.quantity,'configuration',private.reward_item_config(v.id),'pricing',private.reward_price(v.id)) order by c.position),'[]') from public.reward_item_components c join public.reward_item_versions v on v.id=c.component_version_id where c.parent_version_id=target;$$;

do $$begin execute replace(replace(pg_get_functiondef('private.repa_upload_errors(jsonb,jsonb,uuid)'::regprocedure),'private.repa_upload_errors','private.reward_upload_errors'),'repa-uploads','reward-media');end $$;
create function private.reward_validate(config jsonb,org uuid,publishing boolean) returns void language plpgsql security definer set search_path='' as $$
 declare key text;v jsonb;a jsonb;defs jsonb:='[]';active_defs jsonb:='[]';errors jsonb;path text;component jsonb;child public.reward_item_versions;money_key text;
 begin
 if jsonb_typeof(config) is distinct from 'object' or not(config ?& array['name','kind','category_id','description','brand','model','sku','currency','estimated_unit_minor','actual_unit_minor','quantity','supplier','warranty','delivery_method','cash_transfer_method','shipping_fee_minor','expenses','attributes','values','images','components']) or config-array['name','kind','category_id','description','brand','model','sku','currency','estimated_unit_minor','actual_unit_minor','quantity','supplier','warranty','delivery_method','cash_transfer_method','shipping_fee_minor','expenses','attributes','values','images','components']<>'{}' then raise exception 'Invalid reward configuration fields' using errcode='22023';end if;
 for key in select unnest(array['name','kind','description','brand','model','sku','currency','supplier','warranty','delivery_method','cash_transfer_method']) loop if jsonb_typeof(config->key) is distinct from 'string' or char_length(config->>key)>(case key when 'name' then 150 when 'brand' then 120 when 'model' then 120 when 'sku' then 100 when 'supplier' then 250 when 'warranty' then 2000 when 'delivery_method' then 1000 when 'cash_transfer_method' then 200 else 4000 end) then raise exception 'Invalid reward text field %',key using errcode='22023';end if;end loop;
 if char_length(btrim(config->>'name')) not between 2 and 150 or config->>'kind' not in ('cash','physical_product','digital_product','service','mixed','custom') or config->>'currency' not in ('PHP','USD','EUR') then raise exception 'Reward name, type and currency are required' using errcode='22023';end if;
 for money_key in select unnest(array['estimated_unit_minor','actual_unit_minor','shipping_fee_minor','quantity']) loop
 v:=config->money_key;if money_key='actual_unit_minor' and v='null'::jsonb then continue;end if;
 if jsonb_typeof(v) is distinct from 'number' or (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) or (v#>>'{}')::numeric<0 or (v#>>'{}')::numeric>1000000000 then raise exception 'Reward prices must be bounded integer minor units' using errcode='22023';end if;end loop;
 if (config->>'quantity')::integer not between 1 and 1000 then raise exception 'Invalid reward quantity' using errcode='22023';end if;
 if config->'category_id'<>'null'::jsonb then
 if not exists(select 1 from public.reward_categories c where c.id=(config->>'category_id')::uuid and (c.organization_id is null or c.organization_id=org) and (not publishing or c.active)) then raise exception 'Choose an available category in this organization' using errcode='22023';end if;
 elsif publishing then raise exception 'Reward category is required before publication' using errcode='22023';end if;
 for key in select unnest(array['expenses','attributes','images','components']) loop if jsonb_typeof(config->key) is distinct from 'array' then raise exception 'Invalid reward list %',key using errcode='22023';end if;end loop;
 if jsonb_array_length(config->'expenses')>20 or jsonb_array_length(config->'attributes')>30 or jsonb_array_length(config->'images')>10 or jsonb_array_length(config->'components')>20 or jsonb_typeof(config->'values') is distinct from 'object' then raise exception 'Reward configuration exceeds supported limits' using errcode='22023';end if;
 for v in select * from jsonb_array_elements(config->'expenses') loop
 if v-array['label','amount_minor']<>'{}' or jsonb_typeof(v->'label') is distinct from 'string' or char_length(btrim(v->>'label')) not between 1 and 150 or jsonb_typeof(v->'amount_minor') is distinct from 'number' or (v->>'amount_minor')::numeric not between 0 and 1000000000 or (v->>'amount_minor')::numeric<>trunc((v->>'amount_minor')::numeric) then raise exception 'Invalid additional reward expense' using errcode='22023';end if;end loop;
 for a in select * from jsonb_array_elements(config->'attributes') loop
 if a-array['definition','applies_to']<>'{}' or jsonb_typeof(a->'definition') is distinct from 'object' or jsonb_typeof(a->'applies_to') is distinct from 'array' or jsonb_array_length(a->'applies_to') not between 1 and 6 or exists(select 1 from jsonb_array_elements(a->'applies_to') t where jsonb_typeof(t) is distinct from 'string' or t#>>'{}' not in ('cash','physical_product','digital_product','service','mixed','custom')) or (select count(distinct value) from jsonb_array_elements(a->'applies_to'))<>jsonb_array_length(a->'applies_to') or a#>>'{definition,category}' is distinct from 'reward' or exists(select 1 from jsonb_array_elements(coalesce(a#>'{definition,children}','[]')) ch where ch->>'category' is distinct from 'reward') then raise exception 'Invalid reward attribute definition or visibility' using errcode='22023';end if;
 defs:=defs||jsonb_build_array(a->'definition');if a->'applies_to' ? (config->>'kind') then active_defs:=active_defs||jsonb_build_array(a->'definition');end if;end loop;
 perform private.repa_validate_fields(defs);
 if exists(select keys.attribute_key from (select value->>'key' attribute_key from jsonb_array_elements(defs) union all select ch->>'key' from jsonb_array_elements(defs) d cross join jsonb_array_elements(coalesce(d->'children','[]')) ch) keys group by keys.attribute_key having count(*)>1) then raise exception 'Reward attribute keys must be unique at every level' using errcode='22023';end if;
 errors:=private.repa_dynamic_errors(defs,config->'values',false)||private.repa_dynamic_errors(active_defs,(select coalesce(jsonb_object_agg(vals.key,vals.value),'{}') from jsonb_each(config->'values') vals where vals.key in(select d->>'key' from jsonb_array_elements(active_defs) d)),publishing);
 if publishing then errors:=errors||private.reward_upload_errors(defs,config->'values',org);end if;
 if jsonb_array_length(errors)>0 then raise exception 'Reward attributes invalid: %',errors using errcode='22023';end if;
 for v in select * from jsonb_array_elements(config->'images') loop
 path:=v->>'path';if v-array['path','alt']<>'{}' or path is null or path !~ ('^'||org::text||'/[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$') or coalesce(char_length(btrim(v->>'alt')),0) not between 1 and 200 then raise exception 'Invalid reward gallery image' using errcode='22023';end if;
 if publishing and not exists(select 1 from storage.objects where bucket_id='reward-media' and name=path) then raise exception 'Reward image upload is missing' using errcode='22023';end if;end loop;
 if config->>'kind'<>'mixed' and jsonb_array_length(config->'components')<>0 then raise exception 'Only mixed rewards can contain components' using errcode='22023';end if;
 if config->>'kind'='mixed' and publishing and jsonb_array_length(config->'components')<2 then raise exception 'Mixed rewards require at least two published components' using errcode='22023';end if;
 if config->>'kind'='mixed' and ((config->>'estimated_unit_minor')::bigint<>0 or config->'actual_unit_minor'<>'null'::jsonb) then raise exception 'Mixed reward prices are derived from immutable component versions' using errcode='22023';end if;
 for component in select * from jsonb_array_elements(config->'components') loop
 if component-array['version_id','quantity']<>'{}' or jsonb_typeof(component->'quantity') is distinct from 'number' or (component->>'quantity')::numeric<>trunc((component->>'quantity')::numeric) or (component->>'quantity')::numeric not between 1 and 100 then raise exception 'Invalid mixed reward component' using errcode='22023';end if;
 select v0.* into child from public.reward_item_versions v0 join public.reward_items i on i.id=v0.item_id where v0.id=(component->>'version_id')::uuid and i.organization_id=org and v0.published and i.status='published';
 if child.id is null or child.kind='mixed' or child.currency<>config->>'currency' then raise exception 'Components must be published non-mixed rewards in the same organization and currency' using errcode='22023';end if;end loop;
 if publishing then
 if config->>'kind'<>'mixed' and (config->>'estimated_unit_minor')::bigint<=0 then raise exception 'Positive estimated reward value or cash amount required' using errcode='22023';end if;
 if config->>'kind'='cash' then
 if btrim(config->>'cash_transfer_method')='' or (config->>'shipping_fee_minor')::bigint<>0 or (config->'actual_unit_minor'<>'null'::jsonb and config->'actual_unit_minor'<>config->'estimated_unit_minor') then raise exception 'Disclose the cash transfer method, matching payout value and zero shipping fee' using errcode='22023';end if;
 elsif btrim(config->>'delivery_method')='' then raise exception 'Disclose reward delivery or fulfillment method' using errcode='22023';end if;
 end if;
 end $$;

create function public.save_reward_category(target_organization uuid,category_id uuid,expected_revision integer,new_name text,new_description text,is_active boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.reward_manage(target_organization);id uuid;begin
 if expected_revision is null or is_active is null or coalesce(char_length(btrim(new_name)),0) not between 2 and 100 or new_description is null or char_length(new_description)>2000 then raise exception 'Valid category details and revision required' using errcode='22023';end if;
 if category_id is null then if expected_revision<>0 then raise exception 'Invalid initial revision' using errcode='40001';end if;insert into public.reward_categories(organization_id,name,description,active,created_by) values(target_organization,btrim(new_name),btrim(new_description),is_active,actor) returning reward_categories.id into id;
 else update public.reward_categories c set name=btrim(new_name),description=btrim(new_description),active=is_active,revision=revision+1 where c.id=category_id and c.organization_id=target_organization and c.revision=expected_revision returning c.id into id;if id is null then raise exception 'Category changed, is global, or is unavailable' using errcode='40001';end if;end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(target_organization,actor,'reward.category_saved',id);return id;end $$;

create function public.save_reward_item(target_organization uuid,item_id uuid,expected_revision integer,configuration jsonb,publish boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.reward_manage(target_organization);i public.reward_items;vid uuid;entry jsonb;pos integer;category_label text;gid uuid;begin
 if expected_revision is null or expected_revision<0 or publish is null then raise exception 'Valid revision and publication choice required' using errcode='22023';end if;
 perform private.reward_validate(configuration,target_organization,publish);
 if item_id is null then
 if expected_revision<>0 then raise exception 'Stale reward revision' using errcode='40001';end if;
 insert into public.reward_items(organization_id,name,status,created_by) values(target_organization,btrim(configuration->>'name'),'draft',actor) returning id into gid;
 else gid:=item_id;end if;
 select * into i from public.reward_items where id=gid for update;
 if i.id is null or i.organization_id<>target_organization then raise exception 'Reward unavailable' using errcode='42501';end if;
 if i.revision<>expected_revision then raise exception 'Reward changed in another session; reload before saving' using errcode='40001';end if;
 select name into category_label from public.reward_categories where id=(configuration->>'category_id')::uuid;
 insert into public.reward_item_versions(item_id,version_number,published,name,kind,category_id,category_name,description,brand,model,sku,currency,estimated_unit_minor,actual_unit_minor,quantity,supplier,warranty,delivery_method,cash_transfer_method,shipping_fee_minor,expenses,attribute_values,created_by)
 values(gid,i.revision+1,publish,btrim(configuration->>'name'),configuration->>'kind',(configuration->>'category_id')::uuid,coalesce(category_label,''),configuration->>'description',configuration->>'brand',configuration->>'model',configuration->>'sku',configuration->>'currency',(configuration->>'estimated_unit_minor')::bigint,(configuration->>'actual_unit_minor')::bigint,(configuration->>'quantity')::integer,configuration->>'supplier',configuration->>'warranty',configuration->>'delivery_method',configuration->>'cash_transfer_method',(configuration->>'shipping_fee_minor')::bigint,configuration->'expenses',configuration->'values',actor) returning id into vid;
 pos:=0;for entry in select * from jsonb_array_elements(configuration->'attributes') loop
 insert into public.reward_attributes(version_id,field_key,label,field_type,required,min_value,max_value,options,condition,children,applies_to,position)
 values(vid,entry#>>'{definition,key}',entry#>>'{definition,label}',entry#>>'{definition,type}',(entry#>>'{definition,required}')::boolean,(entry#>>'{definition,min}')::numeric,(entry#>>'{definition,max}')::numeric,entry#>'{definition,options}',entry#>'{definition,condition}',entry#>'{definition,children}',array(select jsonb_array_elements_text(entry->'applies_to')),pos);pos:=pos+1;end loop;
 pos:=0;for entry in select * from jsonb_array_elements(configuration->'images') loop insert into public.reward_images(version_id,position,storage_path,alt_text) values(vid,pos,entry->>'path',entry->>'alt');pos:=pos+1;end loop;
 pos:=0;for entry in select * from jsonb_array_elements(configuration->'components') loop insert into public.reward_item_components(parent_version_id,component_version_id,quantity,position) values(vid,(entry->>'version_id')::uuid,(entry->>'quantity')::integer,pos);pos:=pos+1;end loop;
 perform private.reward_price(vid);
 update public.reward_items set current_version_id=vid,revision=revision+1,name=btrim(configuration->>'name'),status=case when publish then 'published' else 'draft' end,updated_at=now() where id=gid;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id,details) values(target_organization,actor,'reward.version_saved',gid,jsonb_build_object('version_id',vid,'published',publish));return gid;end $$;

create function public.archive_reward_item(target uuid,expected_revision integer) returns void language plpgsql security definer set search_path='' as $$declare org uuid;begin
 select organization_id into org from public.reward_items where id=target;perform private.reward_manage(org);
 update public.reward_items set status='archived',revision=revision+1,updated_at=now() where id=target and revision=expected_revision;if not found then raise exception 'Reward revision changed; reload before archiving' using errcode='40001';end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_id) values(org,auth.uid(),'reward.archived',target);end $$;
create function public.create_reward_template(target_item uuid,template_name text,template_description text) returns uuid language plpgsql security definer set search_path='' as $$
 declare i public.reward_items;c jsonb;id uuid;actor uuid;begin select * into i from public.reward_items where reward_items.id=target_item;actor:=private.reward_manage(i.organization_id);
 if i.status<>'published' or coalesce(char_length(btrim(template_name)),0) not between 2 and 150 or template_description is null or char_length(template_description)>2000 then raise exception 'Choose a published reward and valid template name' using errcode='22023';end if;
 c:=jsonb_set(private.reward_item_config(i.current_version_id),'{actual_unit_minor}','null');
 insert into public.reward_templates(organization_id,name,description,category_id,kind,defaults,created_by) values(i.organization_id,btrim(template_name),template_description,(c->>'category_id')::uuid,c->>'kind',c,actor) returning reward_templates.id into id;return id;end $$;

create function public.get_reward_catalog(target_organization uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform private.reward_manage(target_organization);
 return jsonb_build_object('categories',(select coalesce(jsonb_agg(c order by c.name),'[]') from public.reward_categories c where c.organization_id is null or c.organization_id=target_organization),
 'templates',(select coalesce(jsonb_agg(t order by t.created_at,t.name),'[]') from public.reward_templates t where t.organization_id is null or t.organization_id=target_organization),
 'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',v.name,'kind',v.kind,'category_id',v.category_id,'category_name',v.category_name,'currency',v.currency,'status',i.status,'revision',i.revision,'current_version_id',i.current_version_id,'pricing',private.reward_price(v.id),'configuration',private.reward_item_config(v.id),'components',private.reward_components_config(v.id)) order by i.updated_at desc),'[]') from public.reward_items i join public.reward_item_versions v on v.id=i.current_version_id where i.organization_id=target_organization));end $$;
create function public.get_reward_item(target uuid,version_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare i public.reward_items;vid uuid;manager boolean;begin select * into i from public.reward_items where id=target;vid:=coalesce(version_id,i.current_version_id);
 if not exists(select 1 from public.reward_item_versions where id=vid and item_id=target) or private.reward_version_read(vid) is distinct from true then raise exception 'Reward version access denied' using errcode='42501';end if;
 manager:=private.authorized(i.organization_id,'groups.manage');
 return jsonb_build_object('item',case when manager then to_jsonb(i) else jsonb_build_object('id',i.id,'organization_id',i.organization_id,'name',private.reward_item_config(vid)->>'name','status','published','revision',(select version_number from public.reward_item_versions where id=vid),'current_version_id',vid) end,'version_id',vid,'configuration',private.reward_item_config(vid),'pricing',private.reward_price(vid),'can_manage',manager,
 'category_name',(select category_name from public.reward_item_versions where id=vid),
 'versions',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'version_number',v.version_number,'published',v.published,'created_at',v.created_at,'created_by',v.created_by) order by v.version_number desc),'[]') from public.reward_item_versions v where v.item_id=target and manager),
 'components',(select coalesce(jsonb_agg(jsonb_build_object('version_id',c.component_version_id,'item_id',v.item_id,'name',v.name,'kind',v.kind,'quantity',c.quantity,'configuration',private.reward_item_config(v.id),'pricing',private.reward_price(v.id)) order by c.position),'[]') from public.reward_item_components c join public.reward_item_versions v on v.id=c.component_version_id where c.parent_version_id=vid));end $$;

create function private.reward_context(c jsonb) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('mechanism',c->>'mechanism','currency',c#>>'{basic,currency}','member_count',c#>'{contribution,member_count}','round_count',c#>'{contribution,round_count}','distribution',c#>'{distribution,rule}','rotation_order',c#>'{distribution,rotation_order}','weights',case when c#>>'{distribution,rule}'='fixed_share' then c#>'{distribution,fixed_shares}' when c#>>'{distribution,rule}'='contribution_based' and c#>>'{contribution,policy}'='configurable' then c#>'{contribution,member_amounts}' else '[]'::jsonb end);$$;
create function private.reward_split(pool bigint,weights jsonb) returns jsonb language sql immutable set search_path='' as $$
 with w as(select value::numeric weight,ordinality slot from jsonb_array_elements_text(weights) with ordinality),
 a as(select slot,trunc(pool::numeric*weight/nullif(sum(weight) over(),0)) base,mod(pool::numeric*weight,nullif(sum(weight) over(),0)) remainder from w),
 b as(select *,row_number() over(order by remainder desc,slot) rank,pool-sum(base) over() remaining from a)
 select coalesce(jsonb_agg((base+case when rank<=remaining then 1 else 0 end)::bigint::text order by slot),'[]') from b;$$;
create function private.reward_pooled_allocations(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare ctx jsonb;n integer;slot integer;weights jsonb:='[]';values_by_slot numeric[];units numeric[];line record;cost jsonb;parts jsonb;counts jsonb;result jsonb:='[]';weight bigint;begin
 select configuration_context into ctx from public.reward_plans where id=target;n:=(ctx->>'member_count')::integer;
 values_by_slot:=array_fill(0::numeric,array[n]);units:=array_fill(0::numeric,array[n]);
 for slot in 1..n loop
 if ctx->>'distribution'='fixed_share' then select (v->>'basis_points')::bigint into weight from jsonb_array_elements(ctx->'weights') v where (v->>'slot')::integer=slot;
 elsif ctx->>'distribution'='contribution_based' and jsonb_array_length(ctx->'weights')>0 then select (v->>'amount_minor')::bigint into weight from jsonb_array_elements(ctx->'weights') v where (v->>'slot')::integer=slot;
 else weight:=1;end if;
 if coalesce(weight,0)<=0 then return '[]';end if;weights:=weights||jsonb_build_array(weight);end loop;
 for line in select d.*,v.kind from public.reward_distribution_rules d join public.reward_item_versions v on v.id=d.item_version_id where d.plan_id=target loop
 cost:=private.reward_price(line.item_version_id);
 if line.kind='cash' then parts:=private.reward_split((cost->>'required_minor')::bigint*line.quantity*n,weights);
 else counts:=private.reward_split(line.quantity::bigint*n,weights);end if;
 for slot in 1..n loop
 if line.kind='cash' then values_by_slot[slot]:=values_by_slot[slot]+(parts->>(slot-1))::numeric;
 else values_by_slot[slot]:=values_by_slot[slot]+(counts->>(slot-1))::numeric*(cost->>'required_minor')::numeric;units[slot]:=units[slot]+(counts->>(slot-1))::numeric*(cost->>'unit_quantity')::numeric;end if;end loop;end loop;
 for slot in 1..n loop result:=result||jsonb_build_array(jsonb_build_object('round',(ctx->>'round_count')::integer,'slot',slot,'value_minor',values_by_slot[slot]::bigint::text,'units',units[slot]::bigint::text));end loop;return result;end $$;
create function private.reward_plan_cost(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare p public.reward_plans;r integer;rounds integer;n integer;payouts integer;line record;cost jsonb;required numeric:=0;estimate numeric:=0;actual numeric:=0;delivery numeric:=0;additional numeric:=0;qty numeric:=0;product_qty numeric:=0;rr numeric;re numeric;ra numeric;rq numeric;rows jsonb:='[]';lines jsonb;errors jsonb:='[]';multiplicity numeric;begin
 select * into p from public.reward_plans where id=target;if p.id is null then raise exception 'Reward plan unavailable' using errcode='22023';end if;
 rounds:=(p.configuration_context->>'round_count')::integer;n:=(p.configuration_context->>'member_count')::integer;
 for r in 1..rounds loop
 payouts:=case when p.configuration_context->>'mechanism'='pooled_savings' then case when r=rounds then n else 0 end else 1 end;
 rr:=0;re:=0;ra:=0;rq:=0;
 for line in select d.*,v.quantity as unit_quantity from public.reward_distribution_rules d join public.reward_item_versions v on v.id=d.item_version_id where d.plan_id=target and (d.scope='each_payout' or d.round_number=r) and payouts>0 loop
 cost:=private.reward_price(line.item_version_id);multiplicity:=line.quantity::numeric*payouts;
 rr:=rr+(cost->>'required_minor')::numeric*multiplicity;re:=re+(cost->>'estimated_minor')::numeric*multiplicity;rq:=rq+(cost->>'unit_quantity')::numeric*multiplicity;product_qty:=product_qty+(cost->>'physical_quantity')::numeric*multiplicity;
 if cost->>'actual_minor' is null then ra:=null;elsif ra is not null then ra:=ra+(cost->>'actual_minor')::numeric*multiplicity;end if;
 delivery:=delivery+(cost->>'delivery_minor')::numeric*multiplicity;additional:=additional+(cost->>'additional_minor')::numeric*multiplicity;
 end loop;
 if payouts>0 and rr<=0 then errors:=errors||jsonb_build_array('Round '||r||' has no funded reward allocation.');end if;
 required:=required+rr;estimate:=estimate+re;qty:=qty+rq;if ra is null then actual:=null;elsif actual is not null then actual:=actual+ra;end if;
 rows:=rows||jsonb_build_array(jsonb_build_object('round',r,'required_minor',rr::text,'estimated_minor',re::text,'actual_minor',ra::text,'quantity',rq::text,'payout_count',payouts));end loop;
 if p.configuration_context->>'mechanism'='pooled_savings' and (jsonb_array_length(private.reward_pooled_allocations(target))<>n or exists(select 1 from jsonb_array_elements(private.reward_pooled_allocations(target)) a where (a->>'value_minor')::numeric<=0)) then errors:=errors||'["Every pooled recipient must receive a positive reward allocation. Adjust quantities or shares."]';end if;
 if required>1000000000000000 then errors:=errors||'["Total reward funding exceeds the exact supported plan limit."]';end if;
 select coalesce(jsonb_agg(jsonb_build_object('version_id',d.item_version_id,'item_id',v.item_id,'name',v.name,'kind',v.kind,'scope',d.scope,'round_number',d.round_number,'quantity',d.quantity,'configuration',private.reward_item_config(v.id),'pricing',private.reward_price(v.id),'components',private.reward_components_config(v.id)) order by d.position),'[]') into lines from public.reward_distribution_rules d join public.reward_item_versions v on v.id=d.item_version_id where d.plan_id=target;
 return jsonb_build_object('plan_id',p.id,'name',p.name,'currency',p.currency,'context',p.configuration_context,'estimated_minor',estimate::text,'actual_minor',actual::text,'required_minor',required::text,'delivery_minor',delivery::text,'additional_minor',additional::text,'product_quantity',product_qty::text,'rounds',rows,'errors',errors,'lines',lines);end $$;

create function public.get_reward_plan(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if private.reward_plan_read(target) is distinct from true then raise exception 'Reward plan access denied' using errcode='42501';end if;return private.reward_plan_cost(target);end $$;

-- Preserve function identities used by existing policies and prepared callers.
do $$begin
 execute replace(pg_get_functiondef('private.repa_shape(jsonb)'::regprocedure),'FUNCTION private.repa_shape(','FUNCTION private.phase4_repa_shape(');
 execute replace(pg_get_functiondef('private.repa_config_errors(jsonb)'::regprocedure),'FUNCTION private.repa_config_errors(','FUNCTION private.phase4_repa_config_errors(');
 execute replace(pg_get_functiondef('private.repa_config(uuid)'::regprocedure),'FUNCTION private.repa_config(','FUNCTION private.phase4_repa_config(');
 execute replace(pg_get_functiondef('private.repa_schedule(jsonb)'::regprocedure),'FUNCTION private.repa_schedule(','FUNCTION private.phase4_repa_schedule(');
 execute replace(pg_get_functiondef('private.repa_funding(jsonb)'::regprocedure),'FUNCTION private.repa_funding(','FUNCTION private.phase4_repa_funding(');
 execute replace(pg_get_functiondef('public.save_repa_draft(uuid,uuid,integer,jsonb,text,timestamptz)'::regprocedure),'FUNCTION public.save_repa_draft(','FUNCTION private.phase4_save_repa_draft(');
end $$;
create or replace function private.repa_config(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when r.reward_plan_id is null then private.phase4_repa_config(target) else jsonb_set(private.phase4_repa_config(target),'{reward}',private.phase4_repa_config(target)->'reward'||jsonb_build_object('plan_id',r.reward_plan_id)) end from public.group_rules r where r.version_id=target;$$;
create or replace function private.repa_shape(config jsonb) returns void language plpgsql stable security definer set search_path='' as $$
 declare base jsonb:=jsonb_set(config,'{reward}',(config->'reward')-'plan_id');p public.reward_plans;begin
 perform private.phase4_repa_shape(base);
 if config#>'{reward,plan_id}' is not null then
 if jsonb_typeof(config#>'{reward,plan_id}') is distinct from 'string' then raise exception 'Invalid reward plan identifier' using errcode='22023';end if;
 select * into p from public.reward_plans where id=(config#>>'{reward,plan_id}')::uuid;
 if p.id is null or not exists(select 1 from public.repa_groups where id=p.group_id and organization_id=(config#>>'{basic,organization_id}')::uuid) then raise exception 'Reward plan is not in the configured organization' using errcode='42501';end if;
 end if;end $$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('private.repa_insert_rules(uuid,jsonb)'::regprocedure);
 definition:=replace(definition,'insert into public.group_rules(','insert into public.group_rules(reward_plan_id,');
 definition:=replace(definition,' values(target,config->>',' values((config#>>''{reward,plan_id}'')::uuid,target,config->>');
 execute definition;end $$;
create or replace function private.repa_config_errors(c jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare base jsonb:=jsonb_set(c,'{reward}',(c->'reward')-'plan_id');errors jsonb;p public.reward_plans;cost jsonb;begin
 if c#>>'{reward,plan_id}' is null then return private.phase4_repa_config_errors(base);end if;
 base:=jsonb_set(base,'{reward,unit_cost_minor}','1');errors:=private.phase4_repa_config_errors(base);
 select * into p from public.reward_plans where id=(c#>>'{reward,plan_id}')::uuid;
 if p.id is null then return errors||'["The assigned reward plan is missing."]';end if;
 if p.configuration_context<>private.reward_context(c) then errors:=errors||'["Group size, currency, mechanism or allocation rules changed; refresh and save the reward plan."]';end if;
 cost:=private.reward_plan_cost(p.id);return errors||(cost->'errors');end $$;
create or replace function private.repa_schedule(c jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare base jsonb:=jsonb_set(c,'{reward}',(c->'reward')-'plan_id');rows jsonb;cost jsonb;row_value jsonb;reward_round jsonb;result jsonb:='[]';balance bigint;begin
 if c#>>'{reward,plan_id}' is null then return private.phase4_repa_schedule(base);end if;
 base:=jsonb_set(jsonb_set(base,'{reward,unit_cost_minor}','0'),'{reward,delivery_per_payout_minor}','0');rows:=private.phase4_repa_schedule(base);cost:=private.reward_plan_cost((c#>>'{reward,plan_id}')::uuid);
 balance:=(c#>>'{funding,opening_funding_minor}')::bigint-(c#>>'{funding,disclosed_fees_minor}')::bigint;
 for row_value in select * from jsonb_array_elements(rows) loop
 select value into reward_round from jsonb_array_elements(cost->'rounds') where value->>'round'=row_value->>'round';
 balance:=balance+(row_value->>'collections_minor')::bigint-(reward_round->>'required_minor')::bigint;
 result:=result||jsonb_build_array(row_value||jsonb_build_object('projected_balance_minor',balance,'reward_required_minor',reward_round->>'required_minor'));end loop;return result;end $$;
create or replace function private.repa_funding(c jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare base jsonb:=jsonb_set(c,'{reward}',(c->'reward')-'plan_id');errors jsonb;cost jsonb;schedule jsonb;expected bigint;available bigint;required bigint;shortfall bigint;liquidity bigint;fees bigint;begin
 if c#>>'{reward,plan_id}' is null then return private.phase4_repa_funding(base);end if;
 errors:=private.repa_config_errors(c);if jsonb_array_length(errors)>0 then return jsonb_build_object('valid',false,'errors',errors);end if;
 cost:=private.reward_plan_cost((c#>>'{reward,plan_id}')::uuid);schedule:=private.repa_schedule(c);
 select sum((value->>'collections_minor')::bigint),greatest(0,max(-(value->>'projected_balance_minor')::bigint)) into expected,liquidity from jsonb_array_elements(schedule);
 fees:=(c#>>'{funding,disclosed_fees_minor}')::bigint;available:=expected+(c#>>'{funding,opening_funding_minor}')::bigint;
 required:=greatest((cost->>'required_minor')::bigint+fees,case when c->>'mechanism'='pooled_savings' then (c#>>'{mechanism_options,target_minor}')::bigint else 0 end);shortfall:=greatest(0,required-available);
 if shortfall>0 then errors:=errors||'["Total reward funding shortfall."]';end if;if liquidity>0 then errors:=errors||'["A round has insufficient funding for its assigned rewards."]';end if;
 return jsonb_build_object('valid',jsonb_array_length(errors)=0,'errors',errors,'expected_collections_minor',expected,'reward_costs_minor',(cost->>'required_minor')::bigint-(cost->>'delivery_minor')::bigint,'delivery_costs_minor',(cost->>'delivery_minor')::bigint,'disclosed_fees_minor',fees,'available_funding_minor',available,'required_funding_minor',required,'shortfall_minor',shortfall,'liquidity_shortfall_minor',liquidity,'product_quantity',(cost->>'product_quantity')::bigint,'payouts',case when c->>'mechanism'='pooled_savings' then (c#>>'{contribution,member_count}')::integer else (c#>>'{contribution,round_count}')::integer end,'reward_plan',cost);end $$;

create or replace function public.save_repa_draft(target_organization uuid,group_id uuid,expected_revision integer,configuration jsonb,change_summary text,effective_date timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
 begin
 if configuration#>>'{reward,plan_id}' is not null and (group_id is null or not exists(select 1 from public.reward_plans where id=(configuration#>>'{reward,plan_id}')::uuid and reward_plans.group_id=save_repa_draft.group_id)) then raise exception 'A reward plan can only be bound to its own saved group' using errcode='42501';end if;
 return private.phase4_save_repa_draft(target_organization,group_id,expected_revision,configuration,change_summary,effective_date);end $$;

create function public.save_group_reward_plan(target uuid,expected_revision integer,plan_name text,lines jsonb,change_summary text,effective_date timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.repa_manage(target);g public.repa_groups;c jsonb;pid uuid;line jsonb;v public.reward_item_versions;pos integer:=0;cost jsonb;kind text;begin
 select * into g from public.repa_groups where id=target for update;
 if expected_revision is null or expected_revision<>g.revision then raise exception 'Group rules changed; reload before assigning rewards' using errcode='40001';end if;
 if coalesce(char_length(btrim(plan_name)),0) not between 2 and 150 or jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines) not between 1 and 100 then raise exception 'A named reward plan needs 1 to 100 assignment lines' using errcode='22023';end if;
 c:=private.repa_config(g.latest_version_id);
 insert into public.reward_plans(group_id,name,currency,configuration_context,created_by) values(target,btrim(plan_name),c#>>'{basic,currency}',private.reward_context(c),actor) returning id into pid;
 for line in select * from jsonb_array_elements(lines) loop
 if line-array['version_id','scope','round_number','quantity']<>'{}' or not(line ?& array['version_id','scope','round_number','quantity']) or jsonb_typeof(line->'quantity') is distinct from 'number' or (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) or (line->>'quantity')::numeric not between 1 and 1000 then raise exception 'Invalid reward allocation fields' using errcode='22023';end if;
 select v0.* into v from public.reward_item_versions v0 join public.reward_items i on i.id=v0.item_id where v0.id=(line->>'version_id')::uuid and i.organization_id=g.organization_id and v0.published and i.status='published';
 if v.id is null or v.currency<>c#>>'{basic,currency}' then raise exception 'Assignments require published rewards in the group organization and currency' using errcode='22023';end if;
 if line->>'scope'='round' and (jsonb_typeof(line->'round_number') is distinct from 'number' or (line->>'round_number')::numeric<>trunc((line->>'round_number')::numeric) or (line->>'round_number')::integer not between 1 and (c#>>'{contribution,round_count}')::integer or (c->>'mechanism'='pooled_savings' and (line->>'round_number')::integer<>(c#>>'{contribution,round_count}')::integer)) then raise exception 'Choose an existing payout round; pooled rewards are assigned only to the final round' using errcode='22023';end if;
 insert into public.reward_distribution_rules(plan_id,position,item_version_id,scope,round_number,quantity) values(pid,pos,v.id,line->>'scope',(line->>'round_number')::integer,(line->>'quantity')::integer);pos:=pos+1;
 end loop;
 cost:=private.reward_plan_cost(pid);if jsonb_array_length(cost->'errors')>0 then raise exception 'Reward allocation invalid: %',cost->'errors' using errcode='22023';end if;
 select case when count(*)=1 then min(x.kind) else 'mixed' end into kind from public.reward_distribution_rules d join public.reward_item_versions x on x.id=d.item_version_id where d.plan_id=pid;
 c:=jsonb_set(c,'{reward,plan_id}',to_jsonb(pid));c:=jsonb_set(c,'{reward,title}',to_jsonb(btrim(plan_name)));c:=jsonb_set(c,'{reward,kind}',to_jsonb(kind));c:=jsonb_set(c,'{reward,unit_cost_minor}','0');c:=jsonb_set(c,'{reward,quantity}','1');c:=jsonb_set(c,'{reward,delivery_per_payout_minor}','0');
 perform public.save_repa_draft(g.organization_id,g.id,expected_revision,c,change_summary,effective_date);
 insert into public.audit_logs(organization_id,actor_id,action,entity_id,details) values(g.organization_id,actor,'reward.plan_assigned',target,jsonb_build_object('plan_id',pid));return pid;end $$;

do $$declare definition text;begin
 definition:=pg_get_functiondef('public.accept_group_agreement(uuid,uuid,uuid,jsonb,jsonb)'::regprocedure);
 definition:=replace(definition,'''configuration'',c,''policies''','''configuration'',c,''reward_plan'',case when c#>>''{reward,plan_id}'' is null then null else private.reward_plan_cost((c#>>''{reward,plan_id}'')::uuid) end,''policies''');execute definition;
end $$;

-- Server-owned starter data, never a frontend category switch statement or market-price claim.
do $$declare row_value record;category uuid;c jsonb;defs jsonb;begin
 for row_value in select * from (values('Cash','Cash and transfer rewards'),('Appliances','Home appliances'),('Electronics','Personal devices'),('Vehicles','Transport rewards'),('Groceries','Food and household packages'),('Furniture','Home and office furniture'),('Digital','Digital products'),('Services','Service rewards'),('Mixed','Bundles of different rewards'),('Custom','Organizer-defined rewards')) x(name,description) loop
 insert into public.reward_categories(name,description) values(row_value.name,row_value.description);end loop;
 for row_value in select * from (values('Cash payout','Cash','cash'),('Refrigerator','Appliances','physical_product'),('Television','Appliances','physical_product'),('Washing machine','Appliances','physical_product'),('Smartphone','Electronics','physical_product'),('Laptop','Electronics','physical_product'),('Motorcycle','Vehicles','physical_product'),('Grocery package','Groceries','physical_product'),('Furniture','Furniture','physical_product'),('Custom service','Services','service'),('Digital product','Digital','digital_product'),('Mixed reward bundle','Mixed','mixed'),('Custom reward','Custom','custom')) x(name,category,kind) loop
 select id into category from public.reward_categories where organization_id is null and name=row_value.category;
 defs:='[]';
 if row_value.name='Refrigerator' then defs:='[{"definition":{"key":"custom_capacity_liters","label":"Capacity (liters)","category":"reward","type":"number","required":true,"min":1,"max":2000},"applies_to":["physical_product"]},{"definition":{"key":"custom_color","label":"Color","category":"reward","type":"text","required":false},"applies_to":["physical_product"]}]';end if;
 if row_value.name='Motorcycle' then defs:='[{"definition":{"key":"custom_engine_cc","label":"Engine displacement (cc)","category":"reward","type":"number","required":true,"min":1,"max":3000},"applies_to":["physical_product"]},{"definition":{"key":"custom_registration","label":"Registration requirements","category":"reward","type":"textarea","required":true},"applies_to":["physical_product"]},{"definition":{"key":"custom_color","label":"Color","category":"reward","type":"text","required":false},"applies_to":["physical_product"]}]';end if;
 c:=jsonb_build_object('name',row_value.name,'kind',row_value.kind,'category_id',category,'description','','brand','','model','','sku','','currency','PHP','estimated_unit_minor',0,'actual_unit_minor',null,'quantity',1,'supplier','','warranty','','delivery_method','','cash_transfer_method','','shipping_fee_minor',0,'expenses','[]'::jsonb,'attributes',defs,'values','{}'::jsonb,'images','[]'::jsonb,'components','[]'::jsonb);
 insert into public.reward_templates(name,category_id,kind,defaults) values(row_value.name,category,row_value.kind,c);end loop;end $$;

create trigger reward_versions_immutable before update or delete on public.reward_item_versions for each row execute function private.repa_immutable();
create trigger reward_attributes_immutable before update or delete on public.reward_attributes for each row execute function private.repa_immutable();
create trigger reward_images_immutable before update or delete on public.reward_images for each row execute function private.repa_immutable();
create trigger reward_components_immutable before update or delete on public.reward_item_components for each row execute function private.repa_immutable();
create trigger reward_templates_immutable before update or delete on public.reward_templates for each row execute function private.repa_immutable();
create trigger reward_plans_immutable before update or delete on public.reward_plans for each row execute function private.repa_immutable();
create trigger reward_distributions_immutable before update or delete on public.reward_distribution_rules for each row execute function private.repa_immutable();

alter table public.reward_categories enable row level security;alter table public.reward_templates enable row level security;alter table public.reward_items enable row level security;
alter table public.reward_item_versions enable row level security;alter table public.reward_attributes enable row level security;alter table public.reward_images enable row level security;
alter table public.reward_item_components enable row level security;alter table public.reward_plans enable row level security;alter table public.reward_distribution_rules enable row level security;
revoke all on public.reward_categories,public.reward_templates,public.reward_items,public.reward_item_versions,public.reward_attributes,public.reward_images,public.reward_item_components,public.reward_plans,public.reward_distribution_rules from public,anon,authenticated;
grant select on public.reward_categories,public.reward_templates,public.reward_items,public.reward_item_versions,public.reward_attributes,public.reward_images,public.reward_item_components,public.reward_plans,public.reward_distribution_rules to authenticated;
create policy reward_categories_read on public.reward_categories for select to authenticated using(private.active_user() and (organization_id is null or private.authorized(organization_id,'groups.manage')));
create policy reward_templates_read on public.reward_templates for select to authenticated using(private.active_user() and (organization_id is null or private.authorized(organization_id,'groups.manage')));
create policy reward_items_read on public.reward_items for select to authenticated using(private.authorized(organization_id,'groups.manage'));
create policy reward_versions_read on public.reward_item_versions for select to authenticated using(private.reward_version_read(id));
create policy reward_attributes_read on public.reward_attributes for select to authenticated using(private.reward_version_read(version_id));
create policy reward_images_read on public.reward_images for select to authenticated using(private.reward_version_read(version_id));
create policy reward_components_read on public.reward_item_components for select to authenticated using(private.reward_version_read(parent_version_id));
create policy reward_plans_read on public.reward_plans for select to authenticated using(private.reward_plan_read(id));
create policy reward_distributions_read on public.reward_distribution_rules for select to authenticated using(private.reward_plan_read(plan_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('reward-media','reward-media',false,2097152,array['image/png','image/jpeg','image/webp','application/pdf','text/plain']);
create function private.reward_file_access(path text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$declare org uuid;begin
 if path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|jpeg|webp|pdf|txt)$' or not private.active_user() then return false;end if;org:=split_part(path,'/',1)::uuid;
 if writing then return split_part(path,'/',2)=auth.uid()::text and private.authorized(org,'groups.manage');end if;
 return private.authorized(org,'groups.manage') or exists(select 1 from public.reward_images i where i.storage_path=path and private.reward_version_read(i.version_id)) or exists(select 1 from public.reward_item_versions v join public.reward_items ri on ri.id=v.item_id where ri.organization_id=org and jsonb_path_exists(v.attribute_values,'$.** ? (@ == $file)',jsonb_build_object('file',path)) and private.reward_version_read(v.id));end $$;
create policy reward_media_read on storage.objects for select to authenticated using(bucket_id='reward-media' and private.reward_file_access(name,false));
create policy reward_media_insert on storage.objects for insert to authenticated with check(bucket_id='reward-media' and private.reward_file_access(name,true));
create policy reward_media_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'reward-media' or private.reward_file_access(name,false));
create policy reward_media_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'reward-media' or private.reward_file_access(name,true));
create policy reward_media_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'reward-media') with check(bucket_id<>'reward-media');
create policy reward_media_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'reward-media');
create policy reward_media_no_anon on storage.objects as restrictive for all to anon using(bucket_id<>'reward-media') with check(bucket_id<>'reward-media');
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'reward_%' or p.proname like 'phase4_%') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['save_reward_category','save_reward_item','archive_reward_item','create_reward_template','get_reward_catalog','get_reward_item','get_reward_plan','save_group_reward_plan','save_repa_draft']) loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;
end $$;
grant execute on function private.reward_plan_read(uuid),private.reward_version_read(uuid),private.reward_file_access(text,boolean) to authenticated;
commit;
