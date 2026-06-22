import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ccevszxzxtwwvreittdm.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_4dnLeWl_uJ-v_gonex5VLQ_IiQDiM2V';

// Use Service Role key if available to bypass RLS, otherwise fallback to Anon Key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Validate token query parameter
  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: 'Token parameter is required.' });
    }

    try {
      const { isValid, error } = await validateToken(token);
      if (!isValid) {
        return res.status(400).json({ error });
      }
      return res.status(200).json({ valid: true });
    } catch (err) {
      console.error('Token validation error:', err);
      return res.status(500).json({ error: 'Failed to validate token.' });
    }
  }

  // POST: Reset Password
  if (req.method === 'POST') {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and newPassword are required.' });
    }

    try {
      // 1. Re-validate token
      const { isValid, error, resetToken } = await validateToken(token);
      if (!isValid) {
        return res.status(400).json({ error });
      }

      // 2. Update Supabase Auth if service role is available
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const { error: authError } = await supabase.auth.admin.updateUserById(resetToken.user_id, {
            password: newPassword
          });
          if (authError) {
            console.error('Supabase auth update password error:', authError);
          }
        } catch (authErr) {
          console.error('Failed to update Supabase Auth user password:', authErr);
        }
      }

      // 3. Update public users record
      const { error: dbError } = await supabase
        .from('users')
        .update({ password_hash: newPassword }) // keep password_hash fallback
        .eq('id', resetToken.user_id);

      if (dbError) {
        console.error('Database password update error:', dbError);
        throw dbError;
      }

      // 4. Mark token as used
      const { error: tokenUpdateError } = await supabase
        .from('password_reset_tokens')
        .update({ used: true })
        .eq('id', resetToken.id);

      if (tokenUpdateError) {
        console.error('Database token mark used error:', tokenUpdateError);
      }

      return res.status(200).json({ success: true, message: 'Password updated. Log in with your new password.' });
    } catch (err) {
      console.error('Submit new password error:', err);
      return res.status(500).json({ error: err.message || 'Failed to update password.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}

async function validateToken(token) {
  const { data: resetToken, error: tokenError } = await supabase
    .from('password_reset_tokens')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (tokenError) {
    throw tokenError;
  }

  if (!resetToken) {
    return { isValid: false, error: 'This link is invalid or has expired. Request a new one' };
  }

  if (resetToken.used) {
    return { isValid: false, error: 'This link is invalid or has expired. Request a new one' };
  }

  const now = new Date();
  const expiresAt = new Date(resetToken.expires_at);
  if (expiresAt < now) {
    return { isValid: false, error: 'This link is invalid or has expired. Request a new one' };
  }

  return { isValid: true, resetToken };
}
