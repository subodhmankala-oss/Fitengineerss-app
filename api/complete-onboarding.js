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

  const { userId, coreStats, program, primary_concern, full_name } = req.body || {};
  if (!userId || !coreStats) {
    return res.status(400).json({ error: 'Missing userId or coreStats' });
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
    const resp = await fetch(`${supabaseUrl}/rest/v1/clients?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
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
