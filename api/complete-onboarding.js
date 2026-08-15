import webPush from 'web-push';

// Persists the client onboarding wizard result server-side, with the
// service-role key, so the write can never be silently dropped by the
// browser Supabase SDK's known auth-token-refresh hang/race (see
// feedback-supabase-sdk-hang memory) — that race is why several existing
// clients ended up with their body stats saved but onboarding_completed
// stuck at false, forcing them back through the wizard on every login.

// Same hardcoded super-admin identity App.jsx's processSessionUser uses to
// grant the super-admin role — kept in sync deliberately rather than reading
// a role column, since that's the one account the new-signup alert below
// must always reach regardless of DB role drift.
const SUPER_ADMIN_EMAIL = 'subodhmankala@gmail.com';

let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return;
  webPush.setVapidDetails(
    'mailto:support@fitengineers.com',
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidConfigured = true;
}

// Sends a push to every subscription registered for one userId, straight
// with the service-role key already held by this handler (bypasses RLS
// outright, no anon-key/RPC dance needed) rather than round-tripping through
// api/push.js's HTTP endpoint — a serverless function calling another one
// over the network can get frozen mid-flight the instant this handler's own
// response is sent (confirmed 2026-08-15: that exact cross-function call
// aborted under vercel dev's local simulation), and it adds nothing this
// handler can't do itself with the credentials it already has. Silent no-op
// if the user has no subscriptions yet (e.g. a brand-new client who hasn't
// granted push permission in the browser yet) — never throws.
async function sendPushToUserId(supabaseUrl, serviceKey, userId, { title, body, url }) {
  ensureVapid();
  const restHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  const subsResp = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,subscription`, { headers: restHeaders });
  const subs = await subsResp.json().catch(() => []);
  if (!Array.isArray(subs) || subs.length === 0) return;

  const payload = JSON.stringify({ title, body, icon: '/logo.png', vibrate: [300, 100, 300], url: url || undefined });

  await Promise.all(subs.map(async (sub) => {
    try {
      await webPush.sendNotification(sub.subscription, payload);
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(sub.id)}`, { method: 'DELETE', headers: restHeaders }).catch(() => {});
      }
    }
  }));
}

// Best-effort push to the super-admin that a brand-new client just finished
// signing up. Never throws — a notification hiccup must not fail the
// onboarding save that already succeeded by the time this runs.
async function notifySuperAdminOfNewClient(supabaseUrl, serviceKey, clientName) {
  try {
    const restHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const adminResp = await fetch(`${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(SUPER_ADMIN_EMAIL)}&select=id`, { headers: restHeaders });
    const adminData = await adminResp.json().catch(() => []);
    const adminId = Array.isArray(adminData) ? adminData[0]?.id : null;
    if (!adminId) return;

    await sendPushToUserId(supabaseUrl, serviceKey, adminId, {
      title: '🎉 New client joined',
      body: `${clientName} just signed up on Fitengineers.`
    });
  } catch (notifyErr) {
    console.error('complete-onboarding: new-signup admin notification failed (non-fatal):', notifyErr);
  }
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

  const { userId: bodyUserId, email, coreStats, program, primary_concern, full_name } = req.body || {};
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
    const resp = await fetch(`${supabaseUrl}/rest/v1/clients?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({ user_id: userId, ...payload })
    });
    const data = await resp.json();
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
    await notifySuperAdminOfNewClient(supabaseUrl, serviceKey, finalName);

    return res.status(200).json({ success: true, client: data[0] });
  } catch (err) {
    console.error('complete-onboarding error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save onboarding data.' });
  }
}
