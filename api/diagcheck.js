// TEMPORARY read-only diagnostic — returns the raw generate_link response so
// we can see the true Supabase Auth user id for an email. Removed after use.
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
    // Strip the sensitive token fields, keep everything else raw for inspection.
    delete linkData.hashed_token;
    delete linkData.action_link;
    if (linkData.properties) {
      delete linkData.properties.hashed_token;
      delete linkData.properties.action_link;
    }
    return res.status(200).json({ status: linkResp.status, data: linkData });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
