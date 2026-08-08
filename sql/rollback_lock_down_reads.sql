-- ==========================================
-- ROLLBACK of lock_down_reads.sql  — RUN THIS NOW IF THE LIVE APP IS BROKEN
-- Paste into Supabase SQL Editor and run.
--
-- WHY: lock_down_reads.sql restricted SELECT to auth.uid()-based rules, but
-- ~30 read paths in the app (databaseService.js restSelect()) authenticate
-- with the ANON KEY as the bearer token, not the logged-in user's session
-- JWT. To the database those requests are anonymous, so the new SELECT
-- policies correctly return zero rows — breaking login, client home, coach
-- dashboards and invite-code signup for real users.
--
-- This restores the previous permissive read behaviour (back to how prod
-- ran before step 4). It deliberately does NOT undo:
--   - prevent_super_admin_escalation.sql  (admin takeover fix — keep it)
--   - add_auth_id_link.sql / keep_auth_id_linked.sql  (auth_id plumbing,
--     harmless and needed for the real fix later)
--
-- The proper fix is to make restSelect() send the user's session token
-- instead of the anon key, then re-apply the read lockdown. That is app-code
-- work and needs its own tested pass.
-- ==========================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'clients', 'body_measurements', 'workout_logs',
    'progress_history', 'tracker_logs', 'workout_plans', 'workout_drafts',
    'push_subscriptions', 'coach_notes', 'chat_messages', 'coaches',
    'invitations'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for all using (true) with check (true)',
      t || '_allow_all_restored', t
    );
  end loop;
end $$;

-- Verify: every table below should show one *_allow_all_restored policy.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
