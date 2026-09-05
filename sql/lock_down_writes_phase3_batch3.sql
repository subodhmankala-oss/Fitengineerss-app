-- ==========================================
-- PHASE 3, BATCH 3 of write lockdown: coach_notes, client_payments
--
-- STATUS: applied to production 2026-09-05.
--
-- Continues sql/lock_down_writes_phase3_batch2.sql (workout_drafts,
-- workout_plans, invitations). Same discipline: each table's write rules are
-- built from the ownership check its OWN select policy already uses, then
-- every real write path is exercised by impersonating real users in
-- rolled-back transactions before touching production for real.
--
-- Live row counts at the time this was written: 195 coach_notes, 21
-- client_payments — this is real production data, not an empty table. Every
-- verification below runs inside `begin; ... rollback;` for exactly that
-- reason; nothing here was tested by writing and cleaning up afterward.
--
-- ─── Why both tables get an extra check the table's select policy lacks ───
-- coach_notes_select and client_payments_select are both
-- `client_id = me OR coach_id = me OR is_super_admin()` (client_payments has
-- no client-side writer, so its INSERT/UPDATE/DELETE only need the coach_id
-- arm — see below). A straight mirror of the select policy on INSERT would
-- let a coach attach ANY client_id to a row as long as coach_id = themselves,
-- with no check that the client is actually theirs. Because both tables'
-- select policies grant client_id = me visibility, that isn't just a data
-- integrity problem: a coach could insert a coach_note or a client_payment
-- with someone else's client_id, and that victim client would genuinely see
-- the spoofed row show up as if it were real, coming from a coach who has no
-- relationship to them at all. INSERT therefore adds
-- `and is_my_client(client_id)` — the same helper workout_plans_insert
-- already relies on (batch 2) to require the row's user_id actually belong to
-- the calling coach.
--
-- ─── coach_notes: a genuinely two-sided conversation ───
-- Three real functions write to the SAME row from two different actors, so
-- UPDATE has to allow both, exactly mirroring the select policy:
--   * markCoachNoteRead (client sets read_at) and saveClientReplyToNote
--     (client sets client_reply/client_reply_at) run as the CLIENT.
--   * markClientReplySeen (coach sets coach_seen_reply_at) runs as the COACH.
-- DELETE is coach-only — nothing in the app deletes a coach_notes row at all
-- (and batch 0 already revoked the grant entirely), so this is belt and
-- braces, matching invitations_delete's treatment in batch 2.
--
-- ─── client_payments: coach-only on every write ───
-- addClientPayment/updateClientPayment/deleteClientPayment are all called by
-- the coach; the client this ledger is ABOUT never writes to it (their
-- payment_status on `users` is a separate mechanism entirely — see
-- addClientPayment's own comment). So UPDATE/DELETE only need the coach_id
-- arm, not a client_id one. updateClientPayment's own comment records that it
-- never edits client_id/coach_id ("moving a payment to a different client is
-- a delete + re-log, not an edit"), so mirroring USING in WITH CHECK is safe.
--
-- Safe to re-run. Rollback block at the bottom.
-- ==========================================

-- ─── coach_notes ───
drop policy if exists "coach_notes_insert" on public.coach_notes;
drop policy if exists "coach_notes_update" on public.coach_notes;
drop policy if exists "coach_notes_delete" on public.coach_notes;

create policy "coach_notes_insert" on public.coach_notes for insert with check (
  (coach_id = public.current_app_user_id() and public.is_my_client(client_id))
  or public.is_super_admin()
);
create policy "coach_notes_update" on public.coach_notes for update using (
  client_id = public.current_app_user_id()
  or coach_id = public.current_app_user_id()
  or public.is_super_admin()
) with check (
  client_id = public.current_app_user_id()
  or coach_id = public.current_app_user_id()
  or public.is_super_admin()
);
create policy "coach_notes_delete" on public.coach_notes for delete using (
  coach_id = public.current_app_user_id()
  or public.is_super_admin()
);

-- ─── client_payments ───
drop policy if exists "client_payments_insert" on public.client_payments;
drop policy if exists "client_payments_update" on public.client_payments;
drop policy if exists "client_payments_delete" on public.client_payments;

create policy "client_payments_insert" on public.client_payments for insert with check (
  (coach_id = public.current_app_user_id() and public.is_my_client(client_id))
  or public.is_super_admin()
);
create policy "client_payments_update" on public.client_payments for update using (
  coach_id = public.current_app_user_id()
  or public.is_super_admin()
) with check (
  coach_id = public.current_app_user_id()
  or public.is_super_admin()
);
create policy "client_payments_delete" on public.client_payments for delete using (
  coach_id = public.current_app_user_id()
  or public.is_super_admin()
);

-- ─── Verified, by impersonating real users against real rows, always
-- rolled back — never a write left standing to clean up afterward ───
--
-- Legitimate writes ALLOWED (ordinary coach 42f47639, not super-admin, and
-- their real client 585fdbde):
--   * coach inserts a note for their own client;
--   * coach logs a payment for their own client;
--   * full note lifecycle: coach writes it, client replies
--     (saveClientReplyToNote), coach marks the reply seen
--     (markClientReplySeen);
--   * client marks a note read (markCoachNoteRead);
--   * coach updates then deletes their own logged payment.
--
-- Illegitimate writes BLOCKED:
--   * that same coach inserting a note/payment against a DIFFERENT coach's
--     real client (super-admin's client 4c63ccd4) — 42501, is_my_client()
--     correctly refuses it;
--   * an unrelated third coach (fddbaa2a) updating another coach's payment
--     or note — checked from a super-admin's omniscient view afterward to
--     confirm the row was genuinely untouched, not just invisible to the
--     attacker's own now-narrower select;
--   * the anon key: INSERT on both tables returns 401/42501; UPDATE against
--     a real row (a no-op write of its own existing value) returns 200 with
--     zero rows affected, on both tables.
--
-- Live app smoke-tested after applying: loads and renders normally.
-- ==========================================

-- ==========================================
-- ROLLBACK (only if a legitimate write turns out to be refused). Restores the
-- permissive policies exactly as they were before this migration.
-- ==========================================
-- drop policy if exists "coach_notes_insert" on public.coach_notes;
-- drop policy if exists "coach_notes_update" on public.coach_notes;
-- drop policy if exists "coach_notes_delete" on public.coach_notes;
-- create policy "coach_notes_insert" on public.coach_notes for insert with check (true);
-- create policy "coach_notes_update" on public.coach_notes for update using (true) with check (true);
-- create policy "coach_notes_delete" on public.coach_notes for delete using (true);
-- drop policy if exists "client_payments_insert" on public.client_payments;
-- drop policy if exists "client_payments_update" on public.client_payments;
-- drop policy if exists "client_payments_delete" on public.client_payments;
-- create policy "client_payments_insert" on public.client_payments for insert with check (true);
-- create policy "client_payments_update" on public.client_payments for update using (true) with check (true);
-- create policy "client_payments_delete" on public.client_payments for delete using (true);
