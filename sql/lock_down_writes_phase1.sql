-- ==========================================
-- PHASE 1 of write lockdown: workout_logs, push_subscriptions
--
-- STATUS: applied to production 2026-08-30.
--
-- Companion to sql/lock_down_reads.sql, which tightened SELECT on these
-- (and other) tables but deliberately left INSERT/UPDATE/DELETE as
-- `USING (true) WITH CHECK (true)` — anyone with the public anon key could
-- write/delete any row, no login required. See the write-lockdown plan for
-- the full table-by-table rollout; these two tables go first because both
-- already have a real fallback that doesn't depend on this policy:
--
--   - workout_logs: saveWorkoutSession() has a full chain — client insert
--     (real bearer token) -> api/save-workout-session.js (service role,
--     bypasses RLS entirely) -> localStorage retry queue.
--   - push_subscriptions: zero client-side direct writers left in src/ —
--     every write goes through api/push.js with the service role key.
--
-- Confirmed live before applying: public.service_role has rolbypassrls =
-- true on this project, so neither of the above server-side paths is
-- affected by this migration at all — only a direct anon-key REST/RPC call
-- (i.e. the actual vulnerability) is affected.
--
-- Policy shape matches each table's own SELECT policy exactly (same three
-- helper functions from sql/lock_down_reads.sql: current_app_user_id(),
-- is_my_client(), is_super_admin()) — proven correct in production for
-- reads on these same tables since 2026-08-08.
--
-- Safe to re-run.
-- ==========================================

-- ─── workout_logs ───
drop policy if exists "workout_logs_insert" on public.workout_logs;
drop policy if exists "workout_logs_update" on public.workout_logs;
drop policy if exists "workout_logs_delete" on public.workout_logs;

create policy "workout_logs_insert" on public.workout_logs for insert with check (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
create policy "workout_logs_update" on public.workout_logs for update using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
) with check (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
create policy "workout_logs_delete" on public.workout_logs for delete using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);

-- ─── push_subscriptions ───
drop policy if exists "push_subscriptions_insert" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update" on public.push_subscriptions;
drop policy if exists "push_subscriptions_delete" on public.push_subscriptions;

create policy "push_subscriptions_insert" on public.push_subscriptions for insert with check (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
create policy "push_subscriptions_update" on public.push_subscriptions for update using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
) with check (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
create policy "push_subscriptions_delete" on public.push_subscriptions for delete using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
