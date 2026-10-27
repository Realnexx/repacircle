# Organization invitation email

Deploy `send-organization-invitation` to the intended Supabase project after applying migrations. It verifies the caller with Supabase Auth and invokes the owner/MFA-authorized SQL command to claim delivery. Recipients come from the invitation record. The function uses no service-role key.

Set these server-only Supabase Edge Function secrets:

- `APP_URL=https://repacircle.vercel.app`
- `RESEND_API_KEY`: your Resend API key
- `RESEND_FROM_EMAIL`: a verified sender on your Resend domain

Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Do not place email credentials in `VITE_*` variables or commit them.

```sh
supabase functions deploy send-organization-invitation --project-ref dmkranyrgucxmulapato
```

The repository's function config sets `verify_jwt=false` because the handler explicitly validates the bearer token through Auth; SQL then enforces ownership, verified active account, MFA, token binding, expiry and rate limits. This is not a public unauthenticated email relay. The configured app origin is the sole allowed browser origin. Delivery uses Resend idempotency keys and does not log invitation tokens.

Dependencies are pinned in `deno.json` and `deno.lock`. Validate with:

```sh
deno check --frozen --config supabase/functions/deno.json supabase/functions/send-organization-invitation/index.ts
```

The frontend reports delivery failures. Owners may copy the newly created invitation link without email configuration; plaintext tokens are not retrievable later. Revoke and recreate an invitation if its original link is lost. Hosted provider delivery still requires a smoke test using accounts you control.

## Phase 4 group invitation email

`send-group-invitation` uses the same server-only secrets and shared delivery handler. Apply the Phase 4 membership migration first. Its SQL claim verifies the current group invitation capability, MFA, account state, token, recipient, expiry, available uses, group state and delivery retry limit. Group invitations open `/groups/join`; organization invitations continue opening `/invite`. The recipient is read from the invitation record, and links never grant staff permissions.

Deploy the new function separately to project `dmkranyrgucxmulapato` when rolling out. No deployment or real email send was performed in this work. Validate both handlers with the pinned lockfile:

```sh
deno check --frozen --config supabase/functions/deno.json supabase/functions/send-group-invitation/index.ts supabase/functions/send-organization-invitation/index.ts
```

The app exposes explicit email sending after invitation creation and reports provider failures without invalidating the secure copyable link. Only organization owners can issue group invitations that admit outsiders as basic organization members; scoped staff invite existing organization members. See `PHASE-4.md` for the complete enrollment and agreement workflow.
