# Phase 4 — Membership management

Implemented locally after Phase 3. No online Supabase records, Auth settings or storage objects were changed; no migration was pushed, email sent or deployment performed.

## Enrollment and management

Open **Organizer → Groups → group → Members & agreements**. The workspace contains the searchable members table, status filters, invitations, requests, policy publication, agreement acceptance, staff permissions, controlled replacements and immutable activity history. Profile drawers show authorized contact details, accepted agreements, obligation snapshots, verified credits, reward delivery history and payout eligibility. Pending requests and agreement review also have dedicated routes.

- Invite by a verified email or create a limited-use share link. The server generates the secret, stores only its SHA-256 hash, binds email invitations to the recipient and enforces expiry, revocation, use limits and delivery rate limits. Plaintext secrets are displayed only at creation. Link fragments are removed from the URL and retained in session storage for sign-in/profile completion; sign-out clears them.
- Only organization owners may create group invitations that admit outsiders as basic organization members. Other authorized group staff invite existing organization members. The join screen explains basic organization enrollment; invitations never grant staff roles.
- Members of the organization can request membership in an organization-visible group when `members_can_request` is configured and enrollment is open (or join the active-group waiting list). Invite-only groups require their secure invitation.
- Review a pending request with an audited reason. Approval reserves a numbered slot; rejection keeps the membership/request history. Direct enrollment of existing organization members before group activation also reserves a slot and still requires agreement acceptance.
- Invitations and pending requests do not reserve seats. Approved, active and suspended members do. Capacity and slot allocation serialize on the group row; partial unique indexes also enforce slot uniqueness. One permanent person/group record prevents duplicate memberships. Automatic approval applies to eligible pre-activation invitation enrollment only when configured; active groups require controlled replacement.
- Membership statuses are `invited`, `pending`, `approved`, `active`, `suspended`, `withdrawn`, `removed`. Rejected requests map to retained `removed` records. Terminal records cannot be deleted or reused as fresh membership identities in the same cycle; a new cycle uses a new group.
- A suspended member loses group participation permissions and payout eligibility while retaining access to their own historical records. Seats and debts remain reserved. Reinstatement requires an authorized review; the lifecycle determines whether the member returns to approved or active status. Independent organization governance permissions are not organization-level suspensions.
- Removal or withdrawal cannot erase outstanding obligations. Exits from active/paused cycles use controlled replacement; ordinary removal requires settled obligations and group closure. Group cancellation also preserves outstanding obligations and the organization closure blocker. Completion requires both the configured schedule and recorded contributions to be settled.

The public join page is `/groups/join`; the agreement page is `/groups/:groupId/agreement`. Organizer requests use `/organizer/groups/:groupId/requests`; scoped staff can use the corresponding treasurer route.

## Agreements and versions

For each rules version, publish refund/exit policies, a dispute process and a privacy notice. Published policies are immutable. Editing them requires a new configuration version and fresh acceptance; a future approval does not rewrite existing accepted obligations.

Each member reviews and explicitly accepts all ten required sections: contribution amount, payment schedule, deadlines, reward type, payout mechanism, recipient selection, late-payment policy, refund/exit policy, dispute process and privacy notice. Custom membership fields from the Phase 3 schema are validated again on the server, including conditional/repeating values and existing private uploads.

An immutable agreement records the member, slot, exact rules version, policy ID, all acknowledgements, validated custom values, a complete configuration/policy snapshot, accepting account and timestamp. The stored policy ID prevents stale acceptance. Separate replacement contexts prevent an agreement for a cancelled proposal from authorizing a later replacement. Historical agreements remain independently inspectable.

Activation and future-version approval require full agreements for every configured member and slot, in addition to the existing financial, account, MFA and consent checks. Activation changes approved memberships to active and snapshots every member's per-round contribution, cutoff and grace period from the accepted configuration.

Existing Phase 3 members and their original consent metadata are preserved during migration. Accepted financial obligations are backfilled from their immutable rules. No new policy acceptance is fabricated; existing members must explicitly accept the newly published supplemental policies before eligibility or contribution submission is granted.

## Financial history and replacement

`group_member_obligations` preserves the original member, slot, rules version, round, amount and deadline. Verified external contribution credits and delivered rewards are separate immutable facts. Staff with the relevant group capability can record a verified reference and evidence note; references are idempotent, excess contribution credits are rejected, and a cycle reward cannot be recorded twice. This records external facts; it does not collect money, execute a draw or send a payout. Late fees, refunds, disputes and payment settlement remain policy/manual review inputs, not automated financial processing.

Payout eligibility is recalculated from active membership/account status, accepted agreement, group state, round deadline/grace, recorded contributions through that round, configured percentage requirements and recipient rule. Rotating groups match the slot order; pooled groups wait for the final round. Random-draw eligibility does not select a winner. A reward recipient flag and evidence remain in history regardless of later status.

Controlled replacement:

1. An organizer selects an active/suspended outgoing member, a pending incoming member, a future starting round and an explanation.
2. All earlier obligations must be paid. No accrued or prepaid future obligations transfer. A member who already received the cycle reward cannot transfer their remaining commitments. An earlier rotating recipient entitlement must also be resolved.
3. The incoming member accepts the complete agreement for the original accepted rules, the slot, transfer scope, future contribution total and future recipient eligibility. Both people separately accept the exact proposal; organizers cannot consent on another member's behalf.
4. Completion rechecks participants, rules, dates, payments and rewards under a group lock. Immutable transfer rows assign only future unpaid obligations to the incoming member; the original obligation rows are never updated or deleted. The outgoing person becomes withdrawn, and the incoming person becomes active in the same slot. Prior credits and rewards remain with the original member.

This conservative workflow does not transfer accrued debts, prepayments or a previous recipient's remaining cycle liability. Changes needing refunds or debt restructuring require separate settlement work rather than overriding history.

## Scoped access

Organization owners/organizers retain their existing governance permissions. They may grant verified, profile-complete, MFA-enrolled organization staff only these capabilities for a specific group: member/profile read, invite, review, suspend, financial history read, verified contribution history recording and verified reward delivery recording. An empty list revokes the explicit grant; no organization role is promoted.

Legacy treasurer authorization anchors remain supported. Move a legacy treasurer scope assignment to the new group-specific permissions before assigning that same person a financial member slot, since the older scope table has one role per person/group.

Every new table has RLS and explicit grants; browser users cannot directly mutate it. Members can read their own obligations, credits, rewards and agreements. Staff permissions are checked in SQL on every operation with current organization membership, account state and MFA. Finance-only staff do not receive private contact details, custom agreement values or private membership request notes. Group staff grants do not apply to another group. Storage upload checks include approved members and explicitly proposed incoming replacements, and suspend participation access appropriately.

## Migration and email rollout — not performed

The next one-time transactional migration is `supabase/migrations/20261027013035_phase4_membership_management.sql`, after the complete Phase 3 migration in the intended project `dmkranyrgucxmulapato`. For a fresh database, apply all seven migration files in filename order. Do not rerun older CREATE TABLE scripts or reset an existing project. Existing Phase 3 records remain intact; new required agreement acceptance is explicit.

The migration creates the five requested tables (`group_members`, `group_invitations`, `membership_requests`, `group_agreements`, `membership_events`) and typed supporting tables for policies, staff grants, obligation snapshots, verified history, replacements and immutable obligation transfers. Existing authorization function identities are retained so earlier policies and prepared calls continue enforcing the updated checks.

Email delivery uses the new `send-group-invitation` Edge Function, the existing pinned Supabase client and the shared Resend handler. It resolves the recipient server-side after verifying Auth, token, group permission, MFA and expiry. It requires server-only `APP_URL`, `RESEND_API_KEY` and `RESEND_FROM_EMAIL`; no service-role key is used. Configure/deploy it separately when rolling out, then smoke-test with accounts you control. Secure copyable links work without email-provider configuration. No email was sent by this implementation or its tests.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, `npm run build`, `npm run format:check` and `npm run test:e2e`. Check both invitation Edge Functions with Deno and the existing frozen lockfile.

Local PostgreSQL tests apply the actual migration after a seeded Phase 3 active group, then exercise upgrade preservation, fresh activation, capacities, duplicate membership/invitations, email binding, expiry, limited-use links, delivery retry limits, unauthorized review, immutable agreement versions, scoped staff read/write denial, private data separation, suspension, past payouts, replacement consent, cancelled-proposal consent contexts, unchanged obligation snapshots and closure blockers. Catalog checks verify RLS, grants and restricted RPC execution/search paths.

Browser fixtures cover email invitation → join request → approval → all-section agreement, login handoff/expiry errors, profile drawers, suspension/removal blocking and two-party replacement on desktop/light and mobile/dark. The existing Phase 3 wizard/activation flows and account/organization regressions remain in the suite. Browser responses are intercepted fixtures; SQL tests use real embedded PostgreSQL with minimal Supabase Auth/Storage shims. Hosted delivery and integration have not been verified.

Final local checks passed: 78 unit/component tests across 15 files, all 68 browser tests in a complete run with two workers, the complete embedded PostgreSQL suite, frontend/Edge TypeScript, ESLint, formatting, production build and whitespace checks. Both invitation handlers passed real Deno checking with the frozen dependency lockfile. Browser test server lifecycle was managed separately on Windows; the temporary runner configuration was removed afterward. Desktop/light and mobile/dark profile drawers were visually inspected.

Stopped after Phase 4. No gateway integration, automated collections, refund processing, draw execution or payout execution was added.
