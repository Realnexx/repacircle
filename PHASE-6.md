# Phase 6 — Contribution and Deadline Engine

Implemented on Phase 5. No online Supabase database, Auth, Storage or project settings were changed. The project migration is prepared for later deployment; all database verification uses isolated local PostgreSQL with the existing Supabase Auth/Storage test shims.

## Schedules and accepted obligations

The REPA wizard supports daily, weekly, every two weeks, monthly, specific ISO weekdays (Monday = 1), specific monthly dates and one custom date per round. The existing custom day interval remains supported. Asia/Manila is the default timezone; Asia/Manila or UTC is stored explicitly in each immutable schedule and obligation terms snapshot.

Monthly intervals retain their original anchor: January 31 → February 28/29 → March 31. Specific monthly-date lists skip nonexistent days instead of clamping them. Explicit custom dates must be unique, ascending, on or after the start date, and match the round count. Client previews, funding checks, agreements and backend generation use the same semantics.

Activation automatically generates the complete accepted contribution schedule for active members, retaining obligations for suspended members. Phase 4's `group_member_obligations` remain the authoritative immutable principal/deadline records. New `contribution_obligation_terms` capture currency, timezone, partial-payment policy and late policy. A slot/version/round uniqueness constraint prevents duplicates, including after a member replacement. Generating a schedule again never rewrites an existing obligation or transfers historical payments.

`contribution_rule_definitions` stores the new calendar selections and reviewed fee terms against the immutable group configuration version. Future proposals remain separate from the accepted rules pointer. They do not generate a second set of debts, reprice prior obligations or apply new fees retroactively. Applying an approved future proposal to an existing cycle is not introduced by this phase.

## Verified contributions and status

The organizer Contributions page, scoped treasurer Collections page and member My Contributions page expose the calendar, obligation table, deadlines, history, progress indicators and round details. A group's Contributions tab opens the same authorized view. Tables have status/date filters and pagination; the calendar shows a paginated set of obligations for its selected month. Summary totals cover the viewer's complete authorized scope.

Only authoritative verified credits reduce balances. `contribution_receipts` records an already verified cash, manual GCash/Maya, bank or organizer-defined receipt using a method in the accepted rules. Principal allocations reference the existing immutable `group_member_financial_events`; fee allocations are recorded separately. Principal is settled first, and receipt retries require the same request ID and identical facts. Payment references are unique within the group. This phase does not initiate a transfer, integrate a gateway or turn pending attempts into verified money.

For an obligation of PHP 1,000, verified cash of PHP 400 plus verified GCash of PHP 600 produces zero remaining principal and **paid**, provided no unpaid assessed fee remains. Disabled partial payments, excessive credits, duplicate references and credits against terminal obligations are rejected. The older verified-history endpoint also enforces the accepted contribution/deadline restrictions.

Status is derived on read, even before the next job runs:

- **upcoming**: before the local due calendar day, with no payment.
- **unpaid**: the due day has arrived; there is no verified payment and grace has not expired.
- **partially_paid**: some verified funds exist and a balance remains before grace expires.
- **paid**: principal and applicable fees are fully settled.
- **overdue**: a balance remains after effective grace expiry; this takes precedence over partially paid.
- **waived / cancelled**: an explicit, immutable organizer adjustment closed the unpaid obligation.

Payment-attempt statuses are not used as obligation statuses. Projection tables support scheduled checks and history; they do not replace authoritative ledger/deadline derivation.

## Fees, extensions and waivers

New automatic fees require a reviewer, review date, legal-review reference, member-facing disclosure and positive maximum in the accepted rules. The software records the organizer-supplied review information; it does not perform or certify a legal review. Legacy unreviewed fee configurations are not automatically assessed and cannot be newly activated without reviewed terms.

Fees are one-time and non-compounding. Fixed fees respect the cap. Percentage fees apply to principal unpaid at grace expiry, round up to the next minor unit and respect the cap. Later payment or delayed job execution cannot evade an accrued fee: authoritative reads calculate it, writes persist it, and a unique obligation-level fee record prevents reassessment. Accrued fees are also persisted before cancellation or completion changes the group's running status. Fees are excluded from projected reward funding.

`contribution_adjustments` append original-preserving history. Only an authorized MFA-verified organizer may:

- Waive an unpaid assessed fee, without refunding already paid fees.
- Extend a deadline to a future instant within 366 days; the original grace duration follows the extension. Existing assessed fees remain until explicitly waived.
- Fully waive an obligation with no verified payment and no unpaid fee. This can leave a principal collection gap.
- Cancel a future, unpaid obligation of an explicitly cancelled group. Past accrued debt and paid history cannot be erased this way.

The reject-late policy blocks receipts after grace until an extension is approved. Partial payments, suspensions and pauses do not implicitly extend a deadline or waive debt. Replacement checks refuse to transfer adjusted financial commitments. Existing payout-eligibility, member-exit and organization-closure checks consume effective balances and deadlines.

## Scheduled engine

The migration installs a named `repacircle-contribution-deadlines` job when `pg_cron` is available. It invokes private `ce_tick()` every minute, in batches of 50 groups ordered by their last check. SQL scheduling follows the [Supabase Cron documentation](https://supabase.com/docs/guides/cron/quickstart).

Each active/paused accepted group has seven idempotent stages: generation, deadline checks, grace expiration/fee assessment, overdue detection, reminder scheduling, collection readiness and round progression. Unique group/version/stage/minute run keys, transactional group locks, a non-overlapping batch lock and immutable obligation/fee identities prevent duplicate work. A failing group's stages roll back together; other groups continue. Database owners can inspect `private.ce_job_failures` and `cron.job_run_details`. The failed group remains eligible for a later retry.

Reminders are scheduled in-app for upcoming deadlines, the due day and overdue obligations. Keys include obligation, current recipient, reminder kind and effective deadline. Paid, transferred, suspended or extended obligations invalidate pending reminders. Members may dismiss their own reminders. No external email or SMS is sent in this phase.

Round readiness requires complete obligations, settled balances, verified principal collections and the applicable deadline/earlier-round checks. Waived principal remains visible as a funding gap. Readiness does not run a draw, pay a reward, move funds or mark the REPA group complete.

Embedded PostgreSQL does not provide pg_cron. Local tests invoke the exact private runner directly and verify its stages and replay behavior. An authorized collection staff member can also run the scoped **Run deadline checks** action, which uses the same idempotent group runner. Hosted scheduling has not been exercised.

## Access, migration and verification

Apply [20261027071104_phase6_contribution_deadline_engine.sql](supabase/migrations/20261027071104_phase6_contribution_deadline_engine.sql) after all earlier project migrations when deployment is authorized. It preserves existing financial rows and function identities, backfills only supplemental terms, and adds RLS-protected tables with explicit read grants and direct-write denial. It has not been applied online.

Members see obligations currently assigned to them and their payment history. Finance-read staff can inspect their authorized groups; finance-record staff can record verified receipts. Fee waivers, principal waivers, cancellation and extensions require organizer management permission. Scheduler internals are not executable by browser roles. Immutable receipts, rule terms, adjustments and status events cannot be rewritten.

`npm run test:db` exercises the actual project migration/RPC/RLS logic locally. Phase 6 checks include frequencies, leap years/month ends, Manila/UTC cutoffs, exact fees/caps, mixed-method partial payments, disabled-partial and late-reject policies, extensions, fee/principal waivers, cancellations, privacy/MFA/scoped permissions, duplicate job runs and records, accepted-version preservation, readiness/progression and immutable history. Unit tests cover calendar/fee/status arithmetic. Browser fixtures cover the wizard, receipts, history, adjustments and member views in desktop/light and mobile/dark; browser responses are intercepted local fixtures.

Final verification passed: 114 unit/component tests across 17 files, the complete 94-test desktop/mobile browser regression suite, the full embedded PostgreSQL suite (including isolated job failure, rollback and retry), frontend/Edge TypeScript, ESLint, formatting, production build and whitespace checks. Desktop/light and mobile/dark contribution calendars and history dialogs were visually inspected. Local browser servers were managed separately on Windows; the temporary runner configuration was removed afterward.

Stopped after Phase 6.
