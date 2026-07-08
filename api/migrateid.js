// TEMPORARY — one-time migration to fix a users.id mismatch with the real
// Supabase Auth id, working around the circular FK dependency (children
// need the new id to exist in users; users can't change its id while
// children still reference the old one) via REST-only operations:
//   1. Insert a placeholder row at the new id (temp email to dodge the
//      unique constraint while the old row still holds the real email).
//   2. Re-point every child table's user_id from old -> new.
//   3. Delete the now-unreferenced old users row.
//   4. Restore the real email (and other fields) onto the new row.
// Removed after use.
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHILD_TABLES = ['clients', 'workout_logs', 'workout_plans', 'progress_history', 'tracker_logs'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { oldId, newId } = req.body || {};
  if (!oldId || !newId) return res.status(400).json({ error: 'oldId and newId required' });
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const log = [];

  try {
    const { data: oldRow, error: fetchErr } = await admin.from('users').select('*').eq('id', oldId).maybeSingle();
    if (fetchErr) throw new Error(`fetch old row: ${fetchErr.message}`);
    if (!oldRow) throw new Error('Old users row not found — already migrated?');
    const realEmail = oldRow.email;
    const tempEmail = `migrating+${newId}@placeholder.invalid`;

    // 1. Placeholder row at the new id, holding everything except email.
    const { error: insErr } = await admin.from('users').insert({ ...oldRow, id: newId, email: tempEmail });
    if (insErr) throw new Error(`insert placeholder: ${insErr.message}`);
    log.push('placeholder row inserted');

    // 2. Re-point children.
    for (const table of CHILD_TABLES) {
      const { error } = await admin.from(table).update({ user_id: newId }).eq('user_id', oldId);
      if (error) throw new Error(`${table} repoint: ${error.message}`);
      log.push(`${table} repointed`);
    }

    // 3. Delete the old, now-unreferenced row.
    const { error: delErr } = await admin.from('users').delete().eq('id', oldId);
    if (delErr) throw new Error(`delete old row: ${delErr.message}`);
    log.push('old row deleted');

    // 4. Restore the real email onto the new row.
    const { error: emailErr } = await admin.from('users').update({ email: realEmail }).eq('id', newId);
    if (emailErr) throw new Error(`restore email: ${emailErr.message}`);
    log.push('real email restored');

    return res.status(200).json({ success: true, log });
  } catch (err) {
    return res.status(400).json({ error: err.message, log });
  }
}
