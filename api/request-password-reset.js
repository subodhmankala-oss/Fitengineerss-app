import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Please use POST.' });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const confirmationMessage = "If that email is registered, you'll receive a password reset link shortly.";

  try {
    // 1. Look up the email in the public.users table
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (findError) {
      console.error('Database user query error:', findError);
      // Still return success message to prevent user enumeration
      return res.status(200).json({ success: true, message: confirmationMessage });
    }

    if (user) {
      // 2. Generate a random 32-byte hex token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour expiration

      // 3. Insert a row into password_reset_tokens
      const { error: insertError } = await supabase
        .from('password_reset_tokens')
        .insert({
          user_id: user.id,
          token: token,
          expires_at: expiresAt,
          used: false
        });

      if (insertError) {
        console.error('Failed to insert reset token:', insertError);
        return res.status(200).json({ success: true, message: confirmationMessage });
      }

      // 4. Send email using Resend / SendGrid or Log to console
      const resetLink = `https://fitengineerss-app.vercel.app/reset-password?token=${token}`;
      console.log(`[DEBUG] Password reset link generated for ${email}: ${resetLink}`);

      const emailSent = await sendResetEmail(email, resetLink);
      if (!emailSent) {
        console.warn(`[WARNING] Transactional email provider is not configured or failed. Reset Link: ${resetLink}`);
      }
    }

    return res.status(200).json({ success: true, message: confirmationMessage });
  } catch (err) {
    console.error('Request password reset error:', err);
    return res.status(200).json({ success: true, message: confirmationMessage });
  }
}

async function sendResetEmail(email, resetLink) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const sendgridApiKey = process.env.SENDGRID_API_KEY;

  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
          from: 'Fitengineers <onboarding@resend.dev>',
          to: [email],
          subject: 'Reset Your Fitengineers Password',
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
              <h2 style="color: #6d28d9; margin-top: 0;">Fitengineers Password Reset</h2>
              <p>Hello,</p>
              <p>You requested a password reset for your Client account on Fitengineers.</p>
              <p>Click the link below to set a new password (valid for 1 hour):</p>
              <p style="margin: 24px 0;">
                <a href="${resetLink}" style="background-color: #6d28d9; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
              </p>
              <p style="font-size: 12px; color: #64748b;">Or copy this link: <br/>${resetLink}</p>
              <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">If you did not request this, please ignore this email.</p>
            </div>
          `
        })
      });
      const data = await response.json();
      console.log('Resend send email response:', data);
      return response.ok;
    } catch (e) {
      console.error('Resend email dispatch failure:', e);
    }
  }

  if (sendgridApiKey) {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sendgridApiKey}`
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: 'support@fitengineers.com', name: 'Fitengineers' },
          subject: 'Reset Your Fitengineers Password',
          content: [{
            type: 'text/html',
            value: `
              <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                <h2 style="color: #6d28d9; margin-top: 0;">Fitengineers Password Reset</h2>
                <p>Hello,</p>
                <p>You requested a password reset for your Client account on Fitengineers.</p>
                <p>Click the link below to set a new password (valid for 1 hour):</p>
                <p style="margin: 24px 0;">
                  <a href="${resetLink}" style="background-color: #6d28d9; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
                </p>
                <p style="font-size: 12px; color: #64748b;">Or copy this link: <br/>${resetLink}</p>
                <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">If you did not request this, please ignore this email.</p>
              </div>
            `
          }]
        })
      });
      return response.ok;
    } catch (e) {
      console.error('SendGrid email dispatch failure:', e);
    }
  }

  return false;
}
