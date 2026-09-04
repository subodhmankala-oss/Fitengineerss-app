-- ==========================================
-- PHASE 3, BATCH 0 of write lockdown: revoke the destructive grants
--
-- STATUS: applied to production 2026-09-05.
--
-- Continues sql/lock_down_writes_phase1.sql and _phase2.sql, which replaced
-- `USING (true) WITH CHECK (true)` with real ownership checks on six tables
-- (workout_logs, push_subscriptions, body_measurements, tracker_logs,
-- progress_history, chat_messages) on 2026-08-30.
--
-- Nine tables were never reached and still carry the permissive policies:
-- users, clients, coaches, coach_notes, client_payments, invitations,
-- workout_plans, workout_drafts, push_log. This migration does NOT fix those
-- policies — that's the remaining batches. It removes the two grants that
-- make the exposure destructive rather than merely corrupting, and it does so
-- with no code risk at all, because nothing in the codebase calls either
-- operation on these tables.
--
-- ─── Why DELETE, and only on these five ───
-- Audited every write path in src/ before running this. The only four
-- restDelete() calls in the codebase target workout_plans, workout_drafts,
-- client_payments and body_measurements — never users, clients, coaches,
-- coach_notes or invitations. There are no supabase.from().delete() callers
-- (the SDK is bypassed throughout this project anyway), and the only
-- server-side DELETE, in api/complete-onboarding.js, targets
-- push_subscriptions. So the five tables below can lose the grant outright
-- with no caller to break. The tables the app genuinely does delete from are
-- deliberately left alone here and get real ownership policies in a later
-- batch instead.
--
-- ─── Why TRUNCATE matters more than DELETE ───
-- No RLS policy governs TRUNCATE. Not the permissive ones, not the strict
-- ones Phase 1 and 2 installed — row-level security has nothing to say about
-- a statement that removes every row at once. The grant is the ONLY thing
-- standing between the public anon key and an empty table. Revoking DELETE
-- while leaving TRUNCATE in place would have closed the smaller hole and left
-- the larger one open, so both go together, and TRUNCATE goes on all nine
-- rather than just the five. Nothing in the codebase truncates anything.
--
-- ─── service_role is untouched ───
-- Confirmed before applying: service_role still holds DELETE on all five
-- tables. Revoking from anon/authenticated does not affect it, so every api/
-- endpoint keeps working exactly as before — the same property Phase 1 and 2
-- relied on (those noted rolbypassrls; grants are a separate mechanism and
-- are likewise unaffected here).
--
-- Verified after applying, with the public anon key against a filter matching
-- zero rows: DELETE on users / clients / coaches / coach_notes / invitations
-- returns 401, while client_payments and workout_plans still return 204 as
-- expected (they keep the grant until their own batch).
--
-- Safe to re-run.
-- ==========================================

revoke delete on
  public.users,
  public.clients,
  public.coaches,
  public.coach_notes,
  public.invitations
from anon, authenticated;

revoke truncate on
  public.users,
  public.clients,
  public.coaches,
  public.coach_notes,
  public.invitations,
  public.client_payments,
  public.workout_plans,
  public.workout_drafts,
  public.push_log
from anon, authenticated;

-- Sanity check: run this after and share the result. Expect no DELETE and no
-- TRUNCATE on the five identity tables; client_payments, workout_plans and
-- workout_drafts still show DELETE (by design, until their batch lands).
select table_name,
       string_agg(privilege_type, ', ' order by privilege_type) as anon_still_has
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name in (
    'users','clients','coaches','coach_notes','invitations',
    'client_payments','workout_plans','workout_drafts','push_log'
  )
group by table_name
order by table_name;
