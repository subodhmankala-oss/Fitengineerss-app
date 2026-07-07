// TEMPORARY — deletes a test user by id, unlinking any clients pointing to
// them first. Removed after use.
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId } = req.body || {};
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  try {
    const { error: unlinkErr } = await adminClient.from('clients').update({ coach_id: null }).eq('coach_id', userId);
    if (unlinkErr) throw unlinkErr;
    await adminClient.from('coaches').delete().eq('user_id', userId);
    await adminClient.from('users').delete().eq('id', userId);
    await adminClient.auth.admin.deleteUser(userId);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
