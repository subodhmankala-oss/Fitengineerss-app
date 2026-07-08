// TEMPORARY read-only diagnostic — checks if a Supabase Auth account exists
// for an email via generate_link (does not create anything). Removed after use.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email } = req.body || {};
  try {
    const linkResp = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({ type: 'recovery', email })
    });
    const linkData = await linkResp.json().catch(() => ({}));
    return res.status(200).json({
      generateLinkStatus: linkResp.status,
      generateLinkOk: linkResp.ok,
      msg: linkData.msg || linkData.error_description || linkData.error || null,
      userId: linkData.user?.id || linkData.properties?.action_link ? (linkData.user?.id || null) : null,
      hasHashedToken: !!(linkData.hashed_token || linkData.properties?.hashed_token)
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
