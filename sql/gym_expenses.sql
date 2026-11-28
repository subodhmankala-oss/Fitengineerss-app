-- ==========================================
-- GYM SITE — expenses, so the owner sees profit, not just money collected
--
-- STATUS: NOT YET APPLIED.
-- Purely additive: one new table (RLS on, no policies → service-role API
-- only, like the other gym tables) and one function called only from
-- api/admin-write.js with the VERIFIED caller as p_owner_id; EXECUTE revoked
-- from anon/authenticated. Rollback: sql/rollback_gym_expenses.sql
--
-- An expense is money the gym spent on spent_on. A monthly expense (rent,
-- salaries, internet…) counts once in every month from spent_on's month up to
-- and including stopped_on's month (or for ever while stopped_on is empty),
-- so the owner enters it once. Trainer PT payouts already live in
-- gym_trainer_payouts and are added to "spent" by the app, not copied here.
-- ==========================================

CREATE TABLE IF NOT EXISTS public.gym_expenses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     uuid NOT NULL REFERENCES public.gyms(id),
  category   text NOT NULL CHECK (category IN ('rent', 'salaries', 'electricity', 'equipment', 'maintenance', 'marketing', 'other')),
  amount_inr integer NOT NULL CHECK (amount_inr BETWEEN 1 AND 100000000),
  spent_on   date NOT NULL,
  note       text CHECK (note IS NULL OR length(note) <= 80),
  monthly    boolean NOT NULL DEFAULT false,
  stopped_on date CHECK (stopped_on IS NULL OR stopped_on >= spent_on),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gym_expenses_gym_idx ON public.gym_expenses (gym_id, spent_on DESC);
ALTER TABLE public.gym_expenses ENABLE ROW LEVEL SECURITY;

-- p_op: 'add' (category, amount, spent_on, note, monthly), 'delete' (expense
-- id), 'stop' (a monthly expense stops after this month).
CREATE OR REPLACE FUNCTION public.gym_expense_action(
  p_owner_id uuid, p_op text, p_expense_id uuid, p_category text, p_amount_inr integer,
  p_spent_on date, p_note text, p_monthly boolean
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_e public.gym_expenses%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_op = 'add' THEN
    IF p_category IS NULL OR p_category NOT IN ('rent', 'salaries', 'electricity', 'equipment', 'maintenance', 'marketing', 'other') THEN
      RAISE EXCEPTION 'Pick what the money was spent on.';
    END IF;
    IF p_amount_inr IS NULL OR p_amount_inr < 1 OR p_amount_inr > 100000000 THEN RAISE EXCEPTION 'Enter an amount of ₹1 or more.'; END IF;
    IF p_spent_on IS NULL OR p_spent_on > v_today + 31 OR p_spent_on < v_today - 400 THEN
      RAISE EXCEPTION 'Pick a date within the last year.';
    END IF;
    INSERT INTO public.gym_expenses (gym_id, category, amount_inr, spent_on, note, monthly)
    VALUES (v_gym, p_category, p_amount_inr, p_spent_on, NULLIF(btrim(COALESCE(p_note, '')), ''), COALESCE(p_monthly, false))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'expenseId', v_id);
  END IF;

  SELECT * INTO v_e FROM public.gym_expenses WHERE id = p_expense_id AND gym_id = v_gym;
  IF NOT FOUND THEN RAISE EXCEPTION 'That expense isn’t in your gym.'; END IF;

  IF p_op = 'delete' THEN
    DELETE FROM public.gym_expenses WHERE id = v_e.id;
    RETURN jsonb_build_object('success', true);
  END IF;
  IF p_op = 'stop' THEN
    IF NOT v_e.monthly THEN RAISE EXCEPTION 'Only a monthly expense can be stopped.'; END IF;
    UPDATE public.gym_expenses SET stopped_on = GREATEST(v_e.spent_on, v_today) WHERE id = v_e.id;
    RETURN jsonb_build_object('success', true);
  END IF;
  RAISE EXCEPTION 'Unknown expense action.';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gym_expense_action(uuid, text, uuid, text, integer, date, text, boolean) FROM PUBLIC, anon, authenticated;
