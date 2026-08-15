// Persists the client onboarding wizard result server-side, with the
// service-role key, so the write can never be silently dropped by the
// browser Supabase SDK's known auth-token-refresh hang/race (see
// feedback-supabase-sdk-hang memory) — that race is why several existing
// clients ended up with their body stats saved but onboarding_completed
// stuck at false, forcing them back through the wizard on every login.
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

    return res.status(200).json({ success: true, client: data[0] });
  } catch (err) {
    console.error('complete-onboarding error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save onboarding data.' });
  }
}
