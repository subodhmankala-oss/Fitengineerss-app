# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FitEngineers — a React + Vite single-page fitness coaching PWA. Coaches manage clients, assign workouts, and clients track water/protein/calories/workouts day-to-day. Backend is Supabase (Postgres + Auth), with a handful of Vercel serverless functions in `api/` for operations that need the service-role key or must survive a known Supabase JS SDK hang (see "The SDK-hang workaround" below — this shapes a lot of the code).

## Commands

```bash
npm run dev       # Vite dev server (port 5173)
npm run build     # production build
npm run preview   # preview a production build
npm run lint      # ESLint (flat config, eslint.config.js)
```

There is no test suite/runner configured (no `test` script, no `*.test.*`/`*.spec.*` files). The root-level `test_*.js` and `query_users.js` / `remove_test_users.js` / `repair_data.js` files are one-off Node scripts for inspecting/repairing the live Supabase database (run with `node <file>.js`), not part of an automated suite — they read `.env` directly via `fs`, not Vite env injection.

Deployment is Vercel (`vercel.json`): rewrites `/api/*` to serverless functions and `/reset-password` + `/auth/confirm` to `index.html` (client-side routing for those two paths), plus a daily cron hitting `/api/send-nudges`.

## Environment variables

Required in `.env` for local dev (Vite-exposed, `VITE_` prefix required for client-side access):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — without these, `isSupabaseConfigured` is false and `databaseService` silently falls back to a `localStorage`-backed mock DB (see below). Useful for UI-only work without touching the real database.
- `VITE_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Web Push for lock-screen nudges.

Server-only (Vercel functions in `api/`, not Vite-exposed): `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_KEY`. Several `api/*.js` files have hardcoded fallback URL/anon-key values in their source as a "works even if env is misconfigured" safety net — when editing those files, don't assume `process.env` is the only source of truth, and note that some fallbacks point at a different Supabase project than the one in `.env` (leftover from an earlier project migration).

## Architecture

### No router — one big `App.jsx`

There's no `react-router`. `src/App.jsx` (~1500 lines) is the entire app shell: it owns all top-level state (`onboardingComplete`, `userRole`, `activeTab`, etc.), the Supabase `onAuthStateChange` listener that resolves a logged-in session into a role, and conditionally renders one of `Onboarding` / `ClientOnboardingWizard` / role dashboards / tracker tabs based on plain state, not URL routes. Two exceptions read `window.location.pathname`/`hash` directly for cases that must work outside the SPA shell: `/auth/confirm` (email confirmation links, handled by `AuthConfirm.jsx`) and `/reset-password` (handled by `ResetPasswordPage.jsx`), plus an inline "expired link" screen for `#error=access_denied`/`otp_expired` hashes.

Role resolution (`isAdmin` / `isCoach` in `App.jsx`) combines `isSuperAdmin(email)` (hardcoded to `subodhmankala@gmail.com`), a hardcoded `TRAINER_EMAILS` allowlist in `databaseService.js`, and the `role` column fetched from the DB — there's no route guard layer, just conditional JSX.

### State model: `localStorage` is the real client-side store

Almost all UI state (today's water/calories/macros, workout sessions, active tab, user profile fields) lives in `localStorage`, not React context or a store library. `databaseService.js` writes to `localStorage` on every call regardless of whether Supabase succeeds, and most components read `localStorage` directly (via `getItem`/`window.dispatchEvent(new Event('...Updated'))` for cross-component sync rather than shared state). When adding a feature that touches tracked data, follow this pattern: write to Supabase (if configured) *and* `localStorage`, and dispatch the matching custom event (`waterUpdated`, `stepsUpdated`, `nutritionUpdated`, etc.) so other mounted components pick up the change.

`App.jsx` also does day-rollover bookkeeping (`checkAndHandleDateRollover`, `archiveYesterdayStats`, `resetDailyLogs`) and per-client `localStorage` namespacing (`saveActiveUserCache`/`loadActiveUserCache`, keyed by `client_<lowercased-name-no-spaces>_*`) so switching logged-in users on the same device doesn't bleed one person's tracker data into another's.

### `src/services/databaseService.js` — the actual data layer

This is the file to read before touching any data flow; it's ~3200 lines and every component goes through it (not through raw `supabase.from()` calls, with rare exceptions). Key things to know:

- **Dual-layer by design**: every write method tries Supabase first, then *always* also writes `localStorage`/a `mock_*` table fallback, so the app keeps working with `.env` unset.
- **Actual schema differs from `docs/`** (see below) — real tables are `users`, `coaches`, `clients`, `workout_logs`, `tracker_logs`, `progress_history`, `push_subscriptions`, `email_events`, not the `coach_profiles`/`coach_applications`/`workout_plans`/`subscriptions`/`payments` schema described in `docs/BACKEND_ARCHITECTURE.md`. There is also no coach-approval workflow in the live code — any row in `coaches` makes someone an active coach; approval/pending states described in the docs aren't implemented.
- **The SDK-hang workaround**: this project's Supabase JS SDK reliably hangs (never resolves or rejects) on `.from().select()`, `.rpc()`, and `auth.signInWithPassword()` when the auth token needs a refresh. The fix used throughout is to bypass the SDK and hit PostgREST/GoTrue directly via `fetch` with an `AbortController` timeout — see `restSelect`, `restRpc`, `restUpdate` at the top of `databaseService.js`, and the raw-fetch `signIn()`. **When adding a new read/write that's on a critical user-facing path (login, dashboard load, workout logging), prefer these raw-fetch helpers over `supabase.from()`/`supabase.rpc()`** — plain SDK calls are still used off the critical path but have caused real "stuck on Connecting..." bugs.
- **Canonical user ID resolution**: `localStorage.userId` can get "poisoned" with the Supabase auth UID instead of the real `public.users.id` (they're different UUIDs on this project). Always resolve via `resolveCanonicalUserId()`/`databaseService.resolveUserId()` before a `user_id`-keyed query if there's any chance the cached value is stale — several past bugs (clients seeing "Connect to coach" forever, cross-account data leaks) trace back to trusting the cached ID directly.
- **Never resolve a display name to a user ID for data reads.** `getWorkoutLogsForUser` fails closed (returns `[]`) on a non-UUID input on purpose — name-based lookups are ambiguous (e.g. multiple "Warrior" placeholder names) and previously leaked one client's data to another.

### `docs/` and `enhancedDatabaseService.js` / most of `accessControl.js` are aspirational, not current

`docs/BACKEND_ARCHITECTURE.md` and `docs/IMPLEMENTATION_GUIDE.md` describe a more elaborate RBAC system (coach approval workflow, audit logs, `/api/admin|coach|client/*` REST API, a different DB schema) that was designed but never wired into the running app. `src/services/enhancedDatabaseService.js` implements pieces of it but **is not imported anywhere** in `src/`. Likewise most of `src/services/accessControl.js` (`isApprovedCoach`, `canAccessRoute`, `checkRole`, audit logging, etc.) is unused — only `isSuperAdmin` is actually imported (by `App.jsx`). Treat these as reference/future-direction material, not ground truth for how access control currently works; the real logic is the inline role checks in `App.jsx` and `databaseService.js` described above. If you're asked to implement something these docs describe, confirm with the user whether they want the documented design built for real or just want the current behavior extended.

### SQL files

Root-level `supabase_*.sql` files and `sql/*.sql` are ad hoc migrations applied manually via the Supabase SQL editor — there's no migration runner/ordering convention. When adding a schema change, add a new descriptively-named `.sql` file rather than editing an old one, and check `databaseService.js` for a matching PostgREST "column not found" fallback pattern (see `saveWorkoutSession`'s handling of `set_type`/`duration_seconds`/`calories_burned` retry-without-new-columns) if the new column is read on a hot path before every environment has run the migration.

### Components

`src/components/*.jsx` + matching `*.css` (one stylesheet per component, no CSS modules/Tailwind/styled-components). Notable ones: `Onboarding.jsx` (initial login/signup + legacy client onboarding), `ClientOnboardingWizard.jsx` (newer 4-step wizard, gated by `onboarding_completed`), `TrainerDashboard.jsx` / `AdminDashboard.jsx` (coach/admin views), `HomeTracker.jsx` + `WorkoutTracker.jsx` + `NutritionTracker.jsx` (client daily tracking). `src/data/exerciseLibrary.js` is the single shared exercise list used by both the client workout logger and the coach's live-log picker — keep it as the one source of truth rather than duplicating exercise lists.

### Push notifications

Two independent mechanisms: (1) client-side `setInterval`/`visibilitychange` handlers in `App.jsx` that fire local browser notifications (hourly nudges, lock/unlock posture checks) purely from `localStorage` state — no server round trip; (2) real Web Push via `public/sw.js` + `api/subscribe.js`/`api/send-nudges.js`/`api/test-nudge.js`, triggered by the Vercel cron for actual lock-screen notifications when the app isn't open. Don't conflate the two when debugging a "notification didn't fire" report — check which path applies first.
