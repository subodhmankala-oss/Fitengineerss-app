import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  const client = createClient(supabaseUrl, serviceRoleKey || anonKey);

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const { data: user, error } = await client
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (error) throw error;

    return res.status(200).json({ exists: !!user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
