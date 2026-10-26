# RepaCircle

Phase 1 — project foundation and UI/UX system. React + TypeScript + Vite with Tailwind CSS, source-owned shadcn/ui primitives, Lucide, React Router, TanStack Query, React Hook Form, Zod, Supabase, Recharts, Sonner, GSAP, Vitest, React Testing Library and Playwright. Resolved dependencies are recorded in `package-lock.json`.

## Start locally

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the URL Vite prints. Without Supabase variables, the application runs in **layout preview** mode. It makes no organization or financial data requests in this mode. Preview each workspace at `/platform-admin/dashboard`, `/organizer/dashboard`, `/treasurer/dashboard`, and `/member/dashboard`. The preview workspace selector changes between these shells. `/design-system` is an interactive component reference with clearly labeled sample, nonfinancial content.

To connect an existing Supabase project, copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell) and set:

- `VITE_SUPABASE_URL`: project HTTPS URL, or a local Supabase HTTP URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: public client key. Never set a service-role or secret key here.

Both variables may be absent for preview. Partial or malformed configuration displays an error and does not create a client. Restart Vite after changing `.env`. Vite variables are public and included in the browser bundle.

Apply `supabase/migrations/202610260001_foundation.sql` to your intended project, using the Supabase SQL editor or a linked CLI with `supabase db push`. For a local stack, `supabase/config.toml` provides the project configuration; `supabase start` requires a running Docker engine. This work does not apply remote migrations automatically.

Configure Supabase Auth's site URL and allowed `/login` and `/reset-password` redirect URLs for your local and deployed origins. Signup confirmation redirects to `https://repacircle.vercel.app/register`; add that exact URL to the hosted Supabase Auth redirect allowlist. Recovery links return to `/reset-password`. Login, registration, recovery request and password update are connected to the Supabase SDK, but hosted email/auth flows require verification with your own configured project.

## Architecture

- `src/app/router/definitions.ts`: shared route metadata; `src/app/router/index.tsx`: centralized lazy route construction, Suspense and route error handling.
- `src/app/layouts`: Public, Auth, Platform Admin, Organizer, Treasurer and Member layouts.
- `src/app/providers`: query client, session, theme, toast and organization-scoped access providers.
- `src/modules`: auth, organization services, four role page modules, public pages, and reserved domain directories for groups, rewards, contributions, payments, payouts, notifications and reports.
- `src/components`: UI primitives, layout/navigation, forms, feedback and data-display components.
- `src/lib`: Supabase client, API error helpers, exact currency parsing, environment validation and class utilities.
- `src/hooks`, `src/types`, `src/styles`: shared hooks, access types and the token system.
- `supabase`: migrations, security tests, configuration and a reserved functions directory.

`@/` resolves to `src/` in Vite, TypeScript and Vitest. `components.json` configures the shadcn/ui new-york source convention, CSS variable theme and aliases. Button uses Radix Slot and class-variance-authority; Input and Label are source-owned primitives. The native dialog component provides focus containment, Escape handling and focus restoration.

## Routes and boundaries

Public: `/`, `/privacy`, `/terms`, `/help`, `/design-system`.

Accounts: `/login`, `/register`, `/forgot-password`, `/reset-password`.

Each workspace's paths, titles and descriptions are defined in `src/app/router/definitions.ts`. Role roots redirect to their dashboards. `/organizations` preserves the existing organization creation/listing flow. Unknown URLs render a useful not-found page; `/roadmap` redirects to setup guidance.

With Supabase configured, workspace content requires authentication. Organization roles are read from the database, scoped to the selected organization. Owner maps to organizer; treasurer maps to treasurer; membership grants the member shell. Platform-admin access stays closed until Phase 2 introduces a server-managed permission source. User-editable metadata is not used for role grants. These frontend boundaries improve navigation; RLS and server authorization remain authoritative. Group-level permissions and complete RBAC are deferred to Phase 2.

## UI system

`src/styles/tokens.css` centralizes semantic colors, status colors, light/dark themes, typography, spacing, radii, shadows and focus indicators. CSS variables also map into Tailwind utilities. Breakpoints are 576, 800 and 1100 pixels; matching TypeScript constants live in `src/styles/breakpoints.ts`.

Theme preference persists in local storage when available. Every authenticated shell includes role navigation, page titles, breadcrumbs, notification disclosure, user menu and a modal mobile navigation panel. Animations respect reduced-motion preferences. Shared components can be exercised at `/design-system`.

Currency input uses exact integer centavo strings and BigInt conversion; it never computes monetary values with floating point. Date/time input represents local wall time; future schedule commands must explicitly resolve a timezone. File selection checks type and size locally and never uploads in this phase; server-side file inspection and Storage policies remain future work. The Recharts activity component supports data and an accessible table fallback, but application dashboards receive no invented activity data.

## Database and security

The retained `create_organization(organization_name, request_id)` RPC atomically creates the organization, owner membership and audit event. Same-input retries return the existing organization; conflicting retries are rejected. RLS restricts organization and membership reads; audit reads require ownership. Client table writes are denied. Security-definer functions use an empty search path. Audit mutation is blocked by a trigger; database administrators can still alter database objects.

This Phase 1 expansion adds no tables, migrations, financial RPCs or Edge Functions. Existing organization behavior and database security tests are preserved.

## Quality checks

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run format` formats source and documentation. GitHub Actions runs formatting, lint, type checking, unit/component tests, embedded PostgreSQL checks, build and browser tests on Node 22. Browser tests expect both Supabase environment variables to be absent. They check all 34 registered pages, navigation, theme persistence, accessible confirmation focus, form validation, filtering, pagination, browser errors and viewport overflow. Coverage includes desktop, mobile, narrow 320px and tablet 768px views. Playwright saves light/dark workspace screenshots under ignored `test-results/`.

`npm run test:db` uses embedded PostgreSQL with a minimal Supabase authentication shim. To verify on a disposable Supabase database, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/foundation.sql`. Fixtures roll back. Embedded verification does not replace hosted Supabase integration testing.

## Deployment and phase boundary

For Vercel, use the Vite preset, `npm run build`, and output directory `dist`. Set the public environment variables and configure Auth redirect allowlists. `vercel.json` supplies SPA routing and basic response security headers. No deployment was performed.

All requested workspace pages are layout shells. Domain records, payment verification, ledger, recipient selection, payouts, integrations, notifications and reports remain unimplemented. No financial transaction is possible through this foundation. Privacy and terms are explicitly marked as drafts for operator review. No service credentials are included.

See `PHASE-1.md` for the completion report and file inventory. Stop after Phase 1; Phase 2 requires a new instruction.
#   r e p a c i r c l e 
 
 
#   r e p a c i r c l e 
 
 
