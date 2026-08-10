import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Folded into this route (rather than a separate /api/unsubscribe
  // function) to stay under Vercel's Hobby-plan serverless function count
  // limit — this file already owns the full push_subscriptions row
  // lifecycle, so a DELETE here is a natural fit, not a separate endpoint.
  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required.' });
    try {
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Push Subscription Removal Error:', error);
      return res.status(500).json({ error: 'Failed to unsubscribe.', details: error.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Please use POST or DELETE.' });
  }

  const { userName, subscription, userId } = req.body;

  if (!userName || !subscription) {
    return res.status(400).json({ error: 'userName and subscription parameters are required.' });
  }

  // Only accept a real UUID for user_id (targeted-notification key); ignore
  // stale/mock ids so they never poison the column.
  const validUserId = (typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
    ? userId
    : null;

  try {
    const endpoint = subscription.endpoint;

    // Upsert on `endpoint` (its UNIQUE column) instead of a separate
    // check-then-insert-or-update — that older two-step version had a race:
    // two registrations for the same endpoint landing close together (a
    // retry racing the original call, multiple tabs, the PWA re-registering
    // on every foreground) could both pass the "not found" SELECT before
    // either INSERT committed, so the second INSERT hit the endpoint UNIQUE
    // constraint and 500'd with Postgres code 23505. Confirmed in production
    // logs (2026-08-10). A single upsert makes this atomic — Postgres
    // resolves the conflict itself, no read-then-write window to lose.
    const upsertFields = { user_name: userName, endpoint, subscription };
    if (validUserId) upsertFields.user_id = validUserId;

    const { error: upsertError } = await supabase
      .from('push_subscriptions')
      .upsert(upsertFields, { onConflict: 'endpoint' });

    if (upsertError) {
      // If the table doesn't exist, tell the user how to create it (same
      // guidance the old check-first path gave).
      if (upsertError.message?.includes('does not exist')) {
        return res.status(500).json({
          error: 'Supabase push_subscriptions table does not exist. Please create the table in your Supabase SQL Editor.',
          sql: `
            CREATE TABLE IF NOT EXISTS push_subscriptions (
              id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
              user_name TEXT NOT NULL,
              endpoint TEXT NOT NULL UNIQUE,
              subscription JSONB NOT NULL,
              created_at TIMESTAMPTZ DEFAULT now()
            );
          `
        });
      }
      throw upsertError;
    }

    return res.status(200).json({ success: true, message: 'Push subscription registered successfully.' });
  } catch (error) {
    console.error('Push Subscription Registration Error:', error);
    return res.status(500).json({ error: 'Failed to register subscription.', details: error.message });
  }
}
