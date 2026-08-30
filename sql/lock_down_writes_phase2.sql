-- ==========================================
-- PHASE 2 of write lockdown: body_measurements, tracker_logs,
-- progress_history, chat_messages
--
-- STATUS: applied to production 2026-08-30, after api/save-user-data.js
-- (service-role fallback for these four tables' self-service writes) was
-- deployed and verified live.
--
-- Same shape as Phase 1 (sql/lock_down_writes_phase1.sql): replaces
-- `USING (true) WITH CHECK (true)` with the same ownership check each
-- table's own SELECT policy already uses (sql/lock_down_reads.sql).
--
-- service_role (rolbypassrls = true, confirmed 2026-08-30) is unaffected —
-- api/save-user-data.js is the fallback path for all four tables now.
--
-- Safe to re-run.
-- ==========================================

-- ─── body_measurements ───
drop policy if exists "body_measurements_insert" on public.body_measurements;
drop policy if exists "body_measurements_update" on public.body_measurements;
drop policy if exists "body_measurements_delete" on public.body_measurements;

create policy "body_measurements_insert" on public.body_measurements for insert with check (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
create policy "body_measurements_update" on public.body_measurements for update using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
) with check (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
create policy "body_measurements_delete" on public.body_measurements for delete using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);

-- ─── tracker_logs ───
drop policy if exists "tracker_logs_insert" on public.tracker_logs;
drop policy if exists "tracker_logs_update" on public.tracker_logs;
drop policy if exists "tracker_logs_delete" on public.tracker_logs;

create policy "tracker_logs_insert" on public.tracker_logs for insert with check (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
create policy "tracker_logs_update" on public.tracker_logs for update using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
) with check (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
create policy "tracker_logs_delete" on public.tracker_logs for delete using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);

-- ─── progress_history ───
drop policy if exists "progress_history_insert" on public.progress_history;
drop policy if exists "progress_history_update" on public.progress_history;
drop policy if exists "progress_history_delete" on public.progress_history;

create policy "progress_history_insert" on public.progress_history for insert with check (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
create policy "progress_history_update" on public.progress_history for update using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
) with check (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);
create policy "progress_history_delete" on public.progress_history for delete using (
  user_id = public.current_app_user_id()
  or public.is_my_client(user_id)
  or public.is_super_admin()
);

-- ─── chat_messages ───
drop policy if exists "chat_messages_insert" on public.chat_messages;
drop policy if exists "chat_messages_update" on public.chat_messages;
drop policy if exists "chat_messages_delete" on public.chat_messages;

create policy "chat_messages_insert" on public.chat_messages for insert with check (
  client_id = public.current_app_user_id()
  or public.is_my_client(client_id)
  or public.is_super_admin()
);
create policy "chat_messages_update" on public.chat_messages for update using (
  client_id = public.current_app_user_id()
  or public.is_my_client(client_id)
  or public.is_super_admin()
) with check (
  client_id = public.current_app_user_id()
  or public.is_my_client(client_id)
  or public.is_super_admin()
);
create policy "chat_messages_delete" on public.chat_messages for delete using (
  client_id = public.current_app_user_id()
  or public.is_my_client(client_id)
  or public.is_super_admin()
);
