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
import { alertSuperAdmin } from './_adminAlert.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

// Push + in-app card to the super-admin (api/_adminAlert.js). Both paths
// below are upserts that also run for an existing coach (retry, or App.jsx's
// Google auto-provision) — _adminAlert de-duplicates per coach, so only the
// first one alerts. No URL: the card lives on the Admin panel, which the
// app's Admin toggle dot points to.
// A gym owner's sign-up reuses the same alert type (and so the same admin
// card and per-person de-dupe) with gym wording.
function notifySuperAdminOfNewCoach(publicUserId, name, email, gym = null) {
  return alertSuperAdmin({
    supabaseUrl,
    serviceKey: serviceRoleKey,
    type: 'new_coach_signup',
    actorUserId: publicUserId,
    title: gym ? '🏢 New gym joined' : '🏅 New coach joined',
    body: gym
      ? `${name} (${email}) just signed up ${gym.name} as a gym owner.`
      : `${name} (${email}) just signed up as a coach.`,
    payload: { coach_name: name, coach_email: email, ...(gym ? { gym_name: gym.name, gym_id: gym.id } : {}) }
  });
}

// Both sign-up paths are upserts that also run for an EXISTING account (a
// retry, Google auto-provision, or someone signing up again with an email
// that already has a password). 2026-10-14: a gym sign-up submitted with the
// super-admin's own email + password (the form had it prefilled and locked)
// downgraded that account's role to 'coach' — and RLS read policies key on
// role = 'super-admin' — and nulled their coach experience/certifications,
// because owner mode hides those fields. So for an existing account:
//   * a 'super-admin' role is kept, never replaced by 'coach';
//   * coach fields only change when a value was actually submitted.
async function existingProfile(adminClient, normalizedEmail) {
  const { data: userRow } = await adminClient
    .from('users')
    .select('id, role')
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (!userRow?.id) return { role: null, hasCoachRow: false };
  const { data: coachRows } = await adminClient
    .from('coaches')
    .select('user_id')
    .eq('user_id', userRow.id)
    .limit(1);
  return { role: userRow.role || null, hasCoachRow: !!coachRows?.[0] };
}

function coachRoleFor(existingRole) {
  return existingRole === 'super-admin' ? 'super-admin' : 'coach';
}

// Fields that were submitted, plus first-time defaults only for a brand-new
// coaches row. status is always 'approved' (no coach approval step — same as
// before); is_blocked is only set on a new row, so signing up again can no
// longer unblock a coach the admin blocked.
function coachProfileRow(publicUserId, { name, gymName, brand, experience, certifications, social, location }, hasCoachRow) {
  const row = { user_id: publicUserId, status: 'approved' };
  const expYears = parseInt(experience, 10);
  const brandName = brand || gymName;
  if (brandName) row.brand_name = brandName;
  if (Number.isFinite(expYears)) row.experience_years = expYears;
  if (certifications) row.certifications = certifications;
  if (social) row.social_media_handle = social;
  if (location) row.location_city = location;
  if (!hasCoachRow) {
    Object.assign(row, {
      is_blocked: false,
      brand_name: row.brand_name || `${name} Fitness`,
      experience_years: row.experience_years ?? null,
      certifications: row.certifications ?? null,
      social_media_handle: row.social_media_handle ?? null,
      location_city: row.location_city ?? null
    });
  }
  return row;
}

// "I own a gym" on Coach Sign Up (sql/gym_tier.sql). Null = not a gym
// sign-up; throws for a name that's present but unusable.
function cleanGymName(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const name = String(raw).trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) throw new Error('Gym name must be 2–80 characters.');
  return name;
}

// The owner is a normal coach account (they land on a dashboard that already
// works); ownership is gyms.owner_id. Active immediately — there is no
// approval step (sql/gym_tier_no_approval.sql). Idempotent: a retry, or a
// second submit for an account that already owns a gym, returns that gym
// instead of creating another. The owner also joins their own gym as a
// trainer, so clients they coach count under it.
async function createOwnedGym(adminClient, publicUserId, gymName) {
  const { data: existing, error: findErr } = await adminClient
    .from('gyms')
    .select('id, name, join_code')
    .eq('owner_id', publicUserId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (findErr) throw new Error(findErr.message || 'Could not check your gym.');
  let gym = existing?.[0];
  if (!gym) {
    const { data: created, error: createErr } = await adminClient
      .from('gyms')
      .insert({ name: gymName, owner_id: publicUserId, status: 'active' })
      .select('id, name, join_code')
      .single();
    if (createErr) throw new Error(createErr.message || 'Could not create your gym.');
    gym = created;
  }
  const { error: joinErr } = await adminClient
    .from('users')
    .update({ gym_id: gym.id, gym_status: 'active' })
    .eq('id', publicUserId)
    .is('gym_id', null);
  if (joinErr) throw new Error(joinErr.message || 'Could not add you to your gym.');
  return gym;
}

// users.phone carries a UNIQUE constraint, so a number already on another
// account (a coach who is also an existing client, or a plain typo) comes back
// as a Postgres 23505 the coach can't act on -- "duplicate key value violates
// unique constraint users_phone_key" tells them nothing about which field to
// fix. Worse, on the email path it lands in the rollback below and deletes the
// auth account they just made, so they need to know it's the phone that has to
// change before retrying. Returns null for any other error.
function phoneConflictMessage(err) {
  const code = err?.code || '';
  const msg = (err?.message || '').toLowerCase();
  const isDuplicate = code === '23505' || msg.includes('duplicate key');
  if (!isDuplicate) return null;
  if (!msg.includes('phone')) return null;
  return 'That phone number is already registered to another account. Use a different number, or log in to the account that already has it.';
}

// An established client (finished onboarding, or linked to a coach) must not
// be turned into a coach by these upserts: login routes by role and a coaches
// row wins, so the client silently loses their client app (testclient,
// 2026-10-03, via Coach tab login -> prefilled Coach Sign Up). A half-finished
// client profile is still allowed through, so a coach who first landed in the
// client flow by mistake isn't trapped.
const CLIENT_ACCOUNT_MESSAGE = 'This email already belongs to a client account. Log in on the Client tab instead, or sign up as a coach with a different email.';
async function isEstablishedClient(adminClient, normalizedEmail) {
  const { data: userRow } = await adminClient
    .from('users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (!userRow?.id) return false;
  const { data: clientRows } = await adminClient
    .from('clients')
    .select('onboarding_completed, coach_id')
    .eq('user_id', userRow.id)
    .limit(1);
  const client = clientRows?.[0];
  return !!client && (client.onboarding_completed === true || !!client.coach_id);
}

// ─── register-coach.js (method=email) ───
async function handleRegisterEmail(req, res) {
  const { email, name, password, phone, experience, brand, certifications, social, location } = req.body || {};
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name and password are required' });
  }
  let gymName;
  try {
    gymName = cleanGymName(req.body.gymName);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey || anonKey);
  const anonClient = createClient(supabaseUrl, anonKey);

  try {
    const normalizedEmail = email.trim().toLowerCase();
    let userId = null;
    // Tracks whether THIS request created the auth account (vs. signing into
    // one that already existed) — only a freshly-created one is safe to roll
    // back below. Deleting a pre-existing account because of an unrelated
    // profile-write failure would destroy a real login, not just retry state.
    let justCreatedAuthUser = false;

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
      if (await isEstablishedClient(adminClient, normalizedEmail)) {
        return res.status(409).json({ error: CLIENT_ACCOUNT_MESSAGE });
      }
    } else {
      userId = createData.user.id;
      justCreatedAuthUser = true;
    }

    if (!userId) throw new Error('Could not create coach account. Please try again.');

    // Confirmed 2026-09-09: a handful of real coach sign-ups (e.g.
    // kumarnishant9061@gmail.com) got exactly this far — createUser()
    // succeeded, auth.users got a row — then a transient failure in one of
    // the two writes below left them permanently stuck: no public.users, no
    // coaches row, but a live auth account blocking any retry (createUser
    // on the same email just routes back into the alreadyExists/sign-in
    // branch above, which still lands here and can fail the same way again).
    // They had no way to self-recover and no error surfaced anywhere we'd
    // see it. If this account was freshly created THIS request and the
    // profile writes still fail, delete it again so the failure is
    // undone entirely — the frontend's existing error message just tells
    // them to try again, and a retry is then a clean signUp(), not a dead end.
    let publicUserId, coachRow, gym = null;
    try {
      const existing = await existingProfile(adminClient, normalizedEmail);
      const { data: userRow, error: userErr } = await adminClient
        .from('users')
        .upsert({
          email: normalizedEmail,
          full_name: name,
          role: coachRoleFor(existing.role),
          // Only overwrite phone when one was actually submitted — an upsert
          // on an existing row (the alreadyExists/retry path) must not blank
          // out a number this account already has.
          ...(phone ? { phone } : {})
        }, { onConflict: 'email' })
        .select('id')
        .single();
      if (userErr) throw new Error(phoneConflictMessage(userErr) || userErr.message || 'Could not save your account details.');
      publicUserId = userRow.id;

      const { data: coachData, error: coachErr } = await adminClient
        .from('coaches')
        .upsert(
          coachProfileRow(publicUserId, { name, gymName, brand, experience, certifications, social, location }, existing.hasCoachRow),
          { onConflict: 'user_id' }
        )
        .select('id')
        .single();
      if (coachErr) throw new Error(coachErr.message || 'Could not save coach profile.');
      coachRow = coachData;

      // Inside the rollback try: a gym sign-up that fails here undoes the
      // fresh auth account too, so the owner's retry is a clean sign-up.
      if (gymName) gym = await createOwnedGym(adminClient, publicUserId, gymName);
    } catch (profileErr) {
      if (justCreatedAuthUser) {
        await adminClient.auth.admin.deleteUser(userId).catch(() => {
          // Best-effort — if this also fails, the account is still orphaned,
          // but the original error below is what the user sees either way.
        });
      }
      throw profileErr;
    }

    await notifySuperAdminOfNewCoach(publicUserId, name, normalizedEmail, gym);

    const { data: finalSignIn } = await anonClient.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    return res.status(200).json({
      success: true,
      hasSession: !!finalSignIn?.session,
      userId: publicUserId,
      coachId: coachRow.id,
      gym,
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

  const { name, phone, experience, brand, certifications, social, location } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  let gymName;
  try {
    gymName = cleanGymName(req.body.gymName);
  } catch (e) {
    return res.status(400).json({ error: e.message });
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
    if (await isEstablishedClient(adminClient, normalizedEmail)) {
      return res.status(409).json({ error: CLIENT_ACCOUNT_MESSAGE });
    }

    const existing = await existingProfile(adminClient, normalizedEmail);
    const { data: userRow, error: userErr } = await adminClient
      .from('users')
      .upsert({
        email: normalizedEmail,
        full_name: name,
        role: coachRoleFor(existing.role),
        // Same as the email path: never blank out an existing number. The
        // auto-provision call in App.jsx sends no phone at all (Google gives
        // us none), so this must stay optional here.
        ...(phone ? { phone } : {})
      }, { onConflict: 'email' })
      .select('id')
      .single();
    if (userErr) throw new Error(phoneConflictMessage(userErr) || userErr.message || 'Could not save your account details.');
    const publicUserId = userRow.id;

    const { data: coachRow, error: coachErr } = await adminClient
      .from('coaches')
      .upsert(
        coachProfileRow(publicUserId, { name, gymName, brand, experience, certifications, social, location }, existing.hasCoachRow),
        { onConflict: 'user_id' }
      )
      .select('id')
      .single();
    if (coachErr) throw new Error(coachErr.message || 'Could not save coach profile.');

    const gym = gymName ? await createOwnedGym(adminClient, publicUserId, gymName) : null;

    await notifySuperAdminOfNewCoach(publicUserId, name, normalizedEmail, gym);

    return res.status(200).json({
      success: true,
      userId: publicUserId,
      coachId: coachRow.id,
      gym,
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
