// Consolidated password-reset/recovery endpoint — merged from three formerly
// separate functions (request-password-reset.js, reset-password.js,
// verify-recovery-token.js) purely to stay under the Vercel Hobby plan's
// 12-Serverless-Functions-per-deployment cap (2026-08-11: 17 api/*.js files,
// every deploy failing with "No more than 12 Serverless Functions can be
// added to a Deployment on the Hobby plan"). Each original file's handler
// logic is preserved verbatim below as its own function; this file only
// adds the `action` dispatch.
//
// Public URLs are unchanged via vercel.json rewrites:
//   /api/request-password-reset  -> /api/password?action=request-reset
//   /api/reset-password          -> /api/password?action=reset            (GET or POST, same as before)
//   /api/verify-recovery-token   -> /api/password?action=verify-token

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// public.users.password_hash is never read for real (Supabase-Auth-backed)
// logins — actual authentication goes through Supabase Auth's own
// auth.admin.updateUserById() a few lines below this column's write, and
// nothing in api/ or src/services/databaseService.js compares against this
// column outside the localStorage-only mock/offline fallback (which has its
// own separate copy of the value and never touches this table). So this is
// purely a durable secondary record — but it must never hold the raw
// password: salted+hashed with scrypt (Node's built-in, no extra dependency)
// so a DB leak doesn't hand out plaintext passwords directly.
function hashPasswordForStorage(rawPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(rawPassword, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

// ════════════════════════════════════════════════════════════════════════
// ─── request-password-reset.js (action=request-reset) ───
// ════════════════════════════════════════════════════════════════════════

const APP_ORIGIN = 'https://fitengineerss-app.vercel.app';

// Best-effort durable audit trail in public.email_events (see api/resend-webhook.js
// for the table DDL). Never throws — a logging failure must not break the reset flow.
async function recordEmailEvent(supabaseUrl, serviceKey, row) {
  if (!serviceKey) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/email_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    });
  } catch (err) {
    console.error('email_events insert failed (non-fatal):', err.message || err);
  }
}

async function handleRequestReset(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Please use POST.' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ccevszxzxtwwvreittdm.supabase.co';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;

  const email = ((req.body && req.body.email) || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email address is required.' });
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
          console.warn('Password reset requested for email with no auth user:', email, 'role:', role);
          await recordEmailEvent(supabaseUrl, serviceKey, {
            event_type: 'reset.no_auth_user',
            recipient: email,
            subject: role
          });
          if (role === 'coach') {
            return res.status(200).json({
              success: true,
              accountExists: false,
              message: 'No coach account found with this email. First time here? Use "Sign up" below to create your account — "Forgot password?" is only for coaches who already have one.'
            });
          }
          return res.status(200).json({
            success: true,
            accountExists: false,
            message: 'No account found with this email. New to Fitengineers? Tap "Sign up" to create your account — "Forgot password?" is only for clients who already have one.'
          });
        }
        console.error('generate_link failed:', linkResp.status, linkData.msg || linkData.error);
        return res.status(502).json({ error: 'We couldn\'t create your reset link right now. Please try again in a few minutes.' });
      }

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
        const sendData = await sendResp.json().catch(() => ({}));
        console.log('Reset email accepted by Resend:', sendData.id || '(no id)', 'recipient:', email);
        await recordEmailEvent(supabaseUrl, serviceKey, {
          event_type: 'reset.requested',
          email_id: sendData.id || null,
          recipient: email,
          subject: 'Reset Your Fitengineers Password'
        });
        return res.status(200).json({ success: true, message: confirmation });
      }
      const sendErr = await sendResp.json().catch(() => ({}));
      console.error('Resend send failed:', sendResp.status, sendErr.message || sendErr.name);
    } catch (err) {
      console.error('Resend path error:', err);
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

// ════════════════════════════════════════════════════════════════════════
// ─── reset-password.js (action=reset, GET validates token / POST resets) ───
// ════════════════════════════════════════════════════════════════════════

const resetSupabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ccevszxzxtwwvreittdm.supabase.co';
const resetSupabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_4dnLeWl_uJ-v_gonex5VLQ_IiQDiM2V';
const resetSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || resetSupabaseAnonKey;
const resetSupabase = createClient(resetSupabaseUrl, resetSupabaseKey);

async function validateResetToken(token) {
  const { data: resetToken, error: tokenError } = await resetSupabase
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

async function handleResetPassword(req, res) {
  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: 'Token parameter is required.' });
    }

    try {
      const { isValid, error } = await validateResetToken(token);
      if (!isValid) {
        return res.status(400).json({ error });
      }
      return res.status(200).json({ valid: true });
    } catch (err) {
      console.error('Token validation error:', err);
      return res.status(500).json({ error: 'Failed to validate token.' });
    }
  }

  if (req.method === 'POST') {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and newPassword are required.' });
    }

    try {
      const { isValid, error, resetToken } = await validateResetToken(token);
      if (!isValid) {
        return res.status(400).json({ error });
      }

      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const { error: authError } = await resetSupabase.auth.admin.updateUserById(resetToken.user_id, {
            password: newPassword
          });
          if (authError) {
            console.error('Supabase auth update password error:', authError);
          }
        } catch (authErr) {
          console.error('Failed to update Supabase Auth user password:', authErr);
        }
      }

      const { error: dbError } = await resetSupabase
        .from('users')
        .update({ password_hash: hashPasswordForStorage(newPassword) })
        .eq('id', resetToken.user_id);

      if (dbError) {
        console.error('Database password update error:', dbError);
        throw dbError;
      }

      const { error: tokenUpdateError } = await resetSupabase
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

// ════════════════════════════════════════════════════════════════════════
// ─── verify-recovery-token.js (action=verify-token) ───
// ════════════════════════════════════════════════════════════════════════

async function handleVerifyToken(req, res) {
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

// ════════════════════════════════════════════════════════════════════════
// ─── dispatch ───
// ════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action;
  if (action === 'request-reset') return handleRequestReset(req, res);
  if (action === 'reset') return handleResetPassword(req, res);
  if (action === 'verify-token') return handleVerifyToken(req, res);
  return res.status(400).json({ error: `Unknown or missing action: ${action}` });
}
