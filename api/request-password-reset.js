// Password-reset email dispatch, server-side.
//
// Supabase's own mailer (Auth → SMTP → Resend) started returning
// 500 "Error sending recovery email" for every address, so this endpoint takes
// over delivery: it generates a recovery link via the Supabase admin API
// (service-role key, no email sent by Supabase) and emails that link through
// Resend's HTTP API. The link reuses the existing verified reset pipeline:
// /auth/confirm?token_hash=...&type=recovery → api/verify-recovery-token.js.
//
// Fallback order:
//   1. admin generate_link + Resend HTTP API   (needs SUPABASE_SERVICE_ROLE_KEY + RESEND_API_KEY)
//   2. Supabase native /auth/v1/recover        (uses whatever SMTP is configured in the dashboard)
// If both fail, returns a real error — the UI must NOT show a fake success.
//
// SECURITY: the recovery link/token is never included in any response or log.

const APP_ORIGIN = 'https://fitengineerss-app.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Please use POST.' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ccevszxzxtwwvreittdm.supabase.co';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;

  const email = ((req.body && req.body.email) || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email address is required.' });
  // Optional hint so the confirm link can carry the caller's tab back through
  // the redirect — without it, AuthConfirm.jsx has no way to know whether a
  // coach or a client requested this reset, and always defaulted to Client.
  const role = req.body && req.body.role === 'coach' ? 'coach' : 'client';

  const confirmation = "If that email is registered, you'll receive a password reset link shortly.";

  // --- Path 1: generate the link ourselves, deliver via Resend ---
  if (serviceKey && resendApiKey) {
    try {
      const linkResp = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        },
        body: JSON.stringify({ type: 'recovery', email })
      });
      const linkData = await linkResp.json().catch(() => ({}));

      if (!linkResp.ok) {
        const msg = (linkData.msg || linkData.error_description || linkData.error || '').toLowerCase();
        if (linkResp.status === 404 || msg.includes('not found') || msg.includes('unable to find user')) {
          // Unknown email — same response as success so accounts can't be enumerated.
          return res.status(200).json({ success: true, message: confirmation });
        }
        console.error('generate_link failed:', linkResp.status, linkData.msg || linkData.error);
        return res.status(502).json({ error: 'We couldn\'t create your reset link right now. Please try again in a few minutes.' });
      }

      // Raw GoTrue admin API returns hashed_token at the top level; the
      // supabase-js wrapper nests it under properties — accept either shape.
      const tokenHash = linkData.hashed_token || (linkData.properties && linkData.properties.hashed_token);
      if (!tokenHash) {
        console.error('generate_link returned no hashed_token');
        return res.status(502).json({ error: 'We couldn\'t create your reset link right now. Please try again in a few minutes.' });
      }

      const resetLink = `${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&role=${role}&email=${encodeURIComponent(email)}`;
      const senderEmail = process.env.SENDER_EMAIL || 'noreply@fitengineerss.com';
      const senderName = process.env.SENDER_NAME || 'Fitengineers';

      const sendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
          from: `${senderName} <${senderEmail}>`,
          to: [email],
          subject: 'Reset Your Fitengineers Password',
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
              <h2 style="color: #6d28d9; margin-top: 0;">Fitengineers Password Reset</h2>
              <p>Hello,</p>
              <p>You requested a password reset for your Fitengineers account.</p>
              <p>Click the button below to set a new password (valid for 1 hour):</p>
              <p style="margin: 24px 0;">
                <a href="${resetLink}" style="background-color: #6d28d9; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
              </p>
              <p style="font-size: 12px; color: #64748b;">Or copy this link: <br/>${resetLink}</p>
              <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">If you did not request this, please ignore this email.</p>
            </div>
          `
        })
      });

      if (sendResp.ok) {
        return res.status(200).json({ success: true, message: confirmation });
      }
      const sendErr = await sendResp.json().catch(() => ({}));
      console.error('Resend send failed:', sendResp.status, sendErr.message || sendErr.name);
      // Fall through to Supabase's native mailer as a last resort.
    } catch (err) {
      console.error('Resend path error:', err);
      // Fall through to Supabase's native mailer.
    }
  }

  // --- Path 2: Supabase's native recover endpoint (dashboard SMTP) ---
  if (!anonKey) {
    return res.status(500).json({ error: 'Server email service is not configured. Please contact support.' });
  }
  try {
    const recoverResp = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
      body: JSON.stringify({ email })
    });
    if (recoverResp.ok) {
      return res.status(200).json({ success: true, message: confirmation });
    }
    const recoverErr = await recoverResp.json().catch(() => ({}));
    if (recoverResp.status === 429) {
      return res.status(429).json({ error: 'A reset link was requested very recently. Please wait a minute before trying again.' });
    }
    console.error('Supabase recover failed:', recoverResp.status, recoverErr.msg || recoverErr.error_code);
    return res.status(502).json({ error: 'Our email service couldn\'t send the reset link. Please try again later.' });
  } catch (err) {
    console.error('Supabase recover error:', err);
    return res.status(502).json({ error: 'Our email service couldn\'t send the reset link. Please try again later.' });
  }
}
