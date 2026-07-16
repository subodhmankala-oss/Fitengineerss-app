import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// Read-only diagnostics for the "client starts workout -> coach notified"
// chain. Sends nothing; just reports which link (if any) is broken.
// Usage:  /api/notify-debug?clientUserId=<uuid>   OR   ?email=<client email>
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { clientUserId, email } = req.query;

  try {
    // 1. Resolve the client's users.id.
    let clientId = clientUserId || null;
    if (!clientId && email) {
      const { data: u } = await supabase.from('users').select('id').eq('email', String(email).toLowerCase()).maybeSingle();
      clientId = u?.id || null;
    }
    if (!clientId) {
      return res.status(200).json({ ok: false, step: 'resolve_client', message: 'Pass ?clientUserId=<uuid> or ?email=<client email>.' });
    }

    // 2. Client's clients row + coach_id.
    const { data: client } = await supabase.from('clients').select('coach_id, full_name').eq('user_id', clientId).maybeSingle();
    if (!client) return res.status(200).json({ ok: false, step: 'client_row', clientId, message: 'No clients row for this user_id.' });
    if (!client.coach_id) return res.status(200).json({ ok: false, step: 'coach_link', clientId, clientName: client.full_name, message: 'This client has no coach_id set — nobody to notify.' });

    // 3. Coach contact.
    const { data: coach } = await supabase.from('users').select('email, full_name').eq('id', client.coach_id).maybeSingle();

    // 4. Count the coach's push subscriptions, by each match strategy.
    const byId = await supabase.from('push_subscriptions').select('id', { count: 'exact' }).eq('user_id', client.coach_id);
    const byEmail = coach?.email ? await supabase.from('push_subscriptions').select('id', { count: 'exact' }).eq('subscription->>userEmail', coach.email) : { count: 0 };
    const byName = coach?.full_name ? await supabase.from('push_subscriptions').select('id', { count: 'exact' }).eq('user_name', coach.full_name) : { count: 0 };

    const totalMatches = (byId.count || 0) + (byEmail.count || 0) + (byName.count || 0);

    return res.status(200).json({
      ok: totalMatches > 0,
      clientId,
      clientName: client.full_name,
      coachId: client.coach_id,
      coachEmail: coach?.email || null,
      coachName: coach?.full_name || null,
      coachSubscriptions: { byUserId: byId.count || 0, byEmail: byEmail.count || 0, byName: byName.count || 0 },
      message: totalMatches > 0
        ? 'Chain looks good — the coach has at least one push subscription that can be targeted.'
        : 'The coach has NO push subscription on file. They must open the app and allow notifications at least once.'
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
