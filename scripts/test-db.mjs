import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'
import console from 'node:console'
const db = new PGlite()
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 grant execute on function auth.uid() to authenticated;`)
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
} finally {
  await db.close()
}
