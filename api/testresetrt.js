// TEMPORARY — generates a recovery token_hash for a disposable test account so
// the full reset->set-password->login round trip can be verified without
// needing real email access. Removed after use.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email } = req.body || {};
  try {
    const linkResp = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ type: 'recovery', email })
    });
    const linkData = await linkResp.json();
    const tokenHash = linkData.hashed_token || linkData.properties?.hashed_token;
    return res.status(200).json({ tokenHash, status: linkResp.status });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
