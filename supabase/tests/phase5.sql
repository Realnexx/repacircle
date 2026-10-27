begin;
create policy phase5_test_legacy_broad on storage.objects for all to authenticated using(true) with check(true);
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
do $$declare org uuid:='70000000-0000-4000-8000-000000000010';catalog jsonb;c jsonb;cash uuid;product uuid;mixed uuid;v_cash uuid;v_product uuid;v_mixed uuid;gid uuid;pid uuid;cfg jsonb:=current_setting('test.phase4_config')::jsonb;cost jsonb;begin
 catalog:=public.get_reward_catalog(org);
 if jsonb_array_length(catalog->'templates')<13 or jsonb_array_length(catalog->'categories')<10 then raise exception 'Reward catalog defaults missing';end if;
 select value->'defaults' into c from jsonb_array_elements(catalog->'templates') where value->>'name'='Cash payout';
 c:=jsonb_set(c,'{estimated_unit_minor}','10000');c:=jsonb_set(c,'{cash_transfer_method}','"Manual verified transfer"');
 cash:=public.save_reward_item(org,null,0,c,true);v_cash:=(public.get_reward_item(cash)->>'version_id')::uuid;
 select value->'defaults' into c from jsonb_array_elements(catalog->'templates') where value->>'name'='Refrigerator';
 c:=jsonb_set(c,'{estimated_unit_minor}','10000');c:=jsonb_set(c,'{actual_unit_minor}','11000');c:=jsonb_set(c,'{shipping_fee_minor}','100');c:=jsonb_set(c,'{delivery_method}','"Supplier delivery"');
 begin perform public.save_reward_item(org,null,0,c,true);raise exception 'Published without required refrigerator attribute';exception when invalid_parameter_value then null;end;
 c:=jsonb_set(c,'{values}','{"custom_capacity_liters":300}');
 product:=public.save_reward_item(org,null,0,c,true);v_product:=(public.get_reward_item(product)->>'version_id')::uuid;
 cost:=public.get_reward_item(product)->'pricing';if cost->>'required_minor' is distinct from '11100' or cost->>'funding_difference_minor' is distinct from '1000' then raise exception 'Exact actual/estimate/delivery pricing failed: %',cost;end if;
 begin perform public.save_reward_item(org,product,0,c,true);raise exception 'Stale reward overwrite';exception when serialization_failure then null;end;
 select value->'defaults' into c from jsonb_array_elements(catalog->'templates') where value->>'name'='Mixed reward bundle';
 c:=jsonb_set(c,'{delivery_method}','"Combined fulfillment"');c:=jsonb_set(c,'{components}',jsonb_build_array(jsonb_build_object('version_id',v_cash,'quantity',1),jsonb_build_object('version_id',v_product,'quantity',1)));
 mixed:=public.save_reward_item(org,null,0,c,true);v_mixed:=(public.get_reward_item(mixed)->>'version_id')::uuid;cost:=public.get_reward_item(mixed)->'pricing';if cost->>'required_minor' is distinct from '21100' or cost->>'actual_minor' is not null then raise exception 'Mixed reward pricing or unknown actual not preserved: %',cost;end if;
 gid:=public.save_repa_draft(org,null,0,cfg,'Phase 5 assignment test',now());
 pid:=public.save_group_reward_plan(gid,1,'Cash and appliance rewards',jsonb_build_array(jsonb_build_object('version_id',v_cash,'scope','round','round_number',1,'quantity',2),jsonb_build_object('version_id',v_product,'scope','round','round_number',2,'quantity',1)),'Assign immutable reward versions',now());
 cfg:=public.get_repa_group(gid)->'configuration';if cfg#>>'{reward,plan_id}' is distinct from pid::text then raise exception 'Reward plan not attached to new rules snapshot';end if;
 cost:=public.check_repa_activation(gid,(public.get_repa_group(gid)#>>'{group,latest_version_id}')::uuid);
 if (cost->>'reward_costs_minor')::bigint+(cost->>'delivery_costs_minor')::bigint is distinct from 31100 or (cost->>'shortfall_minor')::bigint is distinct from 0 then raise exception 'Group funding did not use assigned reward costs: %',cost;end if;
 perform set_config('test.phase5_group',gid::text,true);perform set_config('test.phase5_plan',pid::text,true);perform set_config('test.phase5_product',product::text,true);perform set_config('test.phase5_product_version',v_product::text,true);perform set_config('test.phase5_cash_version',v_cash::text,true);perform set_config('test.phase5_mixed',mixed::text,true);
end $$;

-- Template reuse, all non-cash types, dynamic attributes, exact arithmetic and protected keys.
do $$declare org uuid:='70000000-0000-4000-8000-000000000010';cat uuid;c jsonb;t text;id uuid;template uuid;bad jsonb;begin
 cat:=public.save_reward_category(org,null,0,'Organization-defined experiences','Reusable locally defined category',true);
 for t in select unnest(array['Digital product','Custom service','Custom reward']) loop
 select value->'defaults' into c from jsonb_array_elements(public.get_reward_catalog(org)->'templates') where value->>'name'=t;
 c:=jsonb_set(c,'{category_id}',to_jsonb(cat));c:=jsonb_set(c,'{estimated_unit_minor}','101');c:=jsonb_set(c,'{actual_unit_minor}','100');c:=jsonb_set(c,'{delivery_method}','"Verified fulfillment"');c:=jsonb_set(c,'{quantity}','3');c:=jsonb_set(c,'{expenses}','[{"label":"Handling","amount_minor":7}]');
 id:=public.save_reward_item(org,null,0,c,true);
 if public.get_reward_item(id)#>>'{pricing,required_minor}' is distinct from '310' then raise exception 'Exact pricing incorrect for %',t;end if;
 template:=public.create_reward_template(id,t||' template','Organization reusable template');
 if not exists(select 1 from public.reward_templates where reward_templates.id=template and defaults->'actual_unit_minor'='null') then raise exception 'Template copied actual purchase price';end if;
 end loop;
 bad:=jsonb_set(c,'{attributes}','[{"definition":{"key":"amount_minor","label":"Override","category":"reward","type":"number","required":false},"applies_to":["custom"]}]');
 begin perform public.save_reward_item(org,null,0,bad,true);raise exception 'Financial field override accepted';exception when invalid_parameter_value then null;end;
 bad:=jsonb_set(c,'{attributes}','[{"definition":{"key":"custom_a","label":"Attribute","category":"reward","type":"text","required":false},"applies_to":[null]}]');
 begin perform public.save_reward_item(org,null,0,bad,true);raise exception 'Null attribute visibility accepted';exception when invalid_parameter_value then null;end;
 bad:=jsonb_set(c,'{estimated_unit_minor}','1.01');begin perform public.save_reward_item(org,null,0,bad,true);raise exception 'Fractional minor unit accepted';exception when invalid_parameter_value then null;end;
 perform public.save_reward_category(org,cat,1,'Organization-defined experiences','Archived category',false);
 begin perform public.save_reward_item(org,null,0,c,true);raise exception 'Inactive category published';exception when invalid_parameter_value then null;end;
end $$;

-- Every payout must be covered, currencies and groups cannot cross, shortages block activation.
do $$declare org uuid:='70000000-0000-4000-8000-000000000010';gid uuid:=current_setting('test.phase5_group')::uuid;v uuid:=current_setting('test.phase5_cash_version')::uuid;c jsonb;other uuid;pid uuid;cost jsonb;begin
 begin perform public.save_group_reward_plan(gid,2,'Missing round',jsonb_build_array(jsonb_build_object('version_id',v,'scope','round','round_number',1,'quantity',1)),'Missing round validation',now());raise exception 'Missing round accepted';exception when invalid_parameter_value then null;end;
 begin perform public.save_group_reward_plan(gid,1,'Stale plan','[]','Stale revision check',now());raise exception 'Stale plan accepted';exception when serialization_failure then null;end;
 c:=current_setting('test.phase4_config')::jsonb;
 c:=jsonb_set(c,'{basic,name}','"Currency mismatch"');c:=jsonb_set(c,'{basic,currency}','"USD"');other:=public.save_repa_draft(org,null,0,c,'Different currency group',now());
 begin perform public.save_group_reward_plan(other,1,'Wrong currency',jsonb_build_array(jsonb_build_object('version_id',v,'scope','each_payout','round_number',null,'quantity',1)),'Currency validation',now());raise exception 'Wrong currency accepted';exception when invalid_parameter_value then null;end;
 c:=public.get_repa_group(gid)->'configuration';
 begin perform public.save_repa_draft(org,other,1,c,'Cross group reward plan',now());raise exception 'Cross-group plan binding';exception when insufficient_privilege then null;end;
 c:=current_setting('test.phase4_config')::jsonb;c:=jsonb_set(c,'{basic,name}','"Early funding shortfall"');other:=public.save_repa_draft(org,null,0,c,'Early liquidity test',now());
 pid:=public.save_group_reward_plan(other,1,'Heavy first round',jsonb_build_array(jsonb_build_object('version_id',v,'scope','round','round_number',1,'quantity',3),jsonb_build_object('version_id',v,'scope','round','round_number',2,'quantity',1)),'Different round reward costs',now());
 cost:=public.check_repa_activation(other,(public.get_repa_group(other)#>>'{group,latest_version_id}')::uuid);
 if cost->>'shortfall_minor' is distinct from '0' or cost->>'liquidity_shortfall_minor' is distinct from '10000' or (cost->>'valid')::boolean then raise exception 'Early liquidity shortfall not blocked: %',cost;end if;
 c:=current_setting('test.phase4_config')::jsonb;c:=jsonb_set(c,'{basic,name}','"Pooled products"');c:=jsonb_set(c,'{mechanism}','"pooled_savings"');c:=jsonb_set(c,'{mechanism_options}','{"target_minor":1,"distribute_at_end":true}');c:=jsonb_set(c,'{distribution,rule}','"fixed_share"');c:=jsonb_set(c,'{distribution,fixed_shares}','[{"slot":1,"basis_points":7500},{"slot":2,"basis_points":2500}]');
 other:=public.save_repa_draft(org,null,0,c,'Whole bundle pooled shares',now());
 begin perform public.save_group_reward_plan(other,1,'No fractional product',jsonb_build_array(jsonb_build_object('version_id',current_setting('test.phase5_product_version')::uuid,'scope','each_payout','round_number',null,'quantity',1)),'Whole bundle allocation',now());raise exception 'Pooled zero reward recipient accepted';exception when invalid_parameter_value then null;end;
 pid:=public.save_group_reward_plan(other,1,'Cash rounded shares',jsonb_build_array(jsonb_build_object('version_id',v,'scope','each_payout','round_number',null,'quantity',1)),'Exact cash allocation',now());
 if public.get_reward_plan(pid)#>>'{rounds,0,required_minor}' is distinct from '0' or public.get_reward_plan(pid)#>>'{rounds,1,required_minor}' is distinct from '20000' then raise exception 'Pooled payout timing incorrect';end if;
 perform set_config('test.phase5_unassigned_group',other::text,true);perform set_config('test.phase5_unassigned_plan',pid::text,true);
end $$;

-- Accept the exact immutable catalog snapshot, activate and preserve it during later edits.
do $$declare org uuid:='70000000-0000-4000-8000-000000000010';gid uuid:=current_setting('test.phase5_group')::uuid;vid uuid;policy uuid;c jsonb;cost jsonb;old_plan uuid:=current_setting('test.phase5_plan')::uuid;pid uuid;ack jsonb:='{"contribution":true,"schedule":true,"deadlines":true,"reward":true,"mechanism":true,"selection":true,"late_policy":true,"refund_exit":true,"disputes":true,"privacy":true}';begin
 vid:=(public.get_repa_group(gid)#>>'{group,latest_version_id}')::uuid;
 perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000001',true);perform public.set_repa_member(gid,'70000000-0000-4000-8000-000000000002',true);
 policy:=public.publish_group_agreement_policy(gid,vid,'Existing commitments remain recorded; exits require documented approval.','Submit evidence to the organizer and escalate unresolved disputes to the owner.','Contact details are restricted to authorized group administration and financial history is retained.');
 perform public.accept_group_agreement(gid,vid,policy,ack,'{}');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 perform public.accept_group_agreement(gid,vid,policy,ack,'{}');
 if public.get_group_agreement(gid,vid)#>>'{agreement,snapshot,reward_plan,required_minor}' is distinct from '31100' then raise exception 'Agreement did not capture full immutable reward plan';end if;
 if public.get_reward_plan(old_plan)->>'required_minor' is distinct from '31100' then raise exception 'Member could not read accepted plan';end if;
 begin perform public.get_reward_catalog(org);raise exception 'Member read organizer catalog';exception when insufficient_privilege then null;end;
 begin perform public.get_reward_plan(current_setting('test.phase5_unassigned_plan')::uuid);raise exception 'Nonmember read other plan';exception when insufficient_privilege then null;end;
 begin perform public.archive_reward_item(current_setting('test.phase5_product')::uuid,1);raise exception 'Member archived reward';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
 perform public.activate_repa_group(gid,vid,true);
 c:=public.get_reward_item(current_setting('test.phase5_product')::uuid)->'configuration';c:=jsonb_set(c,'{estimated_unit_minor}','99999');perform public.save_reward_item(org,current_setting('test.phase5_product')::uuid,1,c,true);
 cost:=public.get_reward_plan(old_plan);if cost->>'required_minor' is distinct from '31100' then raise exception 'Catalog edit changed immutable group pricing';end if;
 if public.get_reward_item(current_setting('test.phase5_mixed')::uuid)#>>'{pricing,required_minor}' is distinct from '21100' then raise exception 'Component edit changed existing mixed bundle';end if;
 begin perform public.save_group_reward_plan(gid,2,'Immediate change',jsonb_build_array(jsonb_build_object('version_id',current_setting('test.phase5_cash_version')::uuid,'scope','each_payout','round_number',null,'quantity',1)),'Active immediate change',now());raise exception 'Active obligations silently changed';exception when invalid_parameter_value then null;end;
 pid:=public.save_group_reward_plan(gid,2,'Future rewards',jsonb_build_array(jsonb_build_object('version_id',current_setting('test.phase5_cash_version')::uuid,'scope','each_payout','round_number',null,'quantity',1)),'Future catalog reward proposal',now()+interval '1 day');
 if public.get_repa_group(gid)#>>'{group,accepted_version_id}' is distinct from vid::text or public.get_repa_group(gid)#>>'{accepted_configuration,reward,plan_id}' is distinct from old_plan::text then raise exception 'Future rewards rewrote accepted version';end if;
 begin perform public.approve_repa_proposal(gid,(public.get_repa_group(gid)#>>'{group,latest_version_id}')::uuid);raise exception 'Future reward plan approved without new agreements';exception when invalid_parameter_value then null;end;
 perform public.archive_reward_item(current_setting('test.phase5_product')::uuid,2);
 if public.get_reward_plan(old_plan)->>'required_minor' is distinct from '31100' then raise exception 'Archive altered assigned group reward';end if;
end $$;

-- Upload paths are organization/user scoped and immutable, including under legacy broad policies.
do $$declare path text:='70000000-0000-4000-8000-000000000010/70000000-0000-4000-8000-000000000001/75000000-0000-4000-8000-000000000001.png';c jsonb;id uuid;begin
 insert into storage.objects(bucket_id,name) values('reward-media',path);
 if not exists(select 1 from storage.objects where bucket_id='reward-media' and name=path) then raise exception 'Organizer upload inaccessible';end if;
 begin insert into storage.objects(bucket_id,name) values('reward-media',replace(path,'/70000000-0000-4000-8000-000000000001/','/70000000-0000-4000-8000-000000000002/'));raise exception 'Other user upload path allowed';exception when insufficient_privilege then null;end;
 c:=public.get_reward_item(current_setting('test.phase5_product')::uuid)->'configuration';c:=jsonb_set(c,'{images}',jsonb_build_array(jsonb_build_object('path',path,'alt','Verified refrigerator image')));
 id:=public.save_reward_item('70000000-0000-4000-8000-000000000010',current_setting('test.phase5_product')::uuid,3,c,true);
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 if exists(select 1 from storage.objects where bucket_id='reward-media' and name=path) then raise exception 'Member read unassigned future catalog image';end if;
 if exists(select 1 from public.reward_item_versions where item_id=current_setting('test.phase5_product')::uuid and version_number>1) then raise exception 'Member read unassigned future item versions';end if;
 begin insert into storage.objects(bucket_id,name) values('reward-media',replace(path,'000000000001.png','000000000002.png'));raise exception 'Member upload allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
 update storage.objects set name=path||'.tampered' where name=path and bucket_id='reward-media';
 delete from storage.objects where name=path and bucket_id='reward-media';
 if not exists(select 1 from storage.objects where name=path and bucket_id='reward-media') then raise exception 'Immutable reward file was overwritten or removed';end if;
 -- Bind the image version to a future proposal; only members of that group may read it.
 perform public.save_group_reward_plan(current_setting('test.phase5_group')::uuid,3,'Future pictured reward',jsonb_build_array(jsonb_build_object('version_id',(public.get_reward_item(id)->>'version_id')::uuid,'scope','each_payout','round_number',null,'quantity',1)),'Future picture version binding',now()+interval '2 days');
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 if not exists(select 1 from storage.objects where bucket_id='reward-media' and name=path) then raise exception 'Assigned member could not read reward image';end if;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000007',true);
 if exists(select 1 from storage.objects where bucket_id='reward-media' and name=path) then raise exception 'Unrelated user read reward image through broad policy';end if;
 begin perform public.get_reward_item(id);raise exception 'Unrelated user read reward';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.save_reward_item('70000000-0000-4000-8000-000000000010',null,0,c,true);raise exception 'Reward mutation bypassed MFA';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Even owner-level SQL must not rewrite immutable item and allocation rows.
do $$begin
 begin update public.reward_item_versions set name='Tampered' where id=current_setting('test.phase5_product_version')::uuid;raise exception 'Reward version mutated';exception when insufficient_privilege then null;end;
 begin delete from public.reward_distribution_rules where plan_id=current_setting('test.phase5_plan')::uuid;raise exception 'Distribution removed';exception when insufficient_privilege then null;end;
end $$;
do $$declare rel record;f record;begin
 for rel in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(array['reward_categories','reward_templates','reward_items','reward_item_versions','reward_item_components','reward_attributes','reward_images','reward_plans','reward_distribution_rules']) loop
 if not rel.relrowsecurity or has_table_privilege('anon',rel.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',rel.oid,'INSERT,UPDATE,DELETE') then raise exception 'Unsafe reward table grants or RLS: %',rel.relname;end if;end loop;
 for f in select p.oid,p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['get_reward_catalog','get_reward_item','get_reward_plan','save_reward_item','save_reward_category','archive_reward_item','create_reward_template','save_group_reward_plan']) loop
 if has_function_privilege('anon',f.oid,'EXECUTE') or not exists(select 1 from unnest(f.proconfig) setting where setting like 'search_path=%') then raise exception 'Unsafe reward RPC execution/search path: %',f.proname;end if;end loop;
end $$;
rollback;
