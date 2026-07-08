// TEMPORARY — deletes a test user by email. Removed after use.
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email } = req.body || {};
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  try {
    const { data: userRow } = await adminClient.from('users').select('id').eq('email', email).maybeSingle();
    if (userRow?.id) {
      await adminClient.from('coaches').delete().eq('user_id', userRow.id);
      await adminClient.from('users').delete().eq('id', userRow.id);
      await adminClient.auth.admin.deleteUser(userRow.id);
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
