// Server-side coach registration — uses service role key to bypass RLS so we can
// insert into public.users and coaches immediately after signUp, even before
// the coach has confirmed their email (no session yet on the client).

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

  const { email, name, password, experience, brand, certifications, social, location } = req.body || {};
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name and password are required' });
  }

  // Use service role key for DB writes (bypasses RLS).
  // Fall back to anon key if service role not configured (will likely fail RLS but avoids crash).
  const adminClient = createClient(supabaseUrl, serviceRoleKey || anonKey);
  // Separate anon client just for signUp (auth endpoint only needs anon key).
  const anonClient = createClient(supabaseUrl, anonKey);

  try {
    // 1. Create the auth user
    const { data: signUpData, error: signUpErr } = await anonClient.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: `${process.env.VITE_APP_URL || 'https://fitengineerss-app.vercel.app'}/auth/confirm` }
    });
    if (signUpErr) throw new Error(signUpErr.message);
    const userId = signUpData?.user?.id;
    if (!userId) throw new Error('Could not create coach account. Please try again.');

    // 2. Insert public.users row (service role bypasses RLS)
    const { error: userErr } = await adminClient
      .from('users')
      .upsert({ id: userId, email: email.trim().toLowerCase(), full_name: name, role: 'coach' }, { onConflict: 'id' });
    if (userErr) console.warn('register-coach: users row error:', userErr.message);

    // 3. Insert coaches row (service role bypasses RLS)
    const expYears = parseInt(experience, 10);
    const { error: coachErr } = await adminClient
      .from('coaches')
      .upsert({
        user_id: userId,
        status: 'approved',
        brand_name: brand || `${name} Fitness`,
        experience_years: Number.isFinite(expYears) ? expYears : null,
        is_blocked: false,
        certifications: certifications || null,
        social_media_handle: social || null,
        location_city: location || null
      }, { onConflict: 'user_id' });
    if (coachErr) throw new Error(coachErr.message || 'Could not save coach profile.');

    return res.status(200).json({
      success: true,
      hasSession: !!(signUpData?.session),
      userId
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Registration failed' });
  }
}
