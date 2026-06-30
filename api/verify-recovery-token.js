// Server-side token verification — bypasses browser SDK CORS/PKCE hang issues.
// Called from AuthConfirm.jsx with { token_hash, type }.
// Returns { access_token, refresh_token } on success.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase env vars' });
  }

  const { token_hash, type } = req.body || {};
  if (!token_hash || !type) {
    return res.status(400).json({ error: 'Missing token_hash or type' });
  }

  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({ token_hash, type })
    });

    const data = await resp.json();

    if (!resp.ok || data.error || data.error_code) {
      return res.status(400).json({
        error: data.msg || data.error_description || data.error || 'Token is invalid or expired'
      });
    }

    return res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Verification failed' });
  }
}
