// Resend delivery-event webhook — makes email delivery visible.
//
// Context: password reset emails are sent via Resend's HTTP API
// (api/request-password-reset.js). Resend returning 200 only means "queued";
// whether Gmail then delivers, bounces, or spam-folders the message was
// previously invisible — some coaches reported never receiving reset links
// with no error anywhere. This endpoint receives Resend's delivery events and
// stores them durably in public.email_events (Vercel log retention is too
// short to debug with).
//
// Setup (one-time, Resend dashboard → Webhooks → Add webhook):
//   URL:    https://fitengineerss-app.vercel.app/api/resend-webhook?key=<RESEND_WEBHOOK_KEY>
//   Events: email.sent, email.delivered, email.bounced, email.complained,
//           email.delivery_delayed
// Then add RESEND_WEBHOOK_KEY (any long random string, e.g. `openssl rand -hex 32`)
// to Vercel env vars and redeploy. Requests without the matching ?key= are
// rejected, so third parties can't inject fake events.
//
// Table DDL (run once in Supabase SQL editor):
//   create table if not exists public.email_events (
//     id uuid primary key default gen_random_uuid(),
//     created_at timestamptz not null default now(),
//     event_type text not null,
//     email_id text,
//     recipient text,
//     subject text,
//     payload jsonb
//   );
//   alter table public.email_events enable row level security;
//   -- No policies on purpose: only the service role (these API functions) can touch it.
//
// Diagnosis queries this enables:
//   - reset requested but no delivered/bounced event  → stuck or dropped in transit
//   - email.bounced / email.complained               → Gmail rejected it (reason in payload)
//   - reset.no_auth_user                             → coach has no auth account; can never get a link

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const expectedKey = process.env.RESEND_WEBHOOK_KEY;
  if (!expectedKey) {
    console.error('resend-webhook: RESEND_WEBHOOK_KEY not configured, rejecting');
    return res.status(503).json({ error: 'Webhook not configured' });
  }
  if ((req.query && req.query.key) !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ccevszxzxtwwvreittdm.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error('resend-webhook: SUPABASE_SERVICE_ROLE_KEY not configured');
    return res.status(503).json({ error: 'Storage not configured' });
  }

  // Resend event shape: { type: 'email.bounced', created_at, data: { email_id, to: [...], subject, ... } }
  const event = req.body || {};
  const data = event.data || {};
  const recipient = Array.isArray(data.to) ? data.to.join(',') : (data.to || null);

  console.log('resend-webhook event:', event.type, 'email_id:', data.email_id, 'to:', recipient);

  try {
    const insertResp = await fetch(`${supabaseUrl}/rest/v1/email_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        event_type: event.type || 'unknown',
        email_id: data.email_id || null,
        recipient,
        subject: data.subject || null,
        payload: event
      })
    });
    if (!insertResp.ok) {
      const errBody = await insertResp.text().catch(() => '');
      console.error('resend-webhook: email_events insert failed:', insertResp.status, errBody.slice(0, 300));
      // Still return 200 — Resend retries on non-2xx and the event is already in our logs above.
    }
  } catch (err) {
    console.error('resend-webhook: insert error:', err.message || err);
  }

  return res.status(200).json({ received: true });
}
