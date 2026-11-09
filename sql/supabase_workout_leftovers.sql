-- Exercises carried over to a client's next session ("Keep N exercises for
-- next session" when a workout is saved with some exercises not started).
-- One row per client; items is [{ name, exerciseId, date, planName, savedAt }].
-- Shared by the client's own logger and their coach's Live Log, on any phone.
-- Applied to production 2026-11-09.

create table if not exists public.workout_leftovers (
  user_id uuid primary key references public.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workout_leftovers enable row level security;

-- Same rule as workout_logs: the client, their coach, or the super admin.
create policy workout_leftovers_select on public.workout_leftovers for select
  using ((user_id = current_app_user_id()) or is_my_client(user_id) or is_super_admin());
create policy workout_leftovers_insert on public.workout_leftovers for insert
  with check ((user_id = current_app_user_id()) or is_my_client(user_id) or is_super_admin());
create policy workout_leftovers_update on public.workout_leftovers for update
  using ((user_id = current_app_user_id()) or is_my_client(user_id) or is_super_admin())
  with check ((user_id = current_app_user_id()) or is_my_client(user_id) or is_super_admin());
create policy workout_leftovers_delete on public.workout_leftovers for delete
  using ((user_id = current_app_user_id()) or is_my_client(user_id) or is_super_admin());
