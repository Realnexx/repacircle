# Phase 3 — Dynamic REPA configuration engine

Implemented locally on top of Phase 2 and the required personal-profile migration. No online Supabase data, Auth settings, storage objects or project configuration were changed. No deployment was performed.

## Organizer workflow

1. Open **Organizer → Groups → Create REPA group** in the selected organization.
2. Complete the eight steps: basic information, mechanism, rewards, contributions, payment methods, distribution, membership and agreements, review and activation. Save an incomplete draft at any step; structurally invalid values cannot be saved.
3. Choose rotating, random draw or pooled savings. Each has a separate strict schema and compatible recipient rules. Set cash, physical/digital product, service, mixed or custom rewards; disclose the complete unit cost and mixed-reward breakdown.
4. Add optional custom reward or membership definitions. Supported controls include text, textarea, number, currency, date, time, select, multi-select, radio, checkbox, file/image upload and repeating rows. Configure required flags, bounds, options and conditional visibility. Definitions and values use the `custom_` namespace; financial, role and system fields cannot be overridden. Repeating groups allow one level, at most ten children, and up to twenty custom rows by default.
5. After the first save, group images and custom attachments can be uploaded privately. Images support PNG/JPEG/WebP; general attachments additionally support PDF/plain text. Maximum size is 2 MB. Paths are group/user/file UUIDs. Uploaded objects cannot be overwritten or deleted by browser users because historical rules may reference them.
6. From **Group details → Members & agreements**, assign existing organization members to numbered slots. Slots map to configurable contributions, rotation order and fixed shares. Each member signs in separately, reviews the saved version and terms, completes any required membership fields, and accepts that exact version. Organizers cannot accept on another person's behalf.
7. Run server activation checks. The saved rules, projections, existing uploads, verified active members, full slot coverage, every member's consent and available approvers must pass. Open enrollment must first be closed; a fully configured draft may also activate directly.
8. Accept the financial assumptions and terms, review confirmation, and activate. The server locks the group, rechecks everything and stores the approved version and accepted pointer atomically. Activation is retry-safe for that same version.

Group listing supports name, mechanism and status filters. Group detail includes rules/funding, members/agreements, every scheduled round through pagination, settings, full version diffs and recent server checks. Both light/dark themes and mobile layouts use the existing design system.

## Financial assumptions

All protected monetary inputs are integer minor units (PHP centavos; 100 = 1.00). Browser parsing uses exact decimal-string arithmetic. Individual monetary inputs are bounded at 1,000,000,000 minor units; members, rounds and reward quantities are capped at 1,000. Projection arithmetic remains within JavaScript's safe-integer range; SQL uses bigint.

- Fixed collections = contribution per member × member count × round count.
- Configurable collections = sum of the explicitly configured slot amounts × round count; each slot must be present once and meet the minimum.
- Rotating/random draw have exactly one recipient per round and one round per member. Random selection is configured for server cryptographic randomness without replacement.
- Pooled savings distributes to all configured recipients at the end. The configured reward quantity is the average quantity per recipient; the total pool is quantity × member count. Equal, contribution-weighted and fixed-share allocation determine each slot's portion. Fixed shares must total 10,000 basis points (100%). Preview rounding uses BigInt largest remainders, with lower slot number breaking ties, preserving total cash minor units or indivisible product quantities.
- Reward costs = disclosed unit cost × quantity × planned recipients. Delivery is charged per recipient. Full-cycle disclosed fees are conservatively charged before the first round.
- Available projected funding = expected collections + declared opening funding. Positive opening funding requires a disclosed source and organizer confirmation; it is a planning assumption, not a verified bank balance.
- Required funding = the greater of the pooled target or reward costs + delivery + disclosed fees. Late fees are excluded from expected collections.
- Total shortfalls and any intermediate negative projected round balance block activation, including cases where the final cycle would show a surplus. Collections are assumed available by the round cutoff before distribution; partial-payment eligibility does not reduce required commitments.
- Monthly dates remain anchored to the original day and clamp at month end without drifting. Daily, weekly, biweekly and custom-day intervals are supported. Cutoff/grace use Asia/Manila or UTC; grace is 0–168 hours.

Client Zod validation provides feedback; SQL independently validates shape, definitions and business rules and recomputes projections. A caller cannot submit a trusted client funding result or bypass checks through direct table writes.

## State and version guarantees

Allowed transitions:

```text
draft → enrollment_open | active (validated activation) | cancelled
enrollment_open → enrollment_closed | cancelled
enrollment_closed → enrollment_open | active (validated activation) | cancelled
active → paused | completed | cancelled
paused → active | cancelled
completed → archived
cancelled → archived
archived → no further transition
```

Status mutations require an expected current state and an audited reason. Enrollment requires complete business rules. Completion requires the final scheduled grace period to have ended. Active/paused groups register an organization closure blocker, resolved only on completion/cancellation. Phase 4 must add settlement/financial-ledger blockers before allowing a terminal status to resolve real monetary obligations.

Every save creates an immutable candidate snapshot with a consecutive version, previous-version reference, actor, summary, recursive previous/new value diff, approval status and effective date. Revision checks reject stale edits. Tables store typed financial and schedule columns; JSONB is reserved for mechanism options, custom values/definitions, repeated slot data, diffs and audit check results.

Initial activation approves the current candidate and fixes the accepted version pointer. Existing accepted rules, group identity metadata, member slot assignments and recorded consents cannot be edited or deleted. Later proposals require a future effective date and fresh consent from every currently assigned member. Approval records that future version separately and **never replaces the initial accepted pointer or rewrites existing obligations**. Applying future changes to new obligations is deliberately outside Phase 3; approval is not automatic application at the effective date.

RLS limits reads by tenant, visibility and assignment; private membership attachment values are restricted to their owner and authorized managers. Write RPCs independently require verified/completed active accounts, organization capabilities and MFA for management. Payout approval capacity counts verified, profile-complete, MFA-enrolled owners/organizers with the existing payout-management capability. Scoped treasurers do not gain new payout permissions in this phase.

## Database rollout — prepared only

New migration: `supabase/migrations/20261027002546_phase3_repa_configuration.sql`.

It creates the six requested tables: `repa_groups`, `group_rules`, `group_config_versions`, `schedule_definitions`, `form_field_definitions`, `group_activation_checks`; plus `repa_member_consents`, member slot constraints/indexes, private storage policies, immutable triggers and guarded RPCs.

For the intended project `dmkranyrgucxmulapato`, after Phase 2 and `20261026073855_required_personal_profile.sql` are already applied, the new Phase 3 migration is the next SQL file to apply. It is transactional and one-time, not a repeatable upgrade. Do not rerun older CREATE TABLE migrations or reset an existing project. For a fresh database, apply all six migration files in filename order. Verify migration history if mixing SQL Editor application with the CLI.

No CLI push, remote SQL, provider configuration, online test account creation, deployment, payment or email send was performed. Hosted application remains a separate rollout step.

## Verification and boundaries

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, `npm run build` and `npm run test:e2e`.

- Unit/component tests cover all mechanism schemas, protected fields, exact funding/shortfalls, liquidity, monthly schedules, state transitions/diffs, allocation rounding, uploaded image validation and invalid currency recovery.
- Local embedded PostgreSQL tests apply the actual migrations and exercise all three creation/consent/activation flows, revision conflicts, invalid/missing funding, per-round shortfalls, tenant isolation, direct write denial, member/anonymous restrictions, uploads, conditional/repeating agreement fields, immutable rules, future approvals, enrollment/pause/cancellation/archival and organization closure guards.
- Browser fixtures exercise the eight-step wizard, custom fields, saved draft reload, member assignment, agreement, validation, activation and history for all three mechanisms, desktop/light and mobile/dark. Existing account/organization/landing regressions remain in the suite. Fixture concurrence simulates the second member; database tests authenticate each member independently.

Browser API responses are intercepted fixtures; SQL tests use real embedded PostgreSQL with minimal Supabase Auth/Storage shims. Hosted integration is not claimed.

Final local checks passed: 74 unit/component tests across 14 files, 60 browser tests across desktop/mobile, the complete embedded PostgreSQL suite, formatting, ESLint, TypeScript (frontend and Edge Functions), production build and Git whitespace checks. Browser runs used the configured test/e2e Vite servers, with server lifecycle managed separately on Windows.

**Stopped at Phase 3:** this module configures and validates commitments. It does not collect money, verify transfers, operate a ledger, execute draws, fulfill products, run payment gateways or distribute payouts. Manual cash/GCash/Maya/bank/custom instructions can activate. An integrated gateway can be selected in a draft, but activation is blocked until a real provider integration exists. Invitation/member-approval settings and payout rules are versioned policy inputs; operational join-request, draw and payout execution belong to subsequent phases.
