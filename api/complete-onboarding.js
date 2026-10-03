import { alertSuperAdmin, clearSignupIncompleteAlert } from './_adminAlert.js';

// Persists the client onboarding wizard result server-side, with the
// service-role key, so the write can never be silently dropped by the
// browser Supabase SDK's known auth-token-refresh hang/race (see
// feedback-supabase-sdk-hang memory) — that race is why several existing
// clients ended up with their body stats saved but onboarding_completed
// stuck at false, forcing them back through the wizard on every login.

// Coach's display name for the alert below, or null (no coach, or lookup
// failed — the alert still goes out, just without the name).
async function getCoachName(supabaseUrl, serviceKey, coachId) {
  if (!coachId) return null;
  try {
    const rows = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(coachId)}&select=full_name`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    }).then(r => r.json());
    return (Array.isArray(rows) && rows[0]?.full_name) || null;
  } catch {
    return null;
  }
}

// Alert the super-admin (push + in-app card, via api/_adminAlert.js) that a
// brand-new client just finished signing up, and how they'll be guided: by
// their coach, or self-guided by the app itself — a first-class way to use
// Fitengineers, not a gap, so it's worded that way (same "Self-Guided" label
// as the Super-Admin client list). Never throws.
export function newClientAlertBody(clientName, coachId, coachName) {
  if (!coachId) return `${clientName} signed up as a self-guided user.`;
  return coachName ? `${clientName} signed up with Coach ${coachName}.` : `${clientName} signed up with their coach.`;
}

async function notifySuperAdminOfNewClient(supabaseUrl, serviceKey, { userId, clientName, coachId }) {
  // They finished, so a pending "sign-up not finished" card is stale.
  await clearSignupIncompleteAlert({ supabaseUrl, serviceKey, actorUserId: userId });
  const coachName = await getCoachName(supabaseUrl, serviceKey, coachId);
  await alertSuperAdmin({
    supabaseUrl,
    serviceKey,
    type: 'new_client_signup',
    actorUserId: userId,
    title: '🎉 New client joined',
    body: newClientAlertBody(clientName, coachId, coachName),
    url: `/?viewClient=${userId}`,
    payload: { client_name: clientName }
  });
}

// Allowed values — same lists as the CHECK constraints on clients.program /
// primary_concern (and their secondary_ twins, sql/clients_secondary_goal_
// and_concern.sql). A value outside them would make the whole save fail on
// the constraint, so a second pick that isn't valid (or that repeats the
// main one) is simply dropped rather than blocking onboarding.
const PROGRAMS = ['fat_loss', 'muscle_building', 'gut_repair'];
const CONCERNS = ['bloating_constipation', 'digestion_issues', 'just_stay_fit'];

export function cleanSecondary(value, allowed, main) {
  return allowed.includes(value) && value !== main ? value : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }

  const { userId: bodyUserId, email, coreStats, program, primary_concern, secondary_program, secondary_concern, full_name } = req.body || {};
  if ((!bodyUserId && !email) || !coreStats) {
    return res.status(400).json({ error: 'Missing userId/email or coreStats' });
  }

  // Only persist a real name — never let the "Warrior" placeholder (or an empty
  // value) overwrite a name the client actually set. The wizard sends the name
  // the client typed; if they left it as the default, we simply don't touch
  // full_name here.
  const cleanName = typeof full_name === 'string' ? full_name.trim() : '';
  const persistName = cleanName && cleanName.toLowerCase() !== 'warrior';

  const payload = {
    ...coreStats,
    program: program || null,
    primary_concern: primary_concern || null,
    // The wizard lets a client pick up to 2 goals / concerns; the first is
    // program / primary_concern above, the second lands here.
    secondary_program: cleanSecondary(secondary_program, PROGRAMS, program),
    secondary_concern: cleanSecondary(secondary_concern, CONCERNS, primary_concern),
    onboarding_completed: true
  };
  if (persistName) payload.full_name = cleanName;

  try {
    let userId = bodyUserId || null;

    // A client-supplied userId is NOT trustworthy on its own: for an email/
    // password signup, the browser stores the raw Supabase AUTH uid into
    // localStorage.userId the moment signUp() returns (see Onboarding.jsx),
    // but public.users.id is a separately-generated UUID (DEFAULT
    // gen_random_uuid(), never set equal to the auth uid on that path) —
    // it only exists once App.jsx's onAuthStateChange handler finishes its
    // own background users/clients auto-create (which has a deliberate
    // 600ms retry baked in). A fresh client who fills the wizard quickly can
    // submit before that race resolves, sending an auth uid that matches no
    // public.users row — the clients upsert below then fails its user_id FK
    // and every save comes back "Failed to save onboarding data." (confirmed
    // 2026-08-15 for a brand-new client, Gurpreet, on first login). Verify
    // the id actually resolves before trusting it; otherwise fall through to
    // the email-based lookup/create path exactly as if no id had been sent.
    if (userId) {
      const verifyResp = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=id`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
      const verifyData = await verifyResp.json().catch(() => []);
      if (!Array.isArray(verifyData) || !verifyData[0]?.id) {
        userId = null;
      }
    }

    // No id up front (a brand-new signup, the browser's own id-resolution
    // came up empty, or the id above didn't verify) — resolve/create the
    // users row here instead, server-side with the service-role key, so this
    // never depends on the browser Supabase SDK, which is known to hang
    // right after a fresh auth session (exactly the state a client is in
    // moments after signing up or resetting their password — see
    // feedback-supabase-sdk-hang memory). Confirmed 2026-07-27: routing this
    // same creation through the client-side saveUserProfile() (which still
    // uses the raw SDK) just moved the failure from an immediate error to an
    // indefinite hang for a real client (Nikhil) whose account had never
    // gotten a users/clients row.
    if (!userId && email) {
      const normEmail = String(email).trim().toLowerCase();
      const lookupResp = await fetch(`${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(normEmail)}&select=id`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
      const lookupData = await lookupResp.json().catch(() => []);
      if (Array.isArray(lookupData) && lookupData[0]?.id) {
        userId = lookupData[0].id;
      } else {
        const createResp = await fetch(`${supabaseUrl}/rest/v1/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: 'return=representation'
          },
          body: JSON.stringify({ email: normEmail })
        });
        const createData = await createResp.json().catch(() => null);
        if (!createResp.ok || !Array.isArray(createData) || !createData[0]?.id) {
          console.error('complete-onboarding: could not create users row:', createResp.status, createData);
          return res.status(502).json({ error: 'Could not create your account record.' });
        }
        userId = createData[0].id;
      }
    }

    if (!userId) {
      return res.status(400).json({ error: 'Could not resolve your account.' });
    }

    // Upsert (not a plain PATCH) so this also covers the brand-new-client
    // case where no clients row exists yet — merge-duplicates only touches
    // the columns listed here, so an EXISTING row's coach_id (and anything
    // else not in `payload`) is left untouched, never reset to null.
    const saveClientRow = (body) => fetch(`${supabaseUrl}/rest/v1/clients?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({ user_id: userId, ...body })
    });
    let resp = await saveClientRow(payload);
    let data = await resp.json();
    if (!resp.ok && resp.status === 400 && /secondary_/.test(JSON.stringify(data))) {
      // The secondary_* columns aren't there (a database that hasn't had
      // sql/clients_secondary_goal_and_concern.sql run) — sign-up must still
      // work, so save everything else.
      console.warn('complete-onboarding: secondary_* columns missing, saving without them');
      const { secondary_program: _sp, secondary_concern: _sc, ...withoutSecondary } = payload;
      resp = await saveClientRow(withoutSecondary);
      data = await resp.json();
    }
    if (!resp.ok) {
      console.error('complete-onboarding update failed:', resp.status, data);
      return res.status(502).json({ error: 'Failed to save onboarding data.' });
    }
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ error: 'No client record found for this account.' });
    }

    // Keep users.full_name in sync so every read (coach dashboard, profile
    // lookups) shows the real name. Best-effort — a failure here must not fail
    // the whole onboarding save, since the client-row write already succeeded.
    if (persistName) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({ full_name: cleanName })
        });
      } catch (nameErr) {
        console.error('complete-onboarding: users.full_name sync failed (non-fatal):', nameErr);
      }
    }

    // Alert the super-admin the moment a brand-new client finishes signing
    // up — this endpoint only ever runs for a client who hasn't completed
    // the one-time wizard yet (Onboarding.jsx only routes here pre-
    // completion), so every successful call really is a new client. The
    // client's own welcome is an in-app banner instead (WelcomeBanner.jsx,
    // driven by clients.welcome_seen defaulting to false on this insert) —
    // no push needed here for that half.
    const finalName = persistName ? cleanName : (data[0].full_name || 'A new client');
    await notifySuperAdminOfNewClient(supabaseUrl, serviceKey, { userId, clientName: finalName, coachId: data[0].coach_id || null });

    return res.status(200).json({ success: true, client: data[0] });
  } catch (err) {
    console.error('complete-onboarding error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save onboarding data.' });
  }
}
