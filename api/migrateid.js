// TEMPORARY — one-time migration: re-points all rows referencing oldId to
// newId, then updates the users primary key itself last (so no FK is ever
// left dangling mid-migration). Removed after use.
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { oldId, newId, dryRun } = req.body || {};
  if (!oldId || !newId) return res.status(400).json({ error: 'oldId and newId required' });
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const results = {};

  try {
    for (const table of ['clients', 'workout_logs', 'workout_plans', 'progress_history', 'tracker_logs']) {
      const { data: before } = await admin.from(table).select('id').eq('user_id', oldId);
      results[table] = { matched: before?.length || 0 };
      if (!dryRun && before && before.length > 0) {
        const { error } = await admin.from(table).update({ user_id: newId }).eq('user_id', oldId);
        if (error) throw new Error(`${table}: ${error.message}`);
        results[table].updated = true;
      }
    }

    if (!dryRun) {
      const { error: userErr } = await admin.from('users').update({ id: newId }).eq('id', oldId);
      if (userErr) throw new Error(`users: ${userErr.message}`);
      results.users = { updated: true };
    } else {
      results.users = { wouldUpdatePkTo: newId };
    }

    return res.status(200).json({ success: true, dryRun: !!dryRun, results });
  } catch (err) {
    return res.status(400).json({ error: err.message, resultsSoFar: results });
  }
}
