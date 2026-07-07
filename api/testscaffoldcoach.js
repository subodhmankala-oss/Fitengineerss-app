// TEMPORARY diagnostic endpoint — creates a confirmed auth user with no
// coaches row (mimicking an admin-pre-created "new coach" account) so the
// register-coach.js "already registered" path can be verified end-to-end.
// Removed after verification; not part of the app.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email, password, action } = req.body || {};
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (action === 'create') {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (error) throw error;
      await adminClient.from('users').upsert({ id: data.user.id, email, full_name: 'Test Coach Scaffold' }, { onConflict: 'id' });
      return res.status(200).json({ success: true, userId: data.user.id });
    }
    if (action === 'delete') {
      const { data: userRow } = await adminClient.from('users').select('id').eq('email', email).maybeSingle();
      if (userRow?.id) {
        await adminClient.from('coaches').delete().eq('user_id', userRow.id);
        await adminClient.from('users').delete().eq('id', userRow.id);
        await adminClient.auth.admin.deleteUser(userRow.id);
      }
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
