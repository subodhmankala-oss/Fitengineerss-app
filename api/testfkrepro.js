// TEMPORARY — reproduces the coaches_user_id_fkey error scenario: an existing
// client-role account attempting to register as a coach. Removed after use.
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, email, password } = req.body || {};
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const anonClient = createClient(supabaseUrl, anonKey);

  try {
    if (action === 'setup') {
      const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true
      });
      if (createErr) throw createErr;
      const userId = createData.user.id;
      await adminClient.from('users').upsert({ id: userId, email, full_name: 'Repro Client', role: 'client' }, { onConflict: 'id' });
      await adminClient.from('clients').upsert({ user_id: userId, full_name: 'Repro Client', coach_id: null }, { onConflict: 'user_id' });
      return res.status(200).json({ success: true, userId });
    }

    if (action === 'try-createuser') {
      // Exactly mirrors register-coach.js's step 1, to see what error shape
      // Supabase actually returns for this already-existing account.
      const { data, error } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: false
      });
      return res.status(200).json({
        hadError: !!error,
        errorStatus: error?.status || null,
        errorMessage: error?.message || null,
        gotUser: !!data?.user,
        userId: data?.user?.id || null
      });
    }

    if (action === 'cleanup') {
      const { data: userRow } = await adminClient.from('users').select('id').eq('email', email).maybeSingle();
      if (userRow?.id) {
        await adminClient.from('coaches').delete().eq('user_id', userRow.id);
        await adminClient.from('clients').delete().eq('user_id', userRow.id);
        await adminClient.from('users').delete().eq('id', userRow.id);
        await adminClient.auth.admin.deleteUser(userRow.id);
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(400).json({ error: err.message, status: err.status });
  }
}
