# RepaCircle

React + TypeScript + Vite application. Phase 2 adds Supabase authentication, profiles, tenant organizations, MFA and scoped authorization to the Phase 1 UI system. Financial transactions are not implemented.

## Start locally

Requires Node.js 22.12+.

```sh
npm ci
npm run dev
```

Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Both are public browser configuration; never use a service-role key. `VITE_ENABLE_GOOGLE_OAUTH=true` shows Google on both login and registration (the default when unset); set it to false only to explicitly disable the provider. Restart Vite after configuration changes. Without Supabase configuration, clearly labeled layout previews remain available.

## Updating an existing Supabase database

If you already applied `202610260002_auth_organizations_rbac.sql` and `202610260003_private_media.sql`, run **only** `supabase/migrations/202610260004_phase2_upgrade.sql` in your project's SQL Editor. The foundation migration must already exist. Do not rerun the earlier CREATE TABLE migrations.

1. Open the Supabase project whose reference is `dmkranyrgucxmulapato`.
2. Open **SQL Editor → New query**.
3. Paste the entire contents of `202610260004_phase2_upgrade.sql` and run it.
4. After success, deploy the updated application and sign out/sign in to refresh access.

The upgrade replaces function definitions, restores explicit execution grants, adds administrator audit handling and installs restrictive private-storage policies. It preserves existing account, organization, membership, invitation and uploaded-object records. It runs in a transaction and is safe to repeat. It does not modify hosted Auth URL/provider configuration or deploy Edge Functions.

For a **new database**, apply all four migration files in filename order. If using the linked Supabase CLI, use `supabase db push` only after checking its migration history against manually applied files; a SQL Editor execution does not automatically mark a CLI migration applied. Do not reset a production database to synchronize history.

## Hosted authentication configuration

In Supabase Authentication URL Configuration:

- Site URL: `https://repacircle.vercel.app`
- Allowed redirect: `https://repacircle.vercel.app/register`
- Allowed redirect: `https://repacircle.vercel.app/reset-password`
- Allowed redirect: `https://repacircle.vercel.app/auth/callback`
- Add equivalent localhost recovery/callback URLs only for development.

Registration deliberately uses the requested production `/register` redirect. The Site URL must not remain localhost for production. Request a new confirmation message after correcting configuration. Enable email confirmations, secure email changes and TOTP MFA. The local `supabase/config.toml` does not change hosted project settings.

For Google OAuth, configure the Google provider in Supabase, register the Supabase callback URL in the Google console, allow your app’s `/auth/callback` URL in Supabase Auth redirect URLs, then set `VITE_ENABLE_GOOGLE_OAUTH=true` and redeploy. The same button signs in existing accounts or creates new ones; Supabase automatically links identities with the same verified email. No Google secret belongs in Vercel's Vite variables.

## Organization invitations and private media

Owners can create expiring, email-bound invitations, copy a one-time-displayed invitation link, send it through the optional email function, and revoke invitations. Privileged invitees must enroll MFA. Tokens are hashed in the database and never included in invitation-list responses. Expired, revoked, wrong-recipient and escalation attempts are denied server-side.

See `supabase/functions/README.md` to deploy invitation email delivery with Resend. Link sharing works without this provider; email delivery requires its configuration. Avatar and logo buckets are private, restrict file size/type and enforce user/tenant ownership. Images use short-lived signed URLs. Browser uploads check raster signatures; storage policies enforce namespace, MIME and size restrictions, not a malware-scanning service.

## Permissions and administration

The database computes capabilities from active, verified accounts, organization membership, group assignment and MFA. User-editable metadata never grants roles. Frontend guards are navigation aids; RPC authorization and RLS protect records independently.

- Owners manage their organization's staff, settings, invitations, ownership and archival.
- Organizers receive group-management capabilities for their tenant.
- Treasurers receive financial capabilities only for explicitly assigned group scopes.
- Members receive personal and explicitly assigned group capabilities.
- Platform administrators are granted only by a trusted database operator, require MFA and have audited account/settings/analytics access.

To bootstrap a platform administrator, first register, verify the account and enroll MFA at `/security`. A trusted operator can then run this SQL with that verified user's actual UUID:

```sql
insert into private.platform_administrators(user_id)
values ('REPLACE_WITH_VERIFIED_USER_UUID'::uuid)
on conflict do nothing;
```

There is no browser-facing administrator grant API. Creation of an organization grants ownership of that new tenant only. Owners cannot demote/remove themselves or leave without transferring ownership. Unresolved closure blockers prevent archive, departure and member removal. Future financial modules must register blockers transactionally; no organization hard-delete endpoint exists.

## Architecture

Central lazy routes and layouts are in `src/app`; session, query and access providers coordinate restoration and tenant switching. Modules implement auth, profiles, organizations and platform administration. Shared components and emerald light/dark tokens remain in `src/components` and `src/styles`. `@/` resolves to `src/`.

Public account flows include registration, login, verification, recovery, reset and OAuth callback. `/profile`, `/security`, `/organizations`, `/invite` and `/unauthorized` support account/tenant management. Workspace navigation is filtered by scoped permission. Cache data clears when identity changes and selected organizations are validated against current membership.

Group scopes are authorization anchors only. REPA group rules, financial processing, support/dispute case handling and operational reporting remain later-phase work. Platform analytics currently report audited account/tenant/invitation counts only.

## Verification

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
deno check --frozen --config supabase/functions/deno.json supabase/functions/send-organization-invitation/index.ts
```

Database tests run real embedded PostgreSQL with Auth/Storage schema shims, exercise RLS and RPCs, and test the forward upgrade with existing records and simulated older definitions. Browser tests use both empty configuration previews and an intercepted Supabase API fixture on separate local servers, with desktop/mobile projects. These checks do not establish hosted email delivery, Google OAuth or production project configuration.

## Vercel

Use the Vite preset, `npm run build`, output `dist`, and these variables:

- `VITE_SUPABASE_URL=https://dmkranyrgucxmulapato.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY`: your project's publishable key
- `VITE_ENABLE_GOOGLE_OAUTH=true` after configuring the Google provider

Redeploy after changing build-time variables. `vercel.json` supplies SPA routing. Supabase migrations and function deployment are separate from a Vercel deployment. See `PHASE-2.md` for completion status and remaining hosted checks.

### Required personal information

Email confirmation and Google sign-in lead incomplete accounts to /profile/setup. The setup collects first/last name, optional middle/extension name, Philippine mobile number, gender (including prefer not to say), and cascading PSGC region/province/city/barangay plus street/purok and optional postal code. NCR skips province. PSGC choices use https://psgc.gitlab.io/api/ with retry controls; changing a parent clears dependent fields.

Apply the project migration `supabase/migrations/20261026073855_required_personal_profile.sql` in migration order when deploying. This change has not been applied to an online database. Existing profiles are preserved and require setup on their next login. The completion timestamp is set by the ownership-checked save_personal_profile RPC, with backend validation and workspace checks preventing URL/API bypass. No role/status is accepted from the form. Run `npm run test:db` for isolated PostgreSQL tests; it uses PGlite and never connects to online Supabase.

Google OAuth must be enabled in the project's Supabase Auth provider settings with Google client credentials; SQL migrations cannot configure an OAuth provider. No online settings or data are changed by this implementation. The application requests the provider flow rather than prechecking account existence. See [Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).
