// Server-side coach registration — uses service role key to bypass RLS so we can
// insert into public.users and coaches immediately after account creation.
//
// Accounts are created pre-confirmed via the admin API rather than
// anonClient.auth.signUp(), which relies on Supabase's own signup-confirmation
// email — that mailer uses the same dead SMTP credential that broke password
// reset emails, so it fails outright for a genuinely brand-new signup. Coaches
// created here are auto-approved (status: 'approved' below) regardless, so
// there's no gate an unconfirmed pending state would have protected anyway.

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
    const normalizedEmail = email.trim().toLowerCase();
    let userId = null;

    // 1. Create the auth user, pre-confirmed (see file header for why).
    const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true
    });

    if (createErr) {
      const msg = (createErr.message || '').toLowerCase();
      const alreadyExists =
        createErr.status === 422 ||
        msg.includes('already registered') ||
        msg.includes('already been registered') ||
        msg.includes('already exists');
      if (!alreadyExists) throw new Error(createErr.message);

      // Already has an account — e.g. one set up via "Forgot password?" before
      // they'd ever filled out a coach profile. Verify the password they just
      // typed against that existing account instead of rejecting outright.
      const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });
      if (signInErr || !signInData?.user) {
        return res.status(409).json({
          error: 'This email is already registered, but that password doesn\'t match. Use "Forgot password?" to set a new one, then try signing up again with it.'
        });
      }
      userId = signInData.user.id;
    } else {
      userId = createData.user.id;
    }

    if (!userId) throw new Error('Could not create coach account. Please try again.');

    // 2. Insert public.users row (service role bypasses RLS)
    const { error: userErr } = await adminClient
      .from('users')
      .upsert({ id: userId, email: normalizedEmail, full_name: name, role: 'coach' }, { onConflict: 'id' });
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

    // 4. Sign in fresh for a real session — admin.createUser() doesn't return
    // one (it's an out-of-band admin action, not a login). This lets the
    // frontend establish the session directly and land on the coach
    // dashboard without a second manual login step, for both a genuinely new
    // account and the already-existing-account path above.
    const { data: finalSignIn } = await anonClient.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    return res.status(200).json({
      success: true,
      hasSession: !!finalSignIn?.session,
      userId,
      access_token: finalSignIn?.session?.access_token || null,
      refresh_token: finalSignIn?.session?.refresh_token || null
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Registration failed' });
  }
}
