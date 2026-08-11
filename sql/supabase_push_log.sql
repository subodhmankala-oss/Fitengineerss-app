-- Tracks every push notification send attempt (event-driven ones from
-- api/push.js's notify-user action, plus the cron-driven wellness/inactivity
-- nudges) so "how many push notifications are we sending per day" is a real
-- query instead of an unanswerable question — nothing persisted send volume
-- before this. One row per logical notification (i.e. per recipient per
-- event), not per physical device — sent_count/failed_count on that row
-- cover a recipient with multiple subscribed devices.
--
-- Run this once in the Supabase SQL editor (same manual-apply pattern as the
-- other sql/*.sql files in this repo — there is no migration runner).

create table if not exists public.push_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null,               -- e.g. 'workout_started', 'workout_finished', 'coach_note', 'inactivity_nudge', 'wellness_nudge'
  target_user_id uuid,               -- public.users.id of the recipient (null if unresolved)
  title text,
  body text,
  sent_count int not null default 0, -- successful webPush.sendNotification calls
  failed_count int not null default 0
);

create index if not exists push_log_created_at_idx on public.push_log (created_at);
create index if not exists push_log_event_idx on public.push_log (event);

alter table public.push_log enable row level security;

-- api/push.js runs with the anon key (see sql/lock_down_reads.sql's own
-- comment on why: server RPCs are SECURITY DEFINER escape hatches for reads,
-- but writes go through the normal anon-key client) — so INSERT must stay
-- open, same as push_subscriptions_insert below it in that file. SELECT is
-- restricted to the super admin: this is an internal ops/analytics table,
-- nobody's own dashboard needs to read it, and Coach/Client dashboards never
-- query it directly.
drop policy if exists "push_log_insert" on public.push_log;
create policy "push_log_insert" on public.push_log for insert with check (true);

drop policy if exists "push_log_select" on public.push_log;
create policy "push_log_select" on public.push_log for select using (
  public.is_super_admin()
);
