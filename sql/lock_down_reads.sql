-- ==========================================
-- STEP 4: Restrict READS to the right person only
--
-- STATUS: APPLIED to production 2026-08-08 (after restSelect() was fixed to
-- send the caller's session JWT instead of the anon key — see
-- project-restselect-uses-anon-key memory). Verified via curl: anonymous
-- reads on users/workout_logs/body_measurements now return [], exercises
-- (public reference data) still returns rows, and the super-admin
-- escalation block still rejects. Kept idempotent (drops legacy policy
-- names up front) so it's safe to re-run, e.g. against a fresh environment.
--
-- HISTORY, for anyone re-reading this later: the first two attempts to
-- apply this looked like they failed/were reverted, in order:
--   1. Broke login/dashboards in production — restSelect() was still
--      sending the anon key, so auth.uid() was NULL for ~30 read paths and
--      every policy below returned zero rows. Reverted via
--      rollback_lock_down_reads.sql. Fixed by making restSelect() cache
--      and send the real session token (see App.jsx onAuthStateChange).
--   2. Re-run left every table with BOTH the new scoped policy below AND
--      the old permissive one under a different name
--      (*_allow_all_restored, from the rollback), which — since permissive
--      policies OR together — silently kept every table fully open despite
--      the new rules being technically live. The DROP statements below now
--      account for that name too.
--
-- Every table below currently has one blanket policy:
--   FOR ALL USING (true) WITH CHECK (true)
-- meaning anyone with the public anon key can read (and write) every row.
--
-- This migration only tightens READING. For each table, it replaces the one
-- blanket policy with four separate ones:
--   - SELECT: restricted to yourself / your coach / your client / super-admin
--   - INSERT, UPDATE, DELETE: left exactly as permissive as before (true)
-- Writes are intentionally NOT tightened in this pass — see the step-4
-- discussion for why (many write paths have a documented history of subtle
-- bugs; tightening them needs its own careful, tested pass).
--
-- coach_applications already had its own (non-blanket) policies using
-- auth.uid() directly against users.id — which never actually matched,
-- since users.id and auth.uid() are different ids on this project (see
-- add_auth_id_link.sql). Left untouched here since it's out of scope for
-- this pass; flagged separately, not fixed in this file.
-- ==========================================

-- ─── Helper functions ───
-- These query public.users from inside policies defined ON public.users
-- itself, so two things are required to avoid "42P17: infinite recursion
-- detected in policy for relation users" (hit for real on 2026-08-08):
--
--   1. `set row_security = off` — lets the function read without
--      re-triggering the very policy that called it. Safe here: these only
--      ever return a derived value (an id, or true/false), never raw rows.
--   2. `language plpgsql`, NOT `language sql` — the planner INLINES simple
--      sql functions into the calling query, which erases the SECURITY
--      DEFINER boundary and reintroduces the recursion. plpgsql is never
--      inlined, so the boundary actually holds.

create or replace function public.current_app_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result uuid;
begin
  select id into result from public.users where auth_id = auth.uid();
  return result;
end;
$$;

create or replace function public.current_app_coach_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result uuid;
begin
  select coach_id into result from public.users where auth_id = auth.uid();
  return result;
end;
$$;

create or replace function public.is_super_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result boolean;
begin
  select exists (
    select 1 from public.users where auth_id = auth.uid() and role = 'super-admin'
  ) into result;
  return result;
end;
$$;

-- True if target_user_id is a client whose users.coach_id points at me.
create or replace function public.is_my_client(target_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result boolean;
begin
  select exists (
    select 1 from public.users u
    where u.id = target_user_id
      and u.coach_id = public.current_app_user_id()
  ) into result;
  return result;
end;
$$;

-- Defensive cleanup: drop the rollback script's *_allow_all_restored name
-- too, in case this is being re-run after a rollback (see HISTORY above —
-- this exact gap silently kept every table open on 2026-08-08).
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
    execute format('drop policy if exists %I on public.%I', t || '_allow_all_restored', t);
  end loop;
end $$;

-- ─── users ───
drop policy if exists "Allow public read and write access" on public.users;
create policy "users_insert" on public.users for insert with check (true);
create policy "users_update" on public.users for update using (true) with check (true);
create policy "users_delete" on public.users for delete using (true);
-- NB: "your coach" must go through current_app_coach_id(), never an inline
-- `(select ... from public.users ...)` subquery — an inline subquery here
-- bypasses the function boundary and recurses (see helper notes above).
create policy "users_select" on public.users for select using (
  auth_id = auth.uid()                          -- yourself
  or coach_id = public.current_app_user_id()    -- your client (you're their coach)
  or id = public.current_app_coach_id()         -- your coach
  or public.is_super_admin()
);

-- ─── clients ───
drop policy if exists "Allow public access on clients" on public.clients;
create policy "clients_insert" on public.clients for insert with check (true);
create policy "clients_update" on public.clients for update using (true) with check (true);
create policy "clients_delete" on public.clients for delete using (true);
create policy "clients_select" on public.clients for select using (
  user_id = public.current_app_user_id()
  or coach_id = public.current_app_user_id()
  or public.is_super_admin()
);

-- ─── body_measurements ───
drop policy if exists "body_measurements_allow_all" on public.body_measurements;
create policy "body_measurements_insert" on public.body_measurements for insert with check (true);
create policy "body_measurements_update" on public.body_measurements for update using (true) with check (true);
create policy "body_measurements_delete" on public.body_measurements for delete using (true);
create policy "body_measurements_select" on public.body_measurements for select using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);

-- ─── workout_logs ───
drop policy if exists "Allow public read and write access" on public.workout_logs;
create policy "workout_logs_insert" on public.workout_logs for insert with check (true);
create policy "workout_logs_update" on public.workout_logs for update using (true) with check (true);
create policy "workout_logs_delete" on public.workout_logs for delete using (true);
create policy "workout_logs_select" on public.workout_logs for select using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);

-- ─── progress_history ───
drop policy if exists "Allow public read and write access" on public.progress_history;
create policy "progress_history_insert" on public.progress_history for insert with check (true);
create policy "progress_history_update" on public.progress_history for update using (true) with check (true);
create policy "progress_history_delete" on public.progress_history for delete using (true);
create policy "progress_history_select" on public.progress_history for select using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);

-- ─── tracker_logs ───
drop policy if exists "Allow public read and write access" on public.tracker_logs;
create policy "tracker_logs_insert" on public.tracker_logs for insert with check (true);
create policy "tracker_logs_update" on public.tracker_logs for update using (true) with check (true);
create policy "tracker_logs_delete" on public.tracker_logs for delete using (true);
create policy "tracker_logs_select" on public.tracker_logs for select using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);

-- ─── workout_plans ───
drop policy if exists "Allow public read and write access" on public.workout_plans;
create policy "workout_plans_insert" on public.workout_plans for insert with check (true);
create policy "workout_plans_update" on public.workout_plans for update using (true) with check (true);
create policy "workout_plans_delete" on public.workout_plans for delete using (true);
create policy "workout_plans_select" on public.workout_plans for select using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);

-- ─── workout_drafts ───
drop policy if exists "workout_drafts_allow_all" on public.workout_drafts;
create policy "workout_drafts_insert" on public.workout_drafts for insert with check (true);
create policy "workout_drafts_update" on public.workout_drafts for update using (true) with check (true);
create policy "workout_drafts_delete" on public.workout_drafts for delete using (true);
create policy "workout_drafts_select" on public.workout_drafts for select using (
  user_id = public.current_app_user_id()
  or coach_id = public.current_app_user_id()
  or public.is_super_admin()
);

-- ─── push_subscriptions ───
drop policy if exists "Allow public read and write access" on public.push_subscriptions;
create policy "push_subscriptions_insert" on public.push_subscriptions for insert with check (true);
create policy "push_subscriptions_update" on public.push_subscriptions for update using (true) with check (true);
create policy "push_subscriptions_delete" on public.push_subscriptions for delete using (true);
create policy "push_subscriptions_select" on public.push_subscriptions for select using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);

-- ─── coach_notes ───
drop policy if exists "coach_notes_allow_all" on public.coach_notes;
create policy "coach_notes_insert" on public.coach_notes for insert with check (true);
create policy "coach_notes_update" on public.coach_notes for update using (true) with check (true);
create policy "coach_notes_delete" on public.coach_notes for delete using (true);
create policy "coach_notes_select" on public.coach_notes for select using (
  client_id = public.current_app_user_id()
  or coach_id = public.current_app_user_id()
  or public.is_super_admin()
);

-- ─── chat_messages ───
drop policy if exists "Allow public read and write access" on public.chat_messages;
create policy "chat_messages_insert" on public.chat_messages for insert with check (true);
create policy "chat_messages_update" on public.chat_messages for update using (true) with check (true);
create policy "chat_messages_delete" on public.chat_messages for delete using (true);
create policy "chat_messages_select" on public.chat_messages for select using (
  client_id = public.current_app_user_id()
  or public.is_my_client(client_id)
  or public.is_super_admin()
);

-- ─── coaches ───
drop policy if exists "Allow public access on coaches" on public.coaches;
create policy "coaches_insert" on public.coaches for insert with check (true);
create policy "coaches_update" on public.coaches for update using (true) with check (true);
create policy "coaches_delete" on public.coaches for delete using (true);
create policy "coaches_select" on public.coaches for select using (
  user_id = public.current_app_user_id()        -- your own coach profile
  or user_id = public.current_app_coach_id()    -- your assigned coach's profile
  or public.is_super_admin()
);

-- ─── invitations ───
drop policy if exists "Allow public access on invitations" on public.invitations;
create policy "invitations_insert" on public.invitations for insert with check (true);
create policy "invitations_update" on public.invitations for update using (true) with check (true);
create policy "invitations_delete" on public.invitations for delete using (true);
create policy "invitations_select" on public.invitations for select using (
  coach_id = public.current_app_user_id()
  or used_by = public.current_app_user_id()
  or public.is_super_admin()
);
