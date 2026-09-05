-- ==========================================
-- PHASE 3, BATCH 4 of write lockdown: users, clients, coaches
--
-- STATUS: applied to production 2026-09-05.
--
-- The last batch of the write lockdown (see the Phase 3 audit). Same
-- discipline as batches 2 and 3: policies built from each table's own
-- ownership model, then every real write path exercised against real rows
-- before touching production. This is the highest-risk batch — these three
-- tables are what signup, onboarding, and every login path write to — so
-- every candidate policy was dry-run FIRST inside a transaction that also
-- rolled back the temporary policy swap itself, meaning production's live
-- policies were never even momentarily replaced with an untested one. Only
-- once every case below was confirmed correct was the real migration applied.
--
-- ─── Why users needs a different self-check than clients/coaches ───
-- users_select (sql/lock_down_reads.sql) uses `auth_id = auth.uid()` directly
-- for the self-arm, NOT `current_app_user_id() = id` — and that turns out to
-- be load-bearing, not stylistic. current_app_user_id() resolves identity by
-- SELECTing the caller's own row out of `users` by auth_id. For a brand-new
-- signup's INSERT into `users`, that row does not exist yet at the moment the
-- policy is evaluated — a nested SELECT inside a WITH CHECK cannot see the
-- tuple currently being inserted by the same statement. This was proven by
-- deliberately building the wrong version
-- (`current_app_user_id() is not null`) and watching a real brand-new
-- signup get rejected with 42501 (see verification log below) precisely
-- because current_app_user_id() had nothing to find yet and returned NULL.
-- users_insert/update/delete all use `auth_id = auth.uid()` directly for
-- exactly this reason. clients and coaches don't have this problem — a
-- client/coach row is only ever created once the owning users row already
-- exists, so current_app_user_id() has something to resolve by then.
--
-- ─── Why the trigger-timing question mattered ───
-- The users row inserted by saveUserProfile's restUpsert('users', { email },
-- 'email') carries no auth_id in the payload — trg_link_new_user_auth_id
-- (BEFORE INSERT) looks it up from auth.users by matching email and fills it
-- in. Postgres evaluates an INSERT's WITH CHECK against the row AS MODIFIED
-- BY BEFORE ROW TRIGGERS, not the payload as sent — confirmed for real
-- against a genuine auth.users account with no public.users row yet (see
-- below), not just asserted from documentation.
--
-- ─── Why coaches/clients need is_super_admin() but not is_my_client() ───
-- Every real coaches/clients write is either the row's own owner (self) or
-- the super admin managing someone else's row (approveCoach, rejectCoach,
-- setCoachBlocked, saveCoachProfile all target ANOTHER user's users/coaches
-- row) — audited every restUpsert/restUpdate/restInsert call site in
-- databaseService.js against these three tables to confirm this before
-- writing a single policy. No real code ever has a coach write directly to a
-- CLIENT's clients row (the total_sessions/program_dates equivalents are
-- SECURITY DEFINER RPCs — set_client_total_sessions, set_client_program_dates,
-- link_coach_and_enter_transaction — confirmed, and therefore bypass RLS
-- entirely regardless of what's written here), so clients_insert/update/
-- delete deliberately have no is_my_client() arm: adding one would grant a
-- capability nothing in the app uses, on the table with the most sensitive
-- per-client data in the schema.
--
-- Safe to re-run. Rollback block at the bottom.
-- ==========================================

-- ─── users ───
drop policy if exists "users_insert" on public.users;
drop policy if exists "users_update" on public.users;
drop policy if exists "users_delete" on public.users;

create policy "users_insert" on public.users for insert with check (
  auth_id = auth.uid() or public.is_super_admin()
);
create policy "users_update" on public.users for update using (
  auth_id = auth.uid() or public.is_super_admin()
) with check (
  auth_id = auth.uid() or public.is_super_admin()
);
create policy "users_delete" on public.users for delete using (
  auth_id = auth.uid() or public.is_super_admin()
);

-- ─── clients ───
drop policy if exists "clients_insert" on public.clients;
drop policy if exists "clients_update" on public.clients;
drop policy if exists "clients_delete" on public.clients;

create policy "clients_insert" on public.clients for insert with check (
  user_id = public.current_app_user_id() or public.is_super_admin()
);
create policy "clients_update" on public.clients for update using (
  user_id = public.current_app_user_id() or public.is_super_admin()
) with check (
  user_id = public.current_app_user_id() or public.is_super_admin()
);
create policy "clients_delete" on public.clients for delete using (
  user_id = public.current_app_user_id() or public.is_super_admin()
);

-- ─── coaches ───
drop policy if exists "coaches_insert" on public.coaches;
drop policy if exists "coaches_update" on public.coaches;
drop policy if exists "coaches_delete" on public.coaches;

create policy "coaches_insert" on public.coaches for insert with check (
  user_id = public.current_app_user_id() or public.is_super_admin()
);
create policy "coaches_update" on public.coaches for update using (
  user_id = public.current_app_user_id() or public.is_super_admin()
) with check (
  user_id = public.current_app_user_id() or public.is_super_admin()
);
create policy "coaches_delete" on public.coaches for delete using (
  user_id = public.current_app_user_id() or public.is_super_admin()
);

-- ==========================================
-- VERIFIED — every case below was dry-run inside a transaction that ALSO
-- rolled back the temporary policy swap, before the real migration above was
-- ever applied. Legitimate cases were confirmed with RETURNING or a
-- super-admin re-check afterward (a bare "it printed a message" is not
-- proof — the first pass at this batch caught its own false positive that
-- way: a blocked UPDATE returns success with zero rows silently, so a
-- verification query that doesn't check row identity can pass even when the
-- write did nothing).
--
-- Legitimate writes ALLOWED:
--   * a REAL brand-new signup — an actual auth.users account
--     (testbot_20260606_1844@gmail.com) with no public.users row yet —
--     inserting itself via the exact restUpsert('users',{email},'email')
--     shape saveUserProfile sends;
--   * that same upsert hitting an EXISTING row instead (ON CONFLICT DO
--     UPDATE), governed by users_update, not users_insert;
--   * ordinary coach 42f47639 (non-super-admin) editing their own users row
--     and their own coaches row (saveCoachSelfProfile);
--   * that coach's real client (585fdbde) updating their own clients row
--     (weight_kg sync from a logged body measurement);
--   * super-admin 07f8515b editing ANOTHER user's users row (saveCoachProfile
--     / approveCoach's role='coach' write) and ANOTHER coach's coaches row
--     (setCoachBlocked / rejectCoach);
--   * super-admin inserting a NEW coaches row for a real applicant
--     (b2918a8d, a client with no coaches row) — approveCoach's shape.
--
-- Illegitimate writes BLOCKED, confirmed from a super-admin's omniscient
-- view afterward (not just the attacker's own now-narrower select):
--   * an unrelated coach (fddbaa2a) editing another coach's users row —
--     full_name genuinely unchanged;
--   * a coach inserting a coaches row for a DIFFERENT user_id (impersonating
--     someone else as a coach) — 42501, outright rejected;
--   * a coach editing a clients row that isn't their own user_id — untouched;
--   * the anon key: INSERT on users returns 401/42501; UPDATE against real
--     rows on all three tables (no-op writes of their own existing values)
--     returns 200 with zero rows affected.
--
-- A deliberately WRONG candidate policy
-- (`current_app_user_id() is not null` instead of `auth_id = auth.uid()`)
-- was also dry-run and confirmed to break the brand-new-signup case with
-- 42501 — see the comment block above for why.
--
-- Live app smoke-tested after applying: loads and renders normally.
-- ==========================================

-- ==========================================
-- ROLLBACK (only if a legitimate write turns out to be refused). Restores the
-- permissive policies exactly as they were before this migration.
-- ==========================================
-- drop policy if exists "users_insert" on public.users;
-- drop policy if exists "users_update" on public.users;
-- drop policy if exists "users_delete" on public.users;
-- create policy "users_insert" on public.users for insert with check (true);
-- create policy "users_update" on public.users for update using (true) with check (true);
-- create policy "users_delete" on public.users for delete using (true);
-- drop policy if exists "clients_insert" on public.clients;
-- drop policy if exists "clients_update" on public.clients;
-- drop policy if exists "clients_delete" on public.clients;
-- create policy "clients_insert" on public.clients for insert with check (true);
-- create policy "clients_update" on public.clients for update using (true) with check (true);
-- create policy "clients_delete" on public.clients for delete using (true);
-- drop policy if exists "coaches_insert" on public.coaches;
-- drop policy if exists "coaches_update" on public.coaches;
-- drop policy if exists "coaches_delete" on public.coaches;
-- create policy "coaches_insert" on public.coaches for insert with check (true);
-- create policy "coaches_update" on public.coaches for update using (true) with check (true);
-- create policy "coaches_delete" on public.coaches for delete using (true);
