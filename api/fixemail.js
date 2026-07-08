// TEMPORARY — corrects a typo'd email on an existing account (auth + public.users).
// Removed after use.
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, newEmail } = req.body || {};
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  try {
    const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true
    });
    if (error) throw error;
    const { error: userErr } = await adminClient.from('users').update({ email: newEmail }).eq('id', userId);
    if (userErr) throw userErr;
    return res.status(200).json({ success: true, email: data.user.email });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
