-- ==========================================
-- PHASE 3, BATCH 2 of write lockdown: workout_drafts, workout_plans,
-- invitations
--
-- STATUS: applied to production 2026-09-05.
--
-- Continues sql/lock_down_writes_phase1.sql and _phase2.sql (six tables,
-- 2026-08-30) and sql/lock_down_writes_phase3_batch0.sql (revoked the
-- destructive grants). This is the first batch of Phase 3 to replace actual
-- policies, so each table's write rules below mirror the ownership check that
-- table's OWN select policy already uses — the same shape proven in
-- production by Phase 1 and 2.
--
-- ─── Why push_log is NOT in this batch ───
-- It was originally scoped here (its insert policy is WITH CHECK (true)),
-- then dropped on inspection: api/push.js builds its client with the ANON key
-- (line 34, createClient(supabaseUrl, anonKey)) and passes that same client
-- into logPushSend(). Locking the insert would kill push logging silently —
-- silently, because logPushSend only ever console.warns on failure. It needs
-- api/push.js switched to a service-role client FIRST, which is the same
-- "ship the fallback before the policy" discipline Phase 1 and 2 followed.
-- Left permissive on purpose until then; it is the lowest-severity table in
-- the set (log rows only, and its select is already super-admin-only).
--
-- ─── Verified, by impersonating real users in rolled-back transactions ───
-- (set local role authenticated; set local request.jwt.claims to their
-- auth_id; attempt the actual write; rollback)
--
-- Legitimate writes still ALLOWED:
--   * coach a1f84237 minting their own invite code;
--   * client 4c63ccd4 upserting their own workout draft;
--   * coach a1f84237 assigning a workout plan to their own client;
--   * the fixed invite revert (used/used_at cleared, used_by kept).
--
-- Illegitimate writes now BLOCKED:
--   * anon key inserting an invitation -> 401 / 42501;
--   * anon key updating a real workout plan -> 0 rows (RLS filters it out;
--     tested with a no-op write of the row's existing value);
--   * unrelated coach fddbaa2a -> false on every predicate: cannot write that
--     client's plans, cannot touch another coach's invitations.
--
-- ─── Paths that bypass RLS entirely and are therefore unaffected ───
--   * link_coach_and_enter_transaction() is SECURITY DEFINER (confirmed), so
--     the whole connect-to-coach invite flow is untouched by the invitations
--     rules below.
--   * api/save-workout-draft.js already backstops saveWorkoutDraft() with the
--     service role — that fallback predates this migration and exists
--     precisely because the client-side upsert can be refused.
--
-- Safe to re-run. Rollback block at the bottom.
-- ==========================================

-- ─── workout_drafts ───
-- Mirrors workout_drafts_select exactly: the draft's owner, the coach driving
-- a coach-led session for them, or the super admin.
drop policy if exists "workout_drafts_insert" on public.workout_drafts;
drop policy if exists "workout_drafts_update" on public.workout_drafts;
drop policy if exists "workout_drafts_delete" on public.workout_drafts;

create policy "workout_drafts_insert" on public.workout_drafts for insert with check (
  user_id = public.current_app_user_id()
  or coach_id = public.current_app_user_id()
  or public.is_super_admin()
);
create policy "workout_drafts_update" on public.workout_drafts for update using (
  user_id = public.current_app_user_id()
  or coach_id = public.current_app_user_id()
  or public.is_super_admin()
) with check (
  user_id = public.current_app_user_id()
  or coach_id = public.current_app_user_id()
  or public.is_super_admin()
);
create policy "workout_drafts_delete" on public.workout_drafts for delete using (
  user_id = public.current_app_user_id()
  or coach_id = public.current_app_user_id()
  or public.is_super_admin()
);

-- ─── workout_plans ───
-- Mirrors workout_plans_select exactly. Covers both real writers:
-- saveWorkoutPlan() assigning to a client (is_my_client), and the Live Log
-- saving a plan onto the coach's own row (user_id = self).
drop policy if exists "workout_plans_insert" on public.workout_plans;
drop policy if exists "workout_plans_update" on public.workout_plans;
drop policy if exists "workout_plans_delete" on public.workout_plans;

create policy "workout_plans_insert" on public.workout_plans for insert with check (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
create policy "workout_plans_update" on public.workout_plans for update using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
) with check (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
create policy "workout_plans_delete" on public.workout_plans for delete using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);

-- ─── invitations ───
-- UPDATE mirrors invitations_select. INSERT and DELETE are deliberately
-- NARROWER than it (coach only, dropping the "used_by = me" arm): if minting
-- an invite were allowed on that arm, any authenticated user could create a
-- code attached to any coach_id they liked, which is worse than the hole this
-- migration closes. Nothing in the app deletes invitations at all (batch 0
-- revoked the grant), so DELETE being coach-only is belt and braces.
--
-- ─── A pre-existing bug this batch uncovered (NOT caused by it) ───
-- The revert path — updateInvitationUsage(code, false), called by
-- linkCoachAndEnterTransaction when its post-transaction verification fails —
-- used to write used_by back to NULL. That write has been failing with 42501
-- since reads were locked down in August, because Postgres refuses an UPDATE
-- whose NEW row would fall outside the table's SELECT policy: nulling used_by
-- makes the row invisible to the very client doing the write.
--
-- This was reproduced on a scratch table with the same policy shape, and
-- crucially it fails under the OLD `USING (true) WITH CHECK (true)` update
-- policy too — so the write lockdown neither caused it nor can fix it. A
-- first attempt to accommodate it here (an extra `used_by is null` arm in
-- WITH CHECK) does not work for the same reason and was removed in the
-- follow-up migration phase3_batch2_drop_dead_usedby_null_arm, since a dead
-- arm that implies it enables something it does not is worse than no arm.
--
-- The actual fix is client-side: updateInvitationUsage() now clears only
-- used/used_at and leaves used_by in place, which keeps the row visible and
-- still makes the code reusable (every reuse check filters on used, never on
-- used_by). Verified: the revert succeeds under these policies.
drop policy if exists "invitations_insert" on public.invitations;
drop policy if exists "invitations_update" on public.invitations;
drop policy if exists "invitations_delete" on public.invitations;

create policy "invitations_insert" on public.invitations for insert with check (
  coach_id = public.current_app_user_id()
  or public.is_super_admin()
);
create policy "invitations_update" on public.invitations for update using (
  coach_id = public.current_app_user_id()
  or used_by = public.current_app_user_id()
  or public.is_super_admin()
) with check (
  coach_id = public.current_app_user_id()
  or used_by = public.current_app_user_id()
  or public.is_super_admin()
);
create policy "invitations_delete" on public.invitations for delete using (
  coach_id = public.current_app_user_id()
  or public.is_super_admin()
);

-- Sanity check: run this after and share the result. Every row should show a
-- real expression, never a bare "true".
select tablename, policyname, cmd,
       coalesce(qual, '-')       as using_expr,
       coalesce(with_check, '-') as check_expr
from pg_policies
where schemaname = 'public'
  and tablename in ('workout_drafts','workout_plans','invitations')
  and cmd in ('INSERT','UPDATE','DELETE')
order by tablename, cmd;

-- ==========================================
-- ROLLBACK (only if a legitimate write turns out to be refused). Restores the
-- permissive policies exactly as they were before this migration.
-- ==========================================
-- drop policy if exists "workout_drafts_insert" on public.workout_drafts;
-- drop policy if exists "workout_drafts_update" on public.workout_drafts;
-- drop policy if exists "workout_drafts_delete" on public.workout_drafts;
-- create policy "workout_drafts_insert" on public.workout_drafts for insert with check (true);
-- create policy "workout_drafts_update" on public.workout_drafts for update using (true) with check (true);
-- create policy "workout_drafts_delete" on public.workout_drafts for delete using (true);
-- drop policy if exists "workout_plans_insert" on public.workout_plans;
-- drop policy if exists "workout_plans_update" on public.workout_plans;
-- drop policy if exists "workout_plans_delete" on public.workout_plans;
-- create policy "workout_plans_insert" on public.workout_plans for insert with check (true);
-- create policy "workout_plans_update" on public.workout_plans for update using (true) with check (true);
-- create policy "workout_plans_delete" on public.workout_plans for delete using (true);
-- drop policy if exists "invitations_insert" on public.invitations;
-- drop policy if exists "invitations_update" on public.invitations;
-- drop policy if exists "invitations_delete" on public.invitations;
-- create policy "invitations_insert" on public.invitations for insert with check (true);
-- create policy "invitations_update" on public.invitations for update using (true) with check (true);
-- create policy "invitations_delete" on public.invitations for delete using (true);
