// Consolidated coach registration endpoint — merged from two formerly
// separate functions (register-coach.js, register-coach-google.js) purely
// to stay under the Vercel Hobby plan's 12-Serverless-Functions-per-
// deployment cap (2026-08-11: 17 api/*.js files, every deploy failing with
// "No more than 12 Serverless Functions can be added to a Deployment on the
// Hobby plan"). Each original file's handler logic is preserved verbatim
// below as its own function; this file only adds the `method` dispatch.
//
// Public URLs are unchanged via vercel.json rewrites:
//   /api/register-coach         -> /api/auth-register?method=email
//   /api/register-coach-google  -> /api/auth-register?method=google

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

// ─── register-coach.js (method=email) ───
async function handleRegisterEmail(req, res) {
  const { email, name, password, experience, brand, certifications, social, location } = req.body || {};
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name and password are required' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey || anonKey);
  const anonClient = createClient(supabaseUrl, anonKey);

  try {
    const normalizedEmail = email.trim().toLowerCase();
    let userId = null;

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

    const { data: userRow, error: userErr } = await adminClient
      .from('users')
      .upsert({ email: normalizedEmail, full_name: name, role: 'coach' }, { onConflict: 'email' })
      .select('id')
      .single();
    if (userErr) throw new Error(userErr.message || 'Could not save your account details.');
    const publicUserId = userRow.id;

    const expYears = parseInt(experience, 10);
    const { data: coachRow, error: coachErr } = await adminClient
      .from('coaches')
      .upsert({
        user_id: publicUserId,
        status: 'approved',
        brand_name: brand || `${name} Fitness`,
        experience_years: Number.isFinite(expYears) ? expYears : null,
        is_blocked: false,
        certifications: certifications || null,
        social_media_handle: social || null,
        location_city: location || null
      }, { onConflict: 'user_id' })
      .select('id')
      .single();
    if (coachErr) throw new Error(coachErr.message || 'Could not save coach profile.');

    const { data: finalSignIn } = await anonClient.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    return res.status(200).json({
      success: true,
      hasSession: !!finalSignIn?.session,
      userId: publicUserId,
      coachId: coachRow.id,
      access_token: finalSignIn?.session?.access_token || null,
      refresh_token: finalSignIn?.session?.refresh_token || null
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Registration failed' });
  }
}

// ─── register-coach-google.js (method=google) ───
async function handleRegisterGoogle(req, res) {
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return res.status(401).json({ error: 'Missing session token.' });
  }

  const { name, experience, brand, certifications, social, location } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey || anonKey);
  const anonClient = createClient(supabaseUrl, anonKey);

  try {
    const { data: userData, error: getUserErr } = await anonClient.auth.getUser(accessToken);
    if (getUserErr || !userData?.user) {
      return res.status(401).json({ error: 'Your sign-in session has expired. Please sign in with Google again.' });
    }
    const normalizedEmail = (userData.user.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Could not read your email from this session. Please sign in with Google again.' });
    }

    const { data: userRow, error: userErr } = await adminClient
      .from('users')
      .upsert({ email: normalizedEmail, full_name: name, role: 'coach' }, { onConflict: 'email' })
      .select('id')
      .single();
    if (userErr) throw new Error(userErr.message || 'Could not save your account details.');
    const publicUserId = userRow.id;

    const expYears = parseInt(experience, 10);
    const { data: coachRow, error: coachErr } = await adminClient
      .from('coaches')
      .upsert({
        user_id: publicUserId,
        status: 'approved',
        brand_name: brand || `${name} Fitness`,
        experience_years: Number.isFinite(expYears) ? expYears : null,
        is_blocked: false,
        certifications: certifications || null,
        social_media_handle: social || null,
        location_city: location || null
      }, { onConflict: 'user_id' })
      .select('id')
      .single();
    if (coachErr) throw new Error(coachErr.message || 'Could not save coach profile.');

    return res.status(200).json({
      success: true,
      userId: publicUserId,
      coachId: coachRow.id,
      email: normalizedEmail
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Registration failed' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const method = req.query?.method;
  if (method === 'google') return handleRegisterGoogle(req, res);
  return handleRegisterEmail(req, res);
}
