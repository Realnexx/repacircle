# Phase 5 — Dynamic Reward Management

Implemented on Phase 4. No hosted Supabase data, schema, Auth, Storage or configuration was changed. The SQL migration belongs to this project; database tests run against isolated embedded PostgreSQL with Supabase Auth/Storage shims.

## Organizer workflow

1. Open **Reward catalog** (`/organizer/rewards`). Choose a template or create a reward. Categories and templates come from the database; the frontend does not switch on category names.
2. Configure Cash, Physical Product, Digital Product, Service, Mixed or Custom rewards. Save an incomplete draft or publish a validated version. Enter genuine prices: starter templates have zero estimates and unknown actual costs.
3. Define custom attributes with the shared field builder: type applicability, conditional visibility, required values, bounds, selections, repeating groups and private file/image uploads. Cash requires a transfer method; other types require a fulfillment method. Refrigerator and motorcycle templates demonstrate custom attributes.
4. Add gallery images/descriptions, inspect exact prices, edit through immutable versions, archive items or save the latest published configuration as an organization template.
5. Save a REPA draft, then open its **Rewards** tab. Assign one reward at every payout, different rewards by round, multiple rewards in a round or cash plus products. Quantities are bundles per recipient. Pooled groups distribute in their final round.
6. Preview allocations, costs and the contribution schedule. Save assignments as a new immutable group rules version. Complete the existing exact-version agreements and activation checks.

Legacy Phase 3 inline rewards remain compatible. Catalog plans replace scalar reward funding only when the rules reference a plan. The wizard links to the saved group's Rewards tab and hides scalar price controls for a bound plan.

## Records and immutable rules

The migration creates the requested `reward_categories`, `reward_templates`, `reward_items`, `reward_attributes`, `reward_images` and `reward_distribution_rules`, with supporting `reward_item_versions`, `reward_item_components` and `reward_plans`. Core metadata, money, quantities, ownership and allocation scope use typed columns. JSONB holds flexible attributes/values, template defaults, expense lists and immutable allocation context.

Thirteen templates cover cash, refrigerator, television, washing machine, smartphone, laptop, motorcycle, groceries, furniture, services, digital products, mixed bundles and custom rewards. Organizers manage their own categories; global starters are read-only.

Each item save creates an immutable version with optimistic revision checks. Mixed bundles pin published, same-organization, same-currency non-mixed versions and require at least two different components. Nested mixed bundles are unsupported. Group snapshots and agreements include pinned component details, attributes, costs and image references. Editing or archiving catalog items cannot rewrite existing plans or financial obligations.

A plan belongs to one saved group and fixes currency, mechanism, member/round counts, rotation order, allocation method and weights. Changing these requires refreshing assignments. Active-group changes use future proposals and fresh member agreement; original accepted rules and historical obligations remain intact.

## Exact pricing and allocation

Money uses integer minor units, browser `BigInt` and PostgreSQL integer/numeric arithmetic. Calculated catalog totals cross the API as decimal strings. Optional actual cost remains unknown instead of becoming zero.

- Unit price × units per bundle, plus shipping and additional expenses per bundle. Mixed component totals multiply by component quantities and mixed units; parent fees apply once per bundle. Component fees appear in the total breakdown without double counting.
- Required funding uses the greater of estimated and known actual component costs. Actual-minus-estimated difference is signed; unknown actual cost propagates through mixed totals.
- Prices/individual expenses are bounded at 1,000,000,000 minor units, units per bundle at 1,000, and mixed component counts at 100. Complete bundles are capped at 1,000,000,000,000 minor units and plans at 1,000,000,000,000,000, preserving exact compatibility with existing group funding fields.
- Every scheduled payout needs an allocation. Currency mismatch, missing payout rounds, duplicate lines, invalid pooled timing and unsupported quantities are rejected. Activation checks both total funding and each round's liquidity.
- Rotation follows configured slots; random selection is previewed without executing a draw. Pooled cash uses largest-remainder minor-unit rounding. Products and mixed rewards allocate whole bundles by the configured weights, with slot order breaking ties. A pooled plan cannot leave any recipient with zero reward value. Whole-product allocations can differ from ideal percentages; inspect the preview before saving.

This phase configures rewards and costs. It does not execute payments, procure products, run draws, ship rewards, deliver digital goods or execute payouts.

## Access and media

Every new table has RLS and explicit grants. Browser clients cannot directly write catalog/version/assignment tables. Verified, profile-complete organizers use the existing MFA-protected group-management permission and validated RPCs. Authorized group viewers can read assigned versions and attachments, while the organizer catalog and unassigned versions remain restricted. Member responses omit later unassigned catalog metadata.

The private `reward-media` bucket accepts PNG/JPEG/WebP, PDF and text up to 2 MB; galleries accept raster images only. Paths are `organization UUID/user UUID/file UUID.extension`. Uploads use the current organizer's path; signed reads expire after 60 seconds. Published attribute/gallery references must resolve to that organization's stored files. Restrictive policies preserve isolation under older broad permissive policies. Browser overwrite/deletion is blocked to preserve accepted references. Unused upload cleanup needs a retention-aware administrative process.

## Local rollout and verification

Apply [20261027055342_phase5_dynamic_rewards.sql](supabase/migrations/20261027055342_phase5_dynamic_rewards.sql) after all existing project migrations when an authorized deployment is scheduled. It has **not** been applied online. It adds a nullable reward-plan reference to rules, preserves function identities used by policies/triggers and retains legacy reward behavior.

`npm run test:db` runs the full migration/upgrade suite and [Phase 5 SQL checks](supabase/tests/phase5.sql): all six types, custom categories/templates, protected/required attributes, exact pricing, mixed components, assignments, shortages, stale revisions, agreement snapshots, activation, future proposals, immutable history, MFA, authorization and storage isolation under a deliberately broad legacy policy.

Unit/component tests cover exact costs, bounds, unknown actual values, conditional attributes, stale plan contexts, whole-bundle rounding and early liquidity. Browser fixtures cover all six types, custom fields/files, image galleries, version history, templates/categories, drafts and group assignments on desktop/light and mobile/dark. Browser APIs are intercepted fixtures; PostgreSQL tests execute the migration/RPC/RLS logic locally. Hosted integration has not been exercised.

Final local verification passed: 94 unit/component tests across 16 files, the complete 86-test desktop/mobile browser suite, an 18-test reward-only rerun after final display refinements, the complete embedded PostgreSQL suite, frontend/Edge TypeScript, ESLint, formatting, production build and whitespace checks. Desktop/light and mobile/dark reward plans were visually inspected. Browser test servers were managed separately on Windows; the temporary runner configuration was removed afterward.

Stopped after Phase 5.
