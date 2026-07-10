// Server-side coach registration for someone who already has a live Supabase
// session from "Continue with Google" (see register-coach.js for the
// separate email+password path — this file never touches or is touched by
// that one). A Google-authenticated account has no password on file at all
// (OAuth never shares it), so this skips password creation/verification
// entirely: it verifies the session token itself proves identity, then
// attaches a coach profile to the account that's already authenticated.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
  // Separate anon client just for verifying the token (auth endpoint only needs anon key).
  const anonClient = createClient(supabaseUrl, anonKey);

  try {
    // The passwordless equivalent of register-coach.js's signInWithPassword
    // check: prove this token belongs to a real, currently-valid user rather
    // than trusting whatever email the client claims.
    const { data: userData, error: getUserErr } = await anonClient.auth.getUser(accessToken);
    if (getUserErr || !userData?.user) {
      return res.status(401).json({ error: 'Your sign-in session has expired. Please sign in with Google again.' });
    }
    const normalizedEmail = (userData.user.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Could not read your email from this session. Please sign in with Google again.' });
    }

    // Same upsert-by-email pattern as register-coach.js (see that file's
    // comment for why this must never force id = auth uid).
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
      userId: publicUserId, // public.users.id — NOT the auth uid
      coachId: coachRow.id, // coaches.id — what localStorage.userCoachId should hold
      email: normalizedEmail
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Registration failed' });
  }
}
