import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'
import console from 'node:console'
import process from 'node:process'
const db = new PGlite()
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
 create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),status text,factor_type text,created_at timestamptz,updated_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
 grant usage on schema auth to authenticated;
 grant execute on function auth.uid(),auth.jwt() to authenticated;
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;
 grant select,insert,update,delete on storage.objects to authenticated;`)
  await db.exec(
    await readFile(
      new URL('../supabase/migrations/202610260001_foundation.sql', import.meta.url),
      'utf8',
    ),
  )
  await db.exec(
    await readFile(new URL('../supabase/tests/foundation.sql', import.meta.url), 'utf8'),
  )
  console.log(
    'PASS: migration, tenant isolation, atomic owner/audit creation, idempotency, input validation, direct write denial',
  )
  for (const file of [
    '202610260002_auth_organizations_rbac.sql',
    '202610260003_private_media.sql',
  ]) {
    await db.exec(
      await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'),
    )
    console.log(`PASS: ${file}`)
  }
  const upgrade = await readFile(
    new URL('../supabase/migrations/202610260004_phase2_upgrade.sql', import.meta.url),
    'utf8',
  )
  // Check a fresh installation and repeatability before simulating older deployed definitions.
  await db.exec(upgrade)
  await db.exec(upgrade)
  await db.exec(
    await readFile(new URL('../supabase/tests/upgrade-before.sql', import.meta.url), 'utf8'),
  )
  const before = await db.query('select row_to_json(p) as data from public.profiles p order by id')
  const invitationsBefore = await db.query(
    'select row_to_json(i) as data from public.organization_invitations i order by id',
  )
  await db.exec(upgrade)
  const after = await db.query('select row_to_json(p) as data from public.profiles p order by id')
  const invitationsAfter = await db.query(
    'select row_to_json(i) as data from public.organization_invitations i order by id',
  )
  if (
    JSON.stringify(before.rows) !== JSON.stringify(after.rows) ||
    JSON.stringify(invitationsBefore.rows) !== JSON.stringify(invitationsAfter.rows)
  )
    throw new Error('Upgrade altered existing records')
  await db.exec(
    await readFile(new URL('../supabase/tests/upgrade-after.sql', import.meta.url), 'utf8'),
  )
  console.log(
    'PASS: forward upgrade, repeat application, older-definition repair and existing profile/invitation preservation',
  )
  await db.exec(await readFile(new URL('../supabase/tests/phase2.sql', import.meta.url), 'utf8'))
  console.log(
    'PASS: Phase 2 RLS, MFA, verified/suspended accounts, scoped permissions, private storage, invitations, escalation denial, archival blockers and audit immutability',
  )
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/20261026073855_required_personal_profile.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  await db.exec(
    await readFile(new URL('../supabase/tests/personal-profile.sql', import.meta.url), 'utf8'),
  )
  console.log(
    'PASS: required profile setup, validation, bypass denial, own-row isolation and completion persistence',
  )
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/20261027002546_phase3_repa_configuration.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  console.log('PASS: Phase 3 configuration migration')
  const { defaultConfig } = await import('../src/modules/repa/config.ts')
  const repa = defaultConfig('50000000-0000-4000-8000-000000000010')
  Object.assign(repa.basic, { name: 'Test circle', start_date: '2030-01-31' })
  repa.schedule.start_date = '2030-01-31'
  repa.contribution.amount_minor = 10000
  repa.reward.unit_cost_minor = 20000
  repa.membership.terms =
    'Every member accepts the disclosed contribution, reward and schedule rules.'
  for (const type of ['rotating', 'random_draw', 'pooled_savings']) {
    const c = JSON.parse(JSON.stringify(repa))
    if (type === 'random_draw') {
      c.mechanism = type
      c.mechanism_options = { draw_policy: 'without_replacement', algorithm: 'server_csprng' }
      c.distribution.rule = 'secure_random'
    }
    if (type === 'pooled_savings') {
      c.mechanism = type
      c.mechanism_options = { target_minor: 40000, distribute_at_end: true }
      c.distribution.rule = 'equal'
    }
    await db.query('select set_config($1,$2,false)', ['test.' + type, JSON.stringify(c)])
  }
  await db.exec(await readFile(new URL('../supabase/tests/phase3.sql', import.meta.url), 'utf8'))
  console.log(
    'PASS: Phase 3 mechanisms, funding, tenant isolation, consent, activation, immutable versions and state machine',
  )
  await db.exec(
    await readFile(new URL('../supabase/tests/phase4-before.sql', import.meta.url), 'utf8'),
  )
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/20261027013035_phase4_membership_management.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  console.log('PASS: Phase 4 membership migration')
  await db.exec(await readFile(new URL('../supabase/tests/phase4.sql', import.meta.url), 'utf8'))
  console.log(
    'PASS: Phase 4 enrollment, invitations, agreements, permissions, suspension, reward history and controlled replacement',
  )
  await db.exec(
    await readFile(
      new URL('../supabase/migrations/20261027055342_phase5_dynamic_rewards.sql', import.meta.url),
      'utf8',
    ),
  )
  console.log('PASS: Phase 5 dynamic reward migration')
  await db.exec(await readFile(new URL('../supabase/tests/phase5.sql', import.meta.url), 'utf8'))
  console.log('PASS: Phase 5 reward catalog, item versions, mixed pricing and funding assignments')
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/20261027071104_phase6_contribution_deadline_engine.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  console.log('PASS: Phase 6 contribution/deadline migration')
  await db.exec(await readFile(new URL('../supabase/tests/phase6.sql', import.meta.url), 'utf8'))
  console.log(
    'PASS: Phase 6 schedules, obligations, verified partial contributions, deadlines and idempotent jobs',
  )
} catch (error) {
  console.error(
    error.message,
    error.where ?? '',
    'position',
    error.position,
    error.internalPosition,
    error.internalQuery ?? '',
  )
  process.exitCode = 1
} finally {
  await db.close()
}
